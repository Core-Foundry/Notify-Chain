import logger from '../utils/logger';
import { EventProcessingQueue } from './event-processing-queue';
import { WorkerManager } from './worker-manager';
import { eventRegistry } from '../store/event-registry';
import { ScheduledNotificationRepository } from './scheduled-notification-repository';
import { pollingMetrics } from './polling-metrics';

export type ComponentStatus = 'healthy' | 'degraded' | 'unhealthy';

export interface QueueHealth {
  status: ComponentStatus;
  pendingJobs: number;
  stalledSince: number | null;
  deadLetterQueueDepth: number;
}

export interface WorkerHealth {
  status: ComponentStatus;
  activeWorkers: number;
  isShuttingDown: boolean;
}

export interface RegistryHealth {
  status: ComponentStatus;
  eventCount: number;
  lastIngestedAt: string | null;
  processingDelayMs: number | null;
}

export interface PollingHealth {
  /** ISO timestamp of the most recent successful poll, or null if none yet. */
  lastSuccessAt: string | null;
  /** ISO timestamp of the most recent failed poll, or null if none yet. */
  lastFailureAt: string | null;
  /** ISO timestamp of the most recent poll cycle (successful or not). */
  lastPollAt: string | null;
  /** Duration of the most recent poll cycle in milliseconds. */
  lastPollDurationMs: number | null;
  /** Whether the most recent poll cycle completed without error. */
  lastPollSucceeded: boolean | null;
  /** Total number of recorded poll cycles. */
  totalPolls: number;
  /** Number of successful poll cycles. */
  successfulPolls: number;
  /** Number of failed poll cycles. */
  failedPolls: number;
}

export interface HealthReport {
  status: ComponentStatus;
  timestamp: string;
  queue: QueueHealth;
  workers: WorkerHealth;
  registry: RegistryHealth;
  polling: PollingHealth;
}

export interface NotificationHealthMonitorOptions {
  /** How often to run a health check cycle in ms (default: 30_000). */
  intervalMs?: number;
  /** Number of consecutive poll cycles with queue depth unchanged before marking stalled (default: 3). */
  stallThresholdCycles?: number;
  /** Max processing delay before registry is considered degraded in ms (default: 60_000). */
  maxProcessingDelayMs?: number;
  /** Injected clock for tests. */
  now?: () => number;
  /** Optional repository used to surface DLQ depth in the health report. */
  repository?: ScheduledNotificationRepository | null;
}

/**
 * Continuously monitors the health of notification processing components:
 * queue depth, worker availability, stalled-job detection, and event registry lag.
 *
 * Call `start()` once and consume reports via `getLastReport()` or the
 * `'report'` event. Call `stop()` for graceful shutdown.
 */
export class NotificationHealthMonitor {
  private readonly intervalMs: number;
  private readonly stallThresholdCycles: number;
  private readonly maxProcessingDelayMs: number;
  private readonly now: () => number;

  private queue: EventProcessingQueue | null;
  private workerManager: WorkerManager | null;
  private repository: ScheduledNotificationRepository | null;

  private timer: ReturnType<typeof setInterval> | null = null;
  private lastReport: HealthReport | null = null;

  // Stall detection: track last observed queue depth and how many cycles it hasn't changed.
  private lastQueueDepth = -1;
  private stalledCycles = 0;
  private stalledSince: number | null = null;

  constructor(
    queue: EventProcessingQueue | null,
    workerManager: WorkerManager | null,
    options: NotificationHealthMonitorOptions = {},
  ) {
    this.queue = queue;
    this.workerManager = workerManager;
    this.repository = options.repository ?? null;
    this.intervalMs = options.intervalMs ?? 30_000;
    this.stallThresholdCycles = options.stallThresholdCycles ?? 3;
    this.maxProcessingDelayMs = options.maxProcessingDelayMs ?? 60_000;
    this.now = options.now ?? Date.now;
  }

  start(): void {
    if (this.timer !== null) return;
    this.timer = setInterval(() => {
      this.runCheck();
    }, this.intervalMs);
    // Run immediately so first report is available without waiting one interval.
    this.runCheck();
    logger.info('NotificationHealthMonitor started', { intervalMs: this.intervalMs });
  }

