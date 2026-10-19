/**
 * API deprecation policy and sunset metadata (#993).
 *
 * Deprecated endpoints and fields need a predictable lifecycle: announced,
 * warned about in-band, and only then removed. This module provides the
 * mechanics a route uses to advertise that lifecycle without breaking clients:
 *
 * - A registry maps an endpoint (or field) to its deprecation date and sunset
 *   date, with an optional replacement and a migration note.
 * - `deprecationHeaders()` emits the `Deprecation`, `Sunset` and `Link`
 *   response headers defined by RFC 8594 / RFC 9745.
 * - `isSunset()` reports whether the removal date has passed so a route can
 *   start failing.
 *
 * The policy itself (minimum warning period, which stages exist) is data, so it
 * can be reviewed and changed without touching route code.
 */

/** Minimum warning period a deprecation must give before its sunset. */
export const MIN_WARNING_PERIOD_DAYS = 90;

export interface DeprecationEntry {
  /** Stable identifier, e.g. `GET /api/v1/events` or `body.legacyField`. */
  id: string;
  /** ISO-8601 date the deprecation was announced. */
  deprecatedAt: string;
  /** ISO-8601 date the resource will be removed. */
  sunsetAt: string;
  /** Suggested replacement, if any. */
  replacement?: string;
  /** Human-readable migration guidance. */
  migration?: string;
}

export class DeprecationPolicyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DeprecationPolicyError';
  }
}

function parseDate(value: string, field: string, id: string): Date {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) {
    throw new DeprecationPolicyError(`Invalid ${field} date "${value}" for "${id}".`);
  }
  return d;
}

/**
 * Validate a set of entries against the policy.
 *
 * Rules:
 * - `sunsetAt` must be strictly after `deprecatedAt`.
 * - The gap must be at least `minWarningDays`.
 * - Ids must be unique.
 *
 * Throws on the first violation so a bad policy fails at startup, not at
 * request time.
 */
export function validateDeprecations(
  entries: DeprecationEntry[],
  minWarningDays: number = MIN_WARNING_PERIOD_DAYS,
): void {
  const seen = new Set<string>();
  for (const e of entries) {
    if (seen.has(e.id)) {
      throw new DeprecationPolicyError(`Duplicate deprecation id "${e.id}".`);
    }
    seen.add(e.id);

    const deprecated = parseDate(e.deprecatedAt, 'deprecatedAt', e.id);
    const sunset = parseDate(e.sunsetAt, 'sunsetAt', e.id);

    if (sunset.getTime() <= deprecated.getTime()) {
      throw new DeprecationPolicyError(
        `sunsetAt must be after deprecatedAt for "${e.id}".`,
      );
    }
    const days = (sunset.getTime() - deprecated.getTime()) / 86_400_000;
    if (days < minWarningDays) {
      throw new DeprecationPolicyError(
        `Deprecation "${e.id}" gives ${Math.floor(days)} days of warning; policy requires at least ${minWarningDays}.`,
      );
    }
  }
}

export interface DeprecationHeaders {
  Deprecation?: string;
  Sunset?: string;
  Link?: string;
  Warning?: string;
}

/**
 * Build the response headers for a deprecated resource.
 *
 * `Deprecation` carries the announcement date as an IMF-fixdate (RFC 9745);
 * `Sunset` carries the removal date (RFC 8594). When a replacement is known a
 * `Link` header with `rel="deprecation"` points at it, and a `Warning` header
 * gives the human-readable migration note.
 */
export function deprecationHeaders(entry: DeprecationEntry): DeprecationHeaders {
  const deprecated = parseDate(entry.deprecatedAt, 'deprecatedAt', entry.id);
  const sunset = parseDate(entry.sunsetAt, 'sunsetAt', entry.id);

  const headers: DeprecationHeaders = {
    Deprecation: deprecated.toUTCString(),
    Sunset: sunset.toUTCString(),
  };

  if (entry.replacement) {
    headers.Link = `<${entry.replacement}>; rel="deprecation"; type="text/html"`;
  }
  if (entry.migration) {
    headers.Warning = `299 - "Deprecated: ${entry.migration}"`;
  }
  return headers;
}

/** Whether the resource's removal date has already passed. */
export function isSunset(entry: DeprecationEntry, now: Date = new Date()): boolean {
  return parseDate(entry.sunsetAt, 'sunsetAt', entry.id).getTime() <= now.getTime();
}

/** Days remaining until sunset (negative once passed). */
export function daysUntilSunset(entry: DeprecationEntry, now: Date = new Date()): number {
  const sunset = parseDate(entry.sunsetAt, 'sunsetAt', entry.id);
  return Math.floor((sunset.getTime() - now.getTime()) / 86_400_000);
}

/**
 * A reviewable registry of deprecations, keyed by id.
 *
 * `find()` matches an exact id first, then a field-style id (suffix match) so a
 * route can ask "is any field I expose deprecated?" with the field name alone.
 */
export class DeprecationRegistry {
  private readonly byId = new Map<string, DeprecationEntry>();

  constructor(
    entries: DeprecationEntry[],
    private readonly minWarningDays: number = MIN_WARNING_PERIOD_DAYS,
  ) {
    validateDeprecations(entries, minWarningDays);
    for (const e of entries) {
      this.byId.set(e.id, e);
    }
  }

  find(id: string): DeprecationEntry | undefined {
    if (this.byId.has(id)) {
      return this.byId.get(id);
    }
    for (const [key, entry] of this.byId) {
      if (key.endsWith(`.${id}`)) {
        return entry;
      }
    }
    return undefined;
  }

  /** All entries whose sunset has passed as of `now`. */
  sunsetEntries(now: Date = new Date()): DeprecationEntry[] {
    return [...this.byId.values()].filter((e) => isSunset(e, now));
  }

  /** All entries still inside their warning window. */
  activeEntries(now: Date = new Date()): DeprecationEntry[] {
    return [...this.byId.values()].filter((e) => !isSunset(e, now));
  }

  size(): number {
    return this.byId.size;
  }
}
