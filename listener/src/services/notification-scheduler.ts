import { v4 as uuidv4 } from 'uuid';
import logger from '../utils/logger';
import { generateRequestId } from '../utils/request-id';
import { ScheduledNotificationRepository } from './scheduled-notification-repository';
import { SchedulerConfig, ScheduledNotification } from '../types/scheduled-notification';
import { DiscordNotificationService } from './discord-notification';
import { BatchValidationService } from './batch-validation-service';
import { NotificationChannel } from '../utils/batch-validator';
import { getWorkerManager } from './worker-manager';
import { getJobMonitor } from './job-monitor';
import { ProviderRegistry, getProviderRegistry } from './provider-registry';
import { verifyPayloadIntegrity } from '../utils/payload-integrity';

/**
 * Background scheduler that processes scheduled notifications
 * Features:
 * - Distributed lock to prevent race conditions
 * - Automatic recovery of stale locks
 * - Retry logic with exponential backoff
 * - Catch-up for missed schedules after downtime
 */
export class NotificationScheduler {
  private repository: ScheduledNotificationRepository;
  private discordService: DiscordNotificationService | null;
  private config: SchedulerConfig;
  private timer: NodeJS.Timeout | null = null;
  private isRunning: boolean = false;
  private processorId: string;
  private batchValidator: BatchValidationService;
  /**
   * Provider registry used for all notification dispatch.
   * When not supplied the module-level singleton is used.
   */
  private providerRegistry: ProviderRegistry;

  constructor(
    repository: ScheduledNotificationRepository,
    config: SchedulerConfig,
    discordService?: DiscordNotificationService | null,
    batchValidator?: BatchValidationService,
    providerRegistry?: ProviderRegistry
  ) {
    this.repository = repository;
    this.config = { retryDelayMs: 5_000, ...config };
    this.discordService = discordService ?? null;
    this.processorId = config.processorId || uuidv4();
    this.batchValidator = batchValidator ?? new BatchValidationService();
    this.providerRegistry = providerRegistry ?? getProviderRegistry();
  }

  /**
   * Start the scheduler
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      logger.warn('Scheduler already running');
      return;
    }

    if (!this.config.enabled) {
      logger.info('Scheduler is disabled in configuration');
      return;
    }

    this.isRunning = true;
    logger.info('Starting notification scheduler', {
      processorId: this.processorId,
      pollIntervalMs: this.config.pollIntervalMs,
      batchSize: this.config.batchSize,
    });

    // Recover stale locks on startup
    await this.repository.recoverStaleLocks();

    // Start processing loop
    this.scheduleNextPoll();
  }

  /**
   * Stop the scheduler gracefully
   * Waits for all in-flight jobs to complete before returning
   */
  async stop(): Promise<void> {
    if (!this.isRunning) {
      return;
    }

    logger.info('Stopping notification scheduler', { processorId: this.processorId });
    this.isRunning = false;

    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }

