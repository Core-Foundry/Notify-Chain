import { v4 as uuidv4 } from 'uuid';
import logger from '../utils/logger';
import { generateRequestId } from '../utils/request-id';
import { ScheduledNotificationRepository } from './scheduled-notification-repository';
import { ScheduledNotification, NotificationStatus } from '../types/scheduled-notification';
import { DiscordNotificationService } from './discord-notification';
import { WebhookDeliveryService } from './webhook-delivery-service';
import { getWorkerManager } from './worker-manager';
import {
  PartialRetryBackoffConfig,
  RetryBackoffConfig,
  RETRY_BACKOFF_DEFAULTS,
  calculateBackoffDelay,
  resolveRetryBackoffConfig,
} from '../utils/retry-backoff-config';

export interface RetrySchedulerConfig {
  /** Whether the scheduler is enabled. */
  enabled: boolean;
  /** How often to poll for due retries (ms). */
  pollIntervalMs: number;
  /** How long to hold a distributed lock before it is considered stale (ms). */
  lockTimeoutMs: number;
  /** Unique identifier for this scheduler instance (used in distributed locking). */
  processorId?: string;
  /** Maximum notifications to process per poll cycle. */
  batchSize: number;
  /**
   * Provider-independent retry backoff configuration.
   * All fields are optional; defaults from `RETRY_BACKOFF_DEFAULTS` are applied
   * to any field the caller omits, and the merged result is strictly validated
   * via `validateRetryBackoffConfig`.
   */
  backoff: PartialRetryBackoffConfig;
}

/**
 * Defaults for the DB-backed scheduler. Scheduling-specific fields are
 * retained here; backoff defaults are inherited from the shared
 * `RETRY_BACKOFF_DEFAULTS` and can still be overridden per-instance via
 * `RetrySchedulerConfig.backoff`.
 */
export const RETRY_SCHEDULER_DEFAULTS: Readonly<Omit<RetrySchedulerConfig, 'backoff'> & {
  backoff: Readonly<RetryBackoffConfig>;
}> = {
  enabled: true,
  pollIntervalMs: 15_000,
  lockTimeoutMs: 60_000,
  batchSize: 10,
  backoff: { ...RETRY_BACKOFF_DEFAULTS },
};

/**
 * DB-backed retry scheduler.
 *
 * On each poll cycle it:
 *  1. Atomically claims PENDING notifications with retry_count > 0 that are due
 *     (next_retry_at ≤ now) using the repository's pessimistic lock.
 *  2. Re-executes the notification delivery.
 *  3. On success → marks COMPLETED.
 *  4. On failure  → if retries remain, computes next backoff delay, writes
 *     next_retry_at, and resets status to PENDING.  Otherwise marks FAILED.
 *
 * The distributed lock (processor_id + lock_expires_at) prevents two concurrent
 * scheduler instances from retrying the same notification.
 */
export class RetryScheduler {
  private readonly config: Omit<RetrySchedulerConfig, 'backoff'> & {
    backoff: Readonly<RetryBackoffConfig>;
  };
  private readonly processorId: string;
  private repository: ScheduledNotificationRepository;
  private discordService: DiscordNotificationService | null;
  private webhookDeliveryService: WebhookDeliveryService;
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  constructor(
    repository: ScheduledNotificationRepository,
    config: Partial<RetrySchedulerConfig> = {},
    discordService?: DiscordNotificationService | null,
    webhookDeliveryService?: WebhookDeliveryService,
  ) {
    const inherited = { ...RETRY_SCHEDULER_DEFAULTS, ...config } as RetrySchedulerConfig;
    const backoff = resolveRetryBackoffConfig(inherited.backoff);
    this.config = {
      enabled: inherited.enabled,
      pollIntervalMs: inherited.pollIntervalMs,
      lockTimeoutMs: inherited.lockTimeoutMs,
      processorId: inherited.processorId,
      batchSize: inherited.batchSize,
      backoff,
    };
    this.processorId = this.config.processorId ?? `retry-${uuidv4()}`;
    this.repository = repository;
    this.discordService = discordService ?? null;
    this.webhookDeliveryService = webhookDeliveryService ?? new WebhookDeliveryService();
  }

  async start(): Promise<void> {
    if (this.running) {
      logger.warn('RetryScheduler already running', { processorId: this.processorId });
      return;
    }
    if (!this.config.enabled) {
      logger.info('RetryScheduler is disabled');
      return;
    }

    this.running = true;
    logger.info('RetryScheduler started', {
      processorId: this.processorId,
      pollIntervalMs: this.config.pollIntervalMs,
      initialDelayMs: this.config.backoff.initialDelayMs,
      multiplier: this.config.backoff.multiplier,
      maxDelayMs: this.config.backoff.maxDelayMs,
      maxRetries: this.config.backoff.maxRetries,
      jitter: this.config.backoff.jitter,
    });

    await this.repository.recoverStaleLocks();
    this.scheduleNextPoll();
  }

  async stop(): Promise<void> {
    if (!this.running) return;
    this.running = false;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }

    // Wait for all active jobs to complete
    const workerManager = getWorkerManager();
    await workerManager.initiateGracefulShutdown();

