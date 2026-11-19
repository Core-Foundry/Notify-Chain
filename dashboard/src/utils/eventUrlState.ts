/**
 * Shareable event URLs (issue #1153).
 *
 * An event's stable URL is `<origin><path>?eventId=<id>#explorer`. Only the
 * event id is carried over: every other query parameter of the current page is
 * dropped, so a shared link can never leak tokens, keys or other credentials
 * that happened to be in the address bar.
 */

export const EVENT_ID_PARAM = 'eventId';
export const EVENT_ROUTE_HASH = 'explorer';

/** Event ids are opaque, but bounded and free of whitespace/control characters. */
const MAX_EVENT_ID_LENGTH = 256;
const EVENT_ID_PATTERN = /^[A-Za-z0-9._:/\-]+$/;

export function isValidEventId(value: string): boolean {
  return value.length > 0 && value.length <= MAX_EVENT_ID_LENGTH && EVENT_ID_PATTERN.test(value);
}

/** The raw `eventId` query value, trimmed; null when absent or empty. */
export function parseSelectedEventId(search: string): string | null {
  const eventId = new URLSearchParams(search).get(EVENT_ID_PARAM);
  return eventId?.trim() || null;
}

/** Stable, credential-free link to one event. */
export function buildEventShareUrl(
  eventId: string,
  location: Pick<Location, 'origin' | 'pathname'> = window.location,
): string {
  const url = new URL(location.pathname || '/', location.origin);
  url.searchParams.set(EVENT_ID_PARAM, eventId);
  url.hash = EVENT_ROUTE_HASH;
  return url.toString();
}

export type EventRouteResolution<T> =
  | { kind: 'none' }
  | { kind: 'pending'; eventId: string }
  | { kind: 'found'; eventId: string; event: T }
  | { kind: 'invalid'; eventId: string }
  | { kind: 'not-found'; eventId: string };

/**
 * Resolve the event a URL points at. `loaded` is false until the first event
 * fetch has finished, so a direct link is not reported missing before the
 * data it needs has arrived.
 */
export function resolveEventRoute<T extends { eventId: string }>(
  search: string,
  events: readonly T[],
  loaded: boolean,
): EventRouteResolution<T> {
  const eventId = parseSelectedEventId(search);
  if (!eventId) return { kind: 'none' };
  if (!isValidEventId(eventId)) return { kind: 'invalid', eventId };
  const event = events.find((candidate) => candidate.eventId === eventId);
  if (event) return { kind: 'found', eventId, event };
  return loaded ? { kind: 'not-found', eventId } : { kind: 'pending', eventId };
}
