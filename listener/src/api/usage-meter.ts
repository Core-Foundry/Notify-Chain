/**
 * Per-client usage accounting (#989).
 *
 * Operators need to know how much each API client consumes, but a usage record
 * must never become a second copy of the credential. This module records
 * consumption against a *non-reversible client identifier* so records can be
 * aggregated and shown, while the secret itself never leaves the auth layer.
 *
 * Design:
 * - `deriveClientId()` hashes the presented credential with a per-deployment
 *   salt and returns a short, stable, non-reversible id. The same credential
 *   always maps to the same id (so aggregation works), but the id cannot be
 *   turned back into the key.
 * - `UsageMeter` accumulates records and answers aggregation questions
 *   (totals per client, per route, per window) without any external store, so
 *   the logic is testable in isolation.
 * - `redactClientId()` produces the short display form used in logs and
 *   dashboards.
 */

import { createHmac } from 'crypto';

/** Length of the derived client id, in hex characters. */
export const CLIENT_ID_LENGTH = 16;

/** Default aggregation window, in milliseconds (one hour). */
export const DEFAULT_WINDOW_MS = 3_600_000;

export class UsageAccountingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UsageAccountingError';
  }
}

/**
 * Derive a stable, non-reversible client id from a credential.
 *
 * Uses HMAC-SHA256 keyed by a per-deployment salt: knowing the id gives no
 * advantage in recovering the key, and two deployments with different salts
 * produce different ids for the same credential (so ids are not portable
 * between environments).
 */
export function deriveClientId(credential: string, salt: string): string {
  if (!credential) {
    throw new UsageAccountingError('Cannot derive a client id from an empty credential.');
  }
  if (!salt) {
    throw new UsageAccountingError('A non-empty salt is required to derive client ids.');
  }
  // The salt is the HMAC key, the credential is the message: the credential is
  // never stored, only the derived id.
  return createHmac('sha256', salt)
    .update(credential)
    .digest('hex')
    .slice(0, CLIENT_ID_LENGTH);
}

/** Short display form for a client id, safe for logs and dashboards. */
export function redactClientId(clientId: string): string {
  if (!clientId) {
    return 'unknown';
  }
  if (clientId.length <= 8) {
    return clientId;
  }
  return `${clientId.slice(0, 4)}…${clientId.slice(-4)}`;
}

export interface UsageRecord {
  clientId: string;
  /** Route identifier, e.g. `GET /api/v1/events`. */
  route: string;
  /** HTTP status of the served request. */
  status: number;
  /** Request duration in milliseconds. */
  durationMs: number;
  /** Epoch milliseconds of the request. */
  at: number;
}

export interface ClientTotals {
  clientId: string;
  requests: number;
  errors: number;
  totalDurationMs: number;
  firstSeen: number;
  lastSeen: number;
}

export interface RouteTotals {
  route: string;
  requests: number;
  errors: number;
}

/** A bucket of aggregated usage for one window. */
export interface UsageWindow {
  start: number;
  end: number;
  requests: number;
}

function isError(status: number): boolean {
  return status >= 400;
}

/**
 * In-memory meter of per-client usage.
 *
 * Records are appended in arrival order. `summary()` collapses them into
 * per-client totals; `byRoute()` and `windows()` answer the other two operator
 * questions. Nothing here stores the credential, only the derived id.
 */
export class UsageMeter {
  private readonly records: UsageRecord[] = [];

  constructor(private readonly maxRecords: number = 100_000) {
    if (maxRecords <= 0) {
      throw new UsageAccountingError('maxRecords must be positive.');
    }
  }

  /** Record one served request. */
  record(entry: UsageRecord): void {
    if (!entry.clientId) {
      throw new UsageAccountingError('A usage record requires a clientId.');
    }
    if (!Number.isFinite(entry.at)) {
      throw new UsageAccountingError('A usage record requires a finite timestamp.');
    }
    this.records.push(entry);
    if (this.records.length > this.maxRecords) {
      // Keep the most recent records: usage is a rolling view, not an archive.
      this.records.splice(0, this.records.length - this.maxRecords);
    }
  }