    // Wait for all active jobs to complete
    const workerManager = getWorkerManager();
    await workerManager.initiateGracefulShutdown();
  }

  /**
   * Schedule next poll cycle
   */
  private scheduleNextPoll(): void {
    if (!this.isRunning) return;

    this.timer = setTimeout(async () => {
      await this.processPendingNotifications();
      this.scheduleNextPoll();
    }, this.config.pollIntervalMs);
  }

  /**
   * Main processing loop
   */
  private async processPendingNotifications(): Promise<void> {
    const requestId = generateRequestId();
    const batchStart = Date.now();

    try {
      // Recover any stale locks from crashed processors
      await this.repository.recoverStaleLocks(requestId);

      // Fetch and lock pending notifications
      const notifications = await this.repository.fetchAndLockPendingNotifications(
        this.processorId,
        this.config.lockTimeoutMs,
        this.config.batchSize,
        requestId
      );

      if (notifications.length === 0) {
        logger.debug('Scheduler poll cycle complete', {
          requestId,
          processorId: this.processorId,
          count: 0,
          durationMs: Date.now() - batchStart,
        });
        return;
      }

      const batchRejection = this.batchValidator.rejectIfInvalid(
        this.toValidationBatch(notifications)
      );

      if (batchRejection) {
        logger.error('Scheduled notification batch rejected by validation', {
          requestId,
          processorId: this.processorId,
          errors: batchRejection.errors,
        });

        for (const notification of notifications) {
          await this.repository.markAsFailedOrRetry(
            notification.id!,
            new Error(`Batch validation failed: ${batchRejection.errors.map((e) => e.message).join('; ')}`),
            notification.retryCount,
            notification.maxRetries
          );
        }
        return;
      }

      logger.info('Processing batch of scheduled notifications', {
        requestId,
        count: notifications.length,
        processorId: this.processorId,
      });

      // Check if shutdown is in progress - don't accept new jobs
      const workerManager = getWorkerManager();
      if (workerManager.isShutdownInProgress()) {
        logger.info('Shutdown in progress - releasing unprocessed notifications', {
          requestId,
          count: notifications.length,
        });
        // Release locks on unprocessed notifications
        for (const notification of notifications) {
          await this.repository.markAsFailedOrRetry(
            notification.id!,
            new Error('Scheduler shutting down'),
            notification.retryCount,
            notification.maxRetries
          );
        }
        return;
      }

      // Process each notification with job tracking + monitoring
      const jobMonitor = getJobMonitor();
      for (const notification of notifications) {
        const jobId = `notification-${notification.id}`;
        if (!workerManager.startJob(jobId)) {
          // Shutdown is in progress, don't process new jobs
          logger.info('Job rejected - scheduler shutting down', { jobId });
          await this.repository.markAsFailedOrRetry(
            notification.id!,
            new Error('Scheduler shutting down'),
            notification.retryCount,
            notification.maxRetries
          );
          continue;
        }

        jobMonitor.startJob(jobId, 'scheduled-notification', {
          notificationId: notification.id,
          type: notification.notificationType,
          requestId,
        });

        try {
          await this.processNotification(notification, requestId, jobId);
        } finally {
          workerManager.completeJob(jobId);
        }
      }

      logger.info('Scheduler batch complete', {
        requestId,
        processorId: this.processorId,
        count: notifications.length,
        durationMs: Date.now() - batchStart,
      });
    } catch (error) {
      logger.error('Error in scheduler processing loop', {
        requestId,
        error,
        processorId: this.processorId,
        durationMs: Date.now() - batchStart,
      });
    }
  }

  /**
   * Process a single notification
   */
  private async processNotification(
    notification: ScheduledNotification,
    requestId: string,
    jobId?: string
  ): Promise<void> {
    const startTime = Date.now();
    const executionAttempt = notification.retryCount + 1;
    const jobMonitor = getJobMonitor();

    try {
      logger.info('Processing scheduled notification', {
        requestId,
        id: notification.id,
        type: notification.notificationType,
        executeAt: notification.executeAt,
        attempt: executionAttempt,
      });

      // Check if notification is within timing buffer
      const now = new Date();
      const timeDiff = now.getTime() - notification.executeAt.getTime();

      if (timeDiff < -this.config.timingBufferMs) {
        // Notification is not yet due (clock skew or early fetch)
        logger.warn('Notification not yet due, releasing lock', {
          requestId,
          id: notification.id,
          executeAt: notification.executeAt,
          now,
        });
        await this.repository.markAsFailedOrRetry(
          notification.id!,
          new Error('Not yet due for execution'),
          notification.retryCount,
          notification.maxRetries
        );
        if (jobId) {
          jobMonitor.failJob(jobId, 'Not yet due for execution', {
            notificationId: notification.id,
          });
        }
        return;
      }

      if (timeDiff > this.config.timingBufferMs) {
        logger.warn('Missed scheduled notification detected; dispatching catch-up delivery', {
          requestId,
          id: notification.id,
          executeAt: notification.executeAt,
          now,
          missedByMs: timeDiff,
        });
      }

      // Verify payload integrity before executing
      const secret = process.env.PAYLOAD_INTEGRITY_SECRET;
      if (secret) {
        if (!notification.payloadHash) {
          logger.warn('Payload integrity check skipped — no hash stored', {
            requestId,
            id: notification.id,
          });
        } else if (!verifyPayloadIntegrity(notification.payload, notification.payloadHash, secret)) {
          logger.error('Payload integrity verification failed — rejecting notification', {
            requestId,
            id: notification.id,
            type: notification.notificationType,
          });
          await this.repository.markAsFailedOrRetry(
            notification.id!,
            new Error('Payload integrity check failed: hash mismatch'),
            notification.maxRetries, // exhaust retries — don't retry a tampered payload
            notification.maxRetries
          );
          if (jobId) {
            jobMonitor.failJob(jobId, 'Payload integrity check failed: hash mismatch', {
              notificationId: notification.id,
            });
          }
          return;
        }
      }

      // Execute notification based on type
      const success = await this.executeNotification(notification, requestId);

      const durationMs = Date.now() - startTime;

      if (success) {
        await this.repository.markAsCompleted(notification.id!, requestId);
        await this.repository.logExecution({
          scheduledNotificationId: notification.id!,
          executionAttempt,
          executionTime: new Date(),
          status: 'SUCCESS',
          durationMs,
        });

        if (jobId) {
          jobMonitor.completeJob(jobId, {
            notificationId: notification.id,
            durationMs,
          });
        }

        logger.info('Notification delivered successfully', {
          requestId,
          id: notification.id,
          type: notification.notificationType,
          durationMs,
        });
      } else {
        throw new Error('Notification delivery returned false');
      }
    } catch (error) {
      const durationMs = Date.now() - startTime;
      logger.error('Failed to process notification', {
        requestId,
        id: notification.id,
        error,
        attempt: executionAttempt,
        durationMs,
      });

      if (jobId) {
        jobMonitor.failJob(jobId, (error as Error).message, {
          notificationId: notification.id,
          attempt: executionAttempt,
        });
      }

      const willRetry = notification.retryCount + 1 < notification.maxRetries;
      const nextRetryAt = willRetry
        ? new Date(Date.now() + (this.config.retryDelayMs ?? 5_000))
        : undefined;

      await this.repository.markAsFailedOrRetry(
        notification.id!,
        error as Error,
        notification.retryCount,
        notification.maxRetries,
        nextRetryAt
      );

      await this.repository.logExecution({
        scheduledNotificationId: notification.id!,
        executionAttempt,
        executionTime: new Date(),
        status: willRetry ? 'RETRY' : 'FAILED',
        errorMessage: (error as Error).message,
        durationMs,
      });
    }
  }

  /**
   * Execute notification delivery based on type.
   *
   * The registry is queried first. When a registered provider exists for the
   * notification type it is used for all delivery — including Discord and
   * webhook notifications. This keeps the scheduler decoupled from any
   * concrete provider implementation.
   *
   * Legacy path: when no provider is registered for the type, the scheduler
   * falls back to the directly-injected `discordService` so that existing
   * deployments that have not yet bootstrapped the registry continue to work.
   */
  private async executeNotification(
    notification: ScheduledNotification,
    requestId: string
  ): Promise<boolean> {
    const payload = JSON.parse(notification.payload);
    const type = notification.notificationType;

    // ------------------------------------------------------------------
    // Registry-based dispatch (preferred path)
    // ------------------------------------------------------------------
    if (this.providerRegistry.has(type)) {
      const result = await this.providerRegistry.deliver(type, {
        payload,
        targetRecipient: notification.targetRecipient,
        notificationType: type,
        requestId,
      });

      if (result.degradedCapabilities.length > 0) {
        logger.info('Notification delivered with degraded capabilities', {
          requestId,
          id: notification.id,
          type,
          degradedCapabilities: result.degradedCapabilities,
        });
      }

      if (!result.success) {
        throw new Error(result.errorMessage ?? 'Provider delivery returned failure');
      }

      return true;
    }

    // ------------------------------------------------------------------
    // Legacy fallback: direct Discord service injection
    // ------------------------------------------------------------------
    switch (type) {
      case 'discord':
        if (!this.discordService) {
          throw new Error(
            'Discord service not configured and no Discord provider registered in the registry'
          );
        }
        return await this.discordService.sendEventNotification(
          payload.event,
          payload.contractConfig,
          `scheduler-${notification.id}-${requestId}`
        );

      case 'webhook':
        throw new Error(
          'Webhook delivery not yet implemented. Register a WebhookNotificationProvider in the ProviderRegistry.'
        );

      case 'email':
        throw new Error(
          'Email delivery not yet implemented. Register an email NotificationProvider in the ProviderRegistry.'
        );

      case 'sms':
        throw new Error(
          'SMS delivery not yet implemented. Register an SMS NotificationProvider in the ProviderRegistry.'
        );

      default:
        throw new Error(
          `Unsupported notification type: "${type}". Register a provider for this type in the ProviderRegistry.`
        );
    }
  }

  /**
   * Get scheduler statistics
   */
  async getStats() {
    return await this.repository.getStats();
  }

  private toValidationBatch(notifications: ScheduledNotification[]) {
    return notifications.map((notification) => ({
      id: String(notification.id),
      recipient: notification.targetRecipient,
      channel: notification.notificationType as NotificationChannel,
      message: this.extractValidationMessage(notification.payload),
    }));
  }

  private extractValidationMessage(payloadJson: string): string {
    try {
      const payload = JSON.parse(payloadJson);
      if (typeof payload.message === 'string' && payload.message.trim()) {
        return payload.message;
      }
      if (typeof payload.content === 'string' && payload.content.trim()) {
        return payload.content;
      }
      return JSON.stringify(payload).slice(0, 200);
    } catch {
      return payloadJson.slice(0, 200) || 'scheduled-notification';
    }
  }
}
