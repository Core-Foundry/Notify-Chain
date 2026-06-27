/**
 * Resolves the listener API base URL from the Vite environment.
 * Isolated so Jest can replace this module via moduleNameMapper.
 */
export function getEventsApiBaseUrl(): string {
  return import.meta.env?.VITE_EVENTS_API_URL ?? 'http://localhost:8787';
}
