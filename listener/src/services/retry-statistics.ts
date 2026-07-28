/**
 * Notification retry statistics — pure calculation helpers and aggregate types.
 * Used by the API layer and unit tests so retry math stays consistent.
 */

export interface RetryAttemptRecord {
  notificationId: number | string;
  retryCount: number;
  maxRetries: number;
  status: 'pending' | 'completed' | 'failed' | 'PROCESSING' | 'COMPLETED' | 'FAILED' | 'PENDING';
  succeededAfterRetry?: boolean;
}

export interface RetryStatistics {
  /** Total notifications considered. */
  totalNotifications: number;
  /** Sum of all recorded retry attempts across notifications. */
  totalRetryAttempts: number;
  /** Notifications that have been retried at least once. */
  notificationsWithRetries: number;
  /** Notifications that permanently failed after exhausting retries. */
  permanentFailures: number;
  /** Notifications that eventually succeeded after one or more retries. */
  recoveredAfterRetry: number;
  /** Average retries per notification (0 when empty). */
  averageRetriesPerNotification: number;
  /** Max retries observed on any single notification. */
  maxObservedRetryCount: number;
  /** Share of notifications that required at least one retry (0–1). */
  retryRate: number;
  /** Breakdown of counts keyed by retryCount. */
  distribution: Array<{
    retryCount: number;
    count: number;
    successCount: number;
    failureCount: number;
  }>;
}

function normalizeStatus(status: RetryAttemptRecord['status']): 'completed' | 'failed' | 'other' {
  const upper = String(status).toUpperCase();
  if (upper === 'COMPLETED' || upper === 'SUCCESS') return 'completed';
  if (upper === 'FAILED') return 'failed';
  return 'other';
}

/**
 * Compute retry statistics from a list of notification retry records.
 * Idempotent and side-effect free — safe for unit testing.
 */
export function calculateRetryStatistics(records: RetryAttemptRecord[]): RetryStatistics {
  if (records.length === 0) {
    return {
      totalNotifications: 0,
      totalRetryAttempts: 0,
      notificationsWithRetries: 0,
      permanentFailures: 0,
      recoveredAfterRetry: 0,
      averageRetriesPerNotification: 0,
      maxObservedRetryCount: 0,
      retryRate: 0,
      distribution: [],
    };
  }

  const byRetry = new Map<number, { count: number; successCount: number; failureCount: number }>();

  let totalRetryAttempts = 0;
  let notificationsWithRetries = 0;
  let permanentFailures = 0;
  let recoveredAfterRetry = 0;
  let maxObservedRetryCount = 0;

  for (const record of records) {
    const retryCount = Math.max(0, Number(record.retryCount) || 0);
    totalRetryAttempts += retryCount;
    if (retryCount > 0) notificationsWithRetries += 1;
    if (retryCount > maxObservedRetryCount) maxObservedRetryCount = retryCount;

    const status = normalizeStatus(record.status);
    if (status === 'failed') {
      permanentFailures += 1;
    } else if (status === 'completed' && (retryCount > 0 || record.succeededAfterRetry)) {
      recoveredAfterRetry += 1;
    }

    const bucket = byRetry.get(retryCount) ?? { count: 0, successCount: 0, failureCount: 0 };
    bucket.count += 1;
    if (status === 'completed') bucket.successCount += 1;
    if (status === 'failed') bucket.failureCount += 1;
    byRetry.set(retryCount, bucket);
  }

  const totalNotifications = records.length;
  const distribution = Array.from(byRetry.entries())
    .sort(([a], [b]) => a - b)
    .map(([retryCount, bucket]) => ({
      retryCount,
      count: bucket.count,
      successCount: bucket.successCount,
      failureCount: bucket.failureCount,
    }));

  return {
    totalNotifications,
    totalRetryAttempts,
    notificationsWithRetries,
    permanentFailures,
    recoveredAfterRetry,
    averageRetriesPerNotification: totalRetryAttempts / totalNotifications,
    maxObservedRetryCount,
    retryRate: notificationsWithRetries / totalNotifications,
    distribution,
  };
}

/**
 * Merge repository execution metrics + retry distribution into one accessible payload.
 */
export function buildRetryStatisticsPayload(input: {
  totalNotifications: number;
  successfulFirstAttempt: number;
  successfulAfterRetry: number;
  permanentFailures: number;
  totalRetryAttempts: number;
  averageRetriesPerNotification: number;
  distribution: Array<{ retryCount: number; successCount: number; failureCount: number }>;
}): RetryStatistics {
  const notificationsWithRetries = input.distribution
    .filter((d) => d.retryCount > 0)
    .reduce((sum, d) => sum + d.successCount + d.failureCount, 0);

  const maxObservedRetryCount = input.distribution.reduce(
    (max, d) => Math.max(max, d.retryCount),
    0
  );

  return {
    totalNotifications: input.totalNotifications,
    totalRetryAttempts: input.totalRetryAttempts,
    notificationsWithRetries,
    permanentFailures: input.permanentFailures,
    recoveredAfterRetry: input.successfulAfterRetry,
    averageRetriesPerNotification: input.averageRetriesPerNotification,
    maxObservedRetryCount,
    retryRate:
      input.totalNotifications > 0 ? notificationsWithRetries / input.totalNotifications : 0,
    distribution: input.distribution.map((d) => ({
      retryCount: d.retryCount,
      count: d.successCount + d.failureCount,
      successCount: d.successCount,
      failureCount: d.failureCount,
    })),
  };
}
