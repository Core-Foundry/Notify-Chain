import logger from '../utils/logger';
import { AnalyticsConfig } from '../types';
import {
  NotificationAnalyticsAggregator,
  getNotificationAnalyticsAggregator,
} from './notification-analytics-aggregator';
import { NotificationMetricsStore } from './notification-metrics-store';

/**
 * Periodically snapshots in-memory delivery metrics and persists summarized
 * aggregates so historical metrics remain available beyond the rolling window.
 */
export class NotificationMetricsRunner {
  private timer: NodeJS.Timeout | null = null;
  private isRunning = false;

  constructor(
    private readonly config: AnalyticsConfig,
    private readonly store: NotificationMetricsStore,
    private readonly aggregator: NotificationAnalyticsAggregator = getNotificationAnalyticsAggregator(),
  ) {}

  async start(): Promise<void> {
    if (this.isRunning) {
      logger.warn('Notification metrics runner already running');
      return;
    }

    if (!this.config.enabled) {
      logger.info('Notification metrics runner is disabled in configuration');
      return;
    }

    this.isRunning = true;
    logger.info('Starting notification metrics runner', {
      persistIntervalMs: this.config.persistIntervalMs,
      snapshotRetentionDays: this.config.snapshotRetentionDays,
    });

    await this.runCycle();
    this.scheduleNext();
  }

  async stop(): Promise<void> {
    if (!this.isRunning) {
      return;
    }

    this.isRunning = false;

    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }

    logger.info('Notification metrics runner stopped');
  }

  private scheduleNext(): void {
    if (!this.isRunning) {
      return;
    }

    this.timer = setTimeout(async () => {
      try {
        await this.runCycle();
      } catch (error) {
        logger.error('Notification metrics runner cycle failed', { error });
      } finally {
        this.scheduleNext();
      }
    }, this.config.persistIntervalMs);

    this.timer.unref?.();
  }

  async runCycle(): Promise<void> {
    const snapshot = this.aggregator.snapshot();
    const snapshotId = await this.store.saveSnapshot(snapshot);
    const purged = await this.store.purgeOlderThan(this.config.snapshotRetentionDays);

    logger.info('Notification metrics aggregation cycle completed', {
      snapshotId,
      totalRecorded: snapshot.totalRecorded,
      overallTotal: snapshot.overall.total,
      successRate: snapshot.overall.successRate,
      purgedSnapshots: purged,
    });
  }
}
