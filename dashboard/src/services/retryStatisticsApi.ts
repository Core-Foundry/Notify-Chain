import type { RetryStatistics } from '../types/retryStatistics';
import { getEventsApiBaseUrl } from '../config/eventsApiUrl';

const BASE_URL = getEventsApiBaseUrl();

export async function fetchRetryStatistics(): Promise<RetryStatistics> {
  const response = await fetch(`${BASE_URL}/api/schedule/retry-statistics`);
  if (!response.ok) {
    throw new Error(`Failed to fetch retry statistics: ${response.status}`);
  }
  return response.json() as Promise<RetryStatistics>;
}

/** Deterministic mock used when the API is unavailable (dev / offline). */
export function generateMockRetryStatistics(): RetryStatistics {
  return {
    totalNotifications: 48,
    totalRetryAttempts: 27,
    notificationsWithRetries: 14,
    permanentFailures: 5,
    recoveredAfterRetry: 9,
    averageRetriesPerNotification: 0.56,
    maxObservedRetryCount: 3,
    retryRate: 14 / 48,
    distribution: [
      { retryCount: 0, count: 34, successCount: 30, failureCount: 4 },
      { retryCount: 1, count: 8, successCount: 6, failureCount: 2 },
      { retryCount: 2, count: 4, successCount: 2, failureCount: 2 },
      { retryCount: 3, count: 2, successCount: 1, failureCount: 1 },
    ],
  };
}
