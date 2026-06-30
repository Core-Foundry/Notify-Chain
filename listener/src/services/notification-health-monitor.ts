import logger from '../utils/logger';
import { EventProcessingQueue } from './event-processing-queue';
import { WorkerManager } from './worker-manager';
import { eventRegistry } from '../store/event-registry';

export type ComponentStatus = 'healthy' | 'degraded' | 'unhealthy';

export interface QueueHealth {
  status: ComponentStatus;
  pendingJobs: number;
  stalledSince: number | null;
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

export interface HealthReport {
  status: ComponentStatus;
  timestamp: string;
  queue: QueueHealth;
  workers: WorkerHealth;
  registry: RegistryHealth;
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
      return { status: 'healthy', pendingJobs: 0, stalledSince: null };
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

    return { status, pendingJobs: pending, stalledSince: this.stalledSince };
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

  private deriveOverallStatus(...statuses: ComponentStatus[]): ComponentStatus {
    if (statuses.includes('unhealthy')) return 'unhealthy';
    if (statuses.includes('degraded')) return 'degraded';
    return 'healthy';
  }
}