  stop(): void {
    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }
    logger.info('NotificationHealthMonitor stopped');
  }

  getLastReport(): HealthReport | null {
    return this.lastReport;
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private runCheck(): void {
    const queueHealth = this.checkQueue();
    const workerHealth = this.checkWorkers();
    const registryHealth = this.checkRegistry();
    const pollingHealth = this.checkPolling();

    const overallStatus = this.deriveOverallStatus(
      queueHealth.status,
      workerHealth.status,
      registryHealth.status,
    );

    const report: HealthReport = {
      status: overallStatus,
      timestamp: new Date(this.now()).toISOString(),
      queue: queueHealth,
      workers: workerHealth,
      registry: registryHealth,
      polling: pollingHealth,
    };

    this.lastReport = report;

    const logFn =
      overallStatus === 'healthy'
        ? logger.debug.bind(logger)
        : overallStatus === 'degraded'
          ? logger.warn.bind(logger)
          : logger.error.bind(logger);

    logFn('Health report generated', { status: overallStatus, report });
  }

  private checkQueue(): QueueHealth {
    if (!this.queue) {
      return { status: 'healthy', pendingJobs: 0, stalledSince: null, deadLetterQueueDepth: this.getDeadLetterQueueDepth() };
    }

    const pending = this.queue.pendingCount();

    if (pending > 0 && pending === this.lastQueueDepth) {
      this.stalledCycles++;
      if (this.stalledCycles >= this.stallThresholdCycles && this.stalledSince === null) {
        this.stalledSince = this.now();
        logger.warn('Event processing queue appears stalled', {
          pendingJobs: pending,
          stalledCycles: this.stalledCycles,
        });
      }
    } else {
      this.stalledCycles = 0;
      this.stalledSince = null;
    }

    this.lastQueueDepth = pending;

    let status: ComponentStatus = 'healthy';
    if (this.stalledSince !== null) {
      status = 'unhealthy';
    } else if (pending > 0) {
      status = 'degraded';
    }

    return { status, pendingJobs: pending, stalledSince: this.stalledSince, deadLetterQueueDepth: this.getDeadLetterQueueDepth() };
  }

  private getDeadLetterQueueDepth(): number {
    if (!this.repository) {
      return 0;
    }

    try {
      const stats = this.repository.getStats();
      return (stats as any).deadLetterQueue ?? 0;
    } catch (error) {
      logger.warn('Unable to determine dead letter queue depth', { error });
      return 0;
    }
  }

  private checkWorkers(): WorkerHealth {
    if (!this.workerManager) {
      return { status: 'healthy', activeWorkers: 0, isShuttingDown: false };
    }

    const activeWorkers = this.workerManager.getActiveJobCount();
    const isShuttingDown = this.workerManager.isShutdownInProgress();

    const status: ComponentStatus = isShuttingDown ? 'degraded' : 'healthy';

    return { status, activeWorkers, isShuttingDown };
  }

  private checkRegistry(): RegistryHealth {
    const eventCount = eventRegistry.count();
    const { lastIngestedAt: lastIngestedMs } = eventRegistry.getIngestionSnapshot();
    const lastIngestedAt = lastIngestedMs !== null ? new Date(lastIngestedMs).toISOString() : null;
    const processingDelayMs =
      lastIngestedMs !== null ? this.now() - lastIngestedMs : null;

    let status: ComponentStatus = 'healthy';
    if (processingDelayMs !== null && processingDelayMs > this.maxProcessingDelayMs) {
      status = 'degraded';
    }

    return { status, eventCount, lastIngestedAt, processingDelayMs };
  }

  private checkPolling(): PollingHealth {
    const snapshot = pollingMetrics.snapshot();

    return {
      lastSuccessAt: snapshot.lastSuccessAt,
      lastFailureAt: snapshot.lastFailureAt,
      lastPollAt: snapshot.lastPollAt,
      lastPollDurationMs: snapshot.lastPollDurationMs,
      lastPollSucceeded: snapshot.lastPollSucceeded,
      totalPolls: snapshot.totalPolls,
      successfulPolls: snapshot.successfulPolls,
      failedPolls: snapshot.failedPolls,
    };
  }

  private deriveOverallStatus(...statuses: ComponentStatus[]): ComponentStatus {
    if (statuses.includes('unhealthy')) return 'unhealthy';
    if (statuses.includes('degraded')) return 'degraded';
    return 'healthy';
  }
}
