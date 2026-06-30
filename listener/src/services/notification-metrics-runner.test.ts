import { NotificationMetricsRunner } from './notification-metrics-runner';
import { NotificationAnalyticsAggregator } from './notification-analytics-aggregator';
import { NotificationMetricsStore } from './notification-metrics-store';
import { AnalyticsConfig } from '../types';
import { NotificationType } from '../types/scheduled-notification';

jest.mock('../utils/logger', () => ({
  __esModule: true,
  default: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

describe('NotificationMetricsRunner', () => {
  const config: AnalyticsConfig = {
    enabled: true,
    maxRecords: 100,
    maxBuckets: 24,
    bucketSizeMs: 60 * 60 * 1000,
    persistIntervalMs: 60_000,
    snapshotRetentionDays: 7,
  };

  it('persists a summarized snapshot during a cycle', async () => {
    const aggregator = new NotificationAnalyticsAggregator();
    aggregator.record({
      notificationType: NotificationType.DISCORD,
      outcome: 'failure',
      durationMs: 50,
      timestamp: Date.now(),
      errorReason: 'timeout',
    });

    const store = {
      saveSnapshot: jest.fn().mockResolvedValue(1),
      purgeOlderThan: jest.fn().mockResolvedValue(0),
      getHistory: jest.fn().mockResolvedValue([]),
    } as unknown as NotificationMetricsStore;

    const runner = new NotificationMetricsRunner(config, store, aggregator);
    await runner.runCycle();

    expect(store.saveSnapshot).toHaveBeenCalledTimes(1);
    expect(store.purgeOlderThan).toHaveBeenCalledWith(7);
    expect(store.saveSnapshot).toHaveBeenCalledWith(
      expect.objectContaining({
        overall: expect.objectContaining({ failure: 1 }),
      }),
    );
  });

  it('does not start when disabled', async () => {
    const store = {
      saveSnapshot: jest.fn(),
      purgeOlderThan: jest.fn(),
      getHistory: jest.fn(),
    } as unknown as NotificationMetricsStore;

    const runner = new NotificationMetricsRunner(
      { ...config, enabled: false },
      store,
      new NotificationAnalyticsAggregator(),
    );

    await runner.start();
    expect(store.saveSnapshot).not.toHaveBeenCalled();
    await runner.stop();
  });
});
