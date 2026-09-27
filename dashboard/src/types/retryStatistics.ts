export interface RetryDistributionBucket {
  retryCount: number;
  count: number;
  successCount: number;
  failureCount: number;
}

export interface RetryStatistics {
  totalNotifications: number;
  totalRetryAttempts: number;
  notificationsWithRetries: number;
  permanentFailures: number;
  recoveredAfterRetry: number;
  averageRetriesPerNotification: number;
  maxObservedRetryCount: number;
  retryRate: number;
  distribution: RetryDistributionBucket[];
}

export function formatRetryRate(rate: number): string {
  return `${(rate * 100).toFixed(1)}%`;
}

export function formatAverageRetries(avg: number): string {
  return avg.toFixed(2);
}
