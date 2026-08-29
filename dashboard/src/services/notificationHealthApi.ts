import type {
  ScheduleStatsResponse,
  HealthResponse,
  NotificationAnalyticsSnapshot,
} from '../types/notificationHealth';

export async function fetchScheduleStats(apiUrl: string): Promise<ScheduleStatsResponse> {
  const response = await fetch(`${apiUrl}/api/schedule/stats`);
  if (!response.ok) {
    throw new Error(`Failed to fetch schedule stats: ${response.status}`);
  }
  return response.json() as Promise<ScheduleStatsResponse>;
}

export async function fetchHealth(apiUrl: string): Promise<HealthResponse> {
  const response = await fetch(`${apiUrl}/health`);
  if (!response.ok) {
    throw new Error(`Failed to fetch health: ${response.status}`);
  }
  return response.json() as Promise<HealthResponse>;
}

export async function fetchAnalytics(apiUrl: string): Promise<NotificationAnalyticsSnapshot> {
  const response = await fetch(`${apiUrl}/api/analytics`);
  if (!response.ok) {
    throw new Error(`Failed to fetch analytics: ${response.status}`);
  }
  return response.json() as Promise<NotificationAnalyticsSnapshot>;
}

export function resolveNotificationHealthUrl(eventsApiUrl: string): string {
  try {
    const url = new URL(eventsApiUrl);
    url.pathname = '';
    url.search = '';
    return url.toString();
  } catch {
    return 'http://localhost:8787';
  }
}
