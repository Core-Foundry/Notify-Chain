import { describe, it, expect } from '@jest/globals';
import {
  calculateRetryStatistics,
  buildRetryStatisticsPayload,
  type RetryAttemptRecord,
} from './retry-statistics';

describe('calculateRetryStatistics', () => {
  it('returns zeros for an empty record set', () => {
    const stats = calculateRetryStatistics([]);
    expect(stats.totalNotifications).toBe(0);
    expect(stats.totalRetryAttempts).toBe(0);
    expect(stats.averageRetriesPerNotification).toBe(0);
    expect(stats.retryRate).toBe(0);
    expect(stats.distribution).toEqual([]);
  });

  it('records retry counts and verifies aggregate calculations', () => {
    const records: RetryAttemptRecord[] = [
      { notificationId: 1, retryCount: 0, maxRetries: 3, status: 'COMPLETED' },
      { notificationId: 2, retryCount: 2, maxRetries: 3, status: 'COMPLETED' },
      { notificationId: 3, retryCount: 3, maxRetries: 3, status: 'FAILED' },
      { notificationId: 4, retryCount: 1, maxRetries: 3, status: 'COMPLETED' },
      { notificationId: 5, retryCount: 0, maxRetries: 3, status: 'FAILED' },
    ];

    const stats = calculateRetryStatistics(records);

    expect(stats.totalNotifications).toBe(5);
    expect(stats.totalRetryAttempts).toBe(6); // 0+2+3+1+0
    expect(stats.notificationsWithRetries).toBe(3);
    expect(stats.permanentFailures).toBe(2);
    expect(stats.recoveredAfterRetry).toBe(2); // ids 2 and 4
    expect(stats.averageRetriesPerNotification).toBeCloseTo(1.2);
    expect(stats.maxObservedRetryCount).toBe(3);
    expect(stats.retryRate).toBeCloseTo(0.6);

    expect(stats.distribution).toEqual([
      { retryCount: 0, count: 2, successCount: 1, failureCount: 1 },
      { retryCount: 1, count: 1, successCount: 1, failureCount: 0 },
      { retryCount: 2, count: 1, successCount: 1, failureCount: 0 },
      { retryCount: 3, count: 1, successCount: 0, failureCount: 1 },
    ]);
  });

  it('treats lowercase status values consistently', () => {
    const stats = calculateRetryStatistics([
      { notificationId: 'a', retryCount: 1, maxRetries: 2, status: 'completed' },
      { notificationId: 'b', retryCount: 2, maxRetries: 2, status: 'failed' },
    ]);

    expect(stats.recoveredAfterRetry).toBe(1);
    expect(stats.permanentFailures).toBe(1);
    expect(stats.totalRetryAttempts).toBe(3);
  });

  it('clamps negative retry counts to zero', () => {
    const stats = calculateRetryStatistics([
      { notificationId: 1, retryCount: -5, maxRetries: 3, status: 'COMPLETED' },
    ]);
    expect(stats.totalRetryAttempts).toBe(0);
    expect(stats.notificationsWithRetries).toBe(0);
  });
});

describe('buildRetryStatisticsPayload', () => {
  it('merges execution metrics and distribution into accessible statistics', () => {
    const payload = buildRetryStatisticsPayload({
      totalNotifications: 10,
      successfulFirstAttempt: 6,
      successfulAfterRetry: 2,
      permanentFailures: 2,
      totalRetryAttempts: 5,
      averageRetriesPerNotification: 0.5,
      distribution: [
        { retryCount: 0, successCount: 6, failureCount: 1 },
        { retryCount: 1, successCount: 1, failureCount: 0 },
        { retryCount: 2, successCount: 1, failureCount: 1 },
      ],
    });

    expect(payload.totalNotifications).toBe(10);
    expect(payload.totalRetryAttempts).toBe(5);
    expect(payload.recoveredAfterRetry).toBe(2);
    expect(payload.permanentFailures).toBe(2);
    expect(payload.notificationsWithRetries).toBe(3); // 1+0 + 1+1
    expect(payload.maxObservedRetryCount).toBe(2);
    expect(payload.retryRate).toBeCloseTo(0.3);
    expect(payload.distribution[0]).toEqual({
      retryCount: 0,
      count: 7,
      successCount: 6,
      failureCount: 1,
    });
  });
});
