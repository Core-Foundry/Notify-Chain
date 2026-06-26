import type { NotificationTimeline } from '../types/timeline';

// globalThis.__VITE_EVENTS_API_URL__ is injected by Vite's define plugin (if configured).
// In Jest/Node it is undefined, so we fall back to the default.
declare const __VITE_EVENTS_API_URL__: string | undefined;

const BASE_URL: string =
  (typeof __VITE_EVENTS_API_URL__ !== 'undefined' ? __VITE_EVENTS_API_URL__ : '') ||
  'http://localhost:8787';

export async function fetchTimeline(notificationId: number): Promise<NotificationTimeline> {
  const res = await fetch(`${BASE_URL}/api/notifications/${notificationId}/timeline`);
  if (!res.ok) throw new Error(`Failed to fetch timeline: ${res.status}`);
  return res.json() as Promise<NotificationTimeline>;
}
