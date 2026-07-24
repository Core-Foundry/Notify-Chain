import type { NotificationTimeline } from '../types/timeline';
import { getEventsApiBaseUrl } from '../config/eventsApiUrl';

const BASE_URL = getEventsApiBaseUrl();

export async function fetchTimeline(notificationId: number): Promise<NotificationTimeline> {
  const res = await fetch(`${BASE_URL}/api/notifications/${notificationId}/timeline`);
  if (!res.ok) throw new Error(`Failed to fetch timeline: ${res.status}`);
  return res.json() as Promise<NotificationTimeline>;
}