    logger.info('RetryScheduler stopped', { processorId: this.processorId });
  }

  /** Exposed for testing. */
  async runOnce(): Promise<void> {
    await this.processDueRetries();
  }

  private scheduleNextPoll(): void {
    if (!this.running) return;
    this.timer = setTimeout(async () => {
      await this.processDueRetries();
      this.scheduleNextPoll();
    }, this.config.pollIntervalMs);
  }

  private async processDueRetries(): Promise<void> {
    const requestId = generateRequestId();

    try {
      await this.repository.recoverStaleLocks(requestId);

      const notifications = await this.repository.fetchDueRetries(
        this.processorId,
        this.config.lockTimeoutMs,
        this.config.batchSize,
        requestId
      );

      if (notifications.length === 0) return;

      // Check if shutdown is in progress - don't accept new jobs
      const workerManager = getWorkerManager();
      if (workerManager.isShutdownInProgress()) {
        logger.info('Shutdown in progress - releasing unprocessed retries', {
          requestId,
          count: notifications.length,
        });
        // Release locks on unprocessed retries
        for (const notification of notifications) {
          await this.repository.markAsFailedOrRetry(
            notification.id!,
            new Error('Retry scheduler shutting down'),
            notification.retryCount,
            notification.maxRetries
          );
        }
        return;
      }

      logger.info('RetryScheduler processing batch', {
        requestId,
        processorId: this.processorId,
        count: notifications.length,
      });

      for (const notification of notifications) {
        const jobId = `retry-${notification.id}`;
        if (!workerManager.startJob(jobId)) {
          // Shutdown is in progress, don't process new jobs
          logger.info('Job rejected - retry scheduler shutting down', { jobId });
          await this.repository.markAsFailedOrRetry(
            notification.id!,
            new Error('Retry scheduler shutting down'),
            notification.retryCount,
            notification.maxRetries
          );
          continue;
        }

        try {
          await this.processRetry(notification, requestId);
        } finally {
          workerManager.completeJob(jobId);
        }
      }
    } catch (err) {
      logger.error('RetryScheduler poll error', { requestId, error: err });
    }
  }

  private async processRetry(
    notification: ScheduledNotification,
    requestId: string
  ): Promise<void> {
    const priorFailures = notification.retryCount;
    const executionAttempt = priorFailures + 1;
    const startMs = Date.now();

    logger.info('Retrying notification', {
      requestId,
      id: notification.id,
      type: notification.notificationType,
      attempt: executionAttempt,
      maxRetries: notification.maxRetries,
    });

    try {
      const success = await this.deliver(notification, requestId);
      const durationMs = Date.now() - startMs;

      if (success) {
        await this.repository.markAsCompleted(notification.id!, requestId);
        await this.repository.logExecution({
          scheduledNotificationId: notification.id!,
          executionAttempt,
          executionTime: new Date(),
          status: 'SUCCESS',
          durationMs,
        });
        logger.info('Retry succeeded', { requestId, id: notification.id, attempt: executionAttempt });
        return;
      }

      throw new Error('Delivery returned false');
    } catch (err) {
      const durationMs = Date.now() - startMs;
      const error = err as Error;
      const isFinalAttempt = priorFailures + 1 >= notification.maxRetries;

      const nextRetryAt = isFinalAttempt
        ? undefined
        : new Date(Date.now() + calculateBackoffDelay(priorFailures, this.config.backoff));

      await this.repository.markAsFailedOrRetry(
        notification.id!,
        error,
        priorFailures,
        notification.maxRetries,
        nextRetryAt
      );

      await this.repository.logExecution({
        scheduledNotificationId: notification.id!,
        executionAttempt,
        executionTime: new Date(),
        status: isFinalAttempt ? 'FAILED' : 'RETRY',
        errorMessage: error.message,
        durationMs,
      });

      if (isFinalAttempt) {
        logger.error('Notification permanently failed after max retries', {
          requestId,
          id: notification.id,
          totalAttempts: executionAttempt,
        });
      } else {
        logger.warn('Retry failed, scheduling next attempt', {
          requestId,
          id: notification.id,
          attempt: executionAttempt,
          nextRetryAt: nextRetryAt?.toISOString(),
        });
      }
    }
  }

  private async deliver(
    notification: ScheduledNotification,
    requestId: string
  ): Promise<boolean> {
    const payload = JSON.parse(notification.payload);

    switch (notification.notificationType) {
      case 'discord':
        if (!this.discordService) throw new Error('Discord service not configured');
        return this.discordService.sendEventNotification(
          payload.event,
          payload.contractConfig,
          `retry-${notification.id}-${requestId}`
        );

      case 'webhook': {
        const targetUrl: string = notification.targetRecipient;
        if (!targetUrl) throw new Error('Webhook notification missing targetRecipient URL');
        const result = await this.webhookDeliveryService.deliver(
          targetUrl,
          payload,
          `retry-${notification.id}-${requestId}`,
        );
        if (!result.success) {
          // Surface the specific reason so it lands in markAsFailedOrRetry's error details
          throw new Error(result.errorReason ?? `Webhook delivery failed (HTTP ${result.statusCode ?? 'unknown'})`);
        }
        return true;
      }

      default:
        throw new Error(`Unsupported notification type: ${notification.notificationType}`);
    }
  }
}
