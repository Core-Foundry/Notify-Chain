/**
 * Test replacement for ../config/eventsApiUrl.
 */
export function getEventsApiBaseUrl(): string {
  return process.env.VITE_EVENTS_API_URL ?? 'http://localhost:8787';
}
