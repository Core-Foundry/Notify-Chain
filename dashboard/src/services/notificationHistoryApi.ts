import { getEventsApiBaseUrl } from '../config/eventsApiUrl';
import type {
  NotificationHistoryQuery,
  NotificationHistoryRecord,
  NotificationHistoryResponse,
} from '../types/notificationHistory';

function getApiKey(): string | undefined {
  // Isolated helper so Jest does not need to parse import.meta in this module.
  try {
    return (globalThis as { __VITE_EVENTS_API_KEY__?: string }).__VITE_EVENTS_API_KEY__;
  } catch {
    return undefined;
  }
}

function buildHistoryUrl(query: NotificationHistoryQuery = {}): string {
  const base = getEventsApiBaseUrl().replace(/\/$/, '');
  const params = new URLSearchParams();

  if (query.limit != null) params.set('limit', String(query.limit));
  if (query.offset != null) params.set('offset', String(query.offset));
  if (query.status && query.status !== 'all') params.set('status', query.status);
  if (query.startDate) params.set('startDate', query.startDate);
  if (query.endDate) params.set('endDate', query.endDate);

  const qs = params.toString();
  return `${base}/api/notifications/history${qs ? `?${qs}` : ''}`;
}

/** Deterministic mock history used when the listener API is unavailable. */
export function generateMockNotificationHistory(count = 12): NotificationHistoryRecord[] {
  const statuses: NotificationHistoryRecord['status'][] = ['SUCCESS', 'FAILED', 'RETRY', 'SUCCESS'];
  const now = Date.now();

  return Array.from({ length: count }, (_, index) => {
    const status = statuses[index % statuses.length];
    return {
      id: 1000 + index,
      scheduledNotificationId: 200 + (index % 5),
      executionAttempt: (index % 3) + 1,
      executionTime: new Date(now - index * 45 * 60 * 1000).toISOString(),
      status,
      errorMessage: status === 'FAILED' ? 'Delivery webhook timed out' : null,
      responseDuration: status === 'FAILED' ? null : 120 + index * 15,
    };
  });
}

export async function fetchNotificationHistory(
  query: NotificationHistoryQuery = {}
): Promise<NotificationHistoryResponse> {
  const url = buildHistoryUrl(query);
  const headers: Record<string, string> = { Accept: 'application/json' };
  const apiKey = getApiKey();
  if (apiKey) {
    headers['x-api-key'] = apiKey;
  }

  const res = await fetch(url, { headers });
  if (!res.ok) {
    throw new Error(`Failed to fetch notification history: ${res.status}`);
  }

  return res.json() as Promise<NotificationHistoryResponse>;
}