  size(): number {
    return this.records.length;
  }

  /** Per-client totals, optionally restricted to a time range. */
  summary(since?: number, until?: number): ClientTotals[] {
    const byClient = new Map<string, ClientTotals>();
    for (const r of this.records) {
      if (since !== undefined && r.at < since) continue;
      if (until !== undefined && r.at > until) continue;
      let t = byClient.get(r.clientId);
      if (!t) {
        t = {
          clientId: r.clientId,
          requests: 0,
          errors: 0,
          totalDurationMs: 0,
          firstSeen: r.at,
          lastSeen: r.at,
        };
        byClient.set(r.clientId, t);
      }
      t.requests += 1;
      if (isError(r.status)) t.errors += 1;
      t.totalDurationMs += r.durationMs;
      if (r.at < t.firstSeen) t.firstSeen = r.at;
      if (r.at > t.lastSeen) t.lastSeen = r.at;
    }
    return [...byClient.values()].sort((a, b) => b.requests - a.requests);
  }

  /** Usage for one client, broken down by route. */
  byRoute(clientId: string): RouteTotals[] {
    const byRoute = new Map<string, RouteTotals>();
    for (const r of this.records) {
      if (r.clientId !== clientId) continue;
      let t = byRoute.get(r.route);
      if (!t) {
        t = { route: r.route, requests: 0, errors: 0 };
        byRoute.set(r.route, t);
      }
      t.requests += 1;
      if (isError(r.status)) t.errors += 1;
    }
    return [...byRoute.values()].sort((a, b) => b.requests - a.requests);
  }

  /**
   * Fixed-size time buckets between `from` and `to`, inclusive of the bucket
   * containing `from` and exclusive of the bucket containing `to`.
   *
   * Uses a fixed bucket width (not a sliding window) so two callers asking the
   * same question get the same boundaries, and the sum of the buckets always
   * reconciles with the total over the same range.
   */
  windows(from: number, to: number, widthMs: number = DEFAULT_WINDOW_MS): UsageWindow[] {
    if (widthMs <= 0) {
      throw new UsageAccountingError('Window width must be positive.');
    }
    if (to < from) {
      throw new UsageAccountingError('Window range end must not precede its start.');
    }
    const buckets = new Map<number, number>();
    const firstStart = Math.floor(from / widthMs) * widthMs;
    for (let start = firstStart; start < to; start += widthMs) {
      buckets.set(start, 0);
    }
    for (const r of this.records) {
      if (r.at < from || r.at >= to) continue;
      const start = Math.floor(r.at / widthMs) * widthMs;
      buckets.set(start, (buckets.get(start) ?? 0) + 1);
    }
    return [...buckets.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([start, requests]) => ({ start, end: start + widthMs, requests }));
  }

  /** Total requests over a range, for reconciliation against `windows()`. */
  totalInRange(from: number, to: number): number {
    return this.records.filter((r) => r.at >= from && r.at < to).length;
  }

  /** Clients that exceeded `limit` requests inside the given window. */
  overLimit(
    limit: number,
    windowMs: number = DEFAULT_WINDOW_MS,
    now: number = Date.now(),
  ): ClientTotals[] {
    if (limit <= 0) {
      throw new UsageAccountingError('Limit must be positive.');
    }
    const since = now - windowMs;
    return this.summary(since, now).filter((t) => t.requests > limit);
  }

  /** Drop every record. Used by tests and by an operator-triggered reset. */
  reset(): void {
    this.records.length = 0;
  }
}

/**
 * Build a usage record from a request, deriving the client id from the
 * presented credential so the caller never has to handle the raw key.
 */
export function recordFromRequest(
  credential: string,
  salt: string,
  route: string,
  status: number,
  durationMs: number,
  at: number = Date.now(),
): UsageRecord {
  return { clientId: deriveClientId(credential, salt), route, status, durationMs, at };
}
