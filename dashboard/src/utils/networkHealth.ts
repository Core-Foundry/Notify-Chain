/**
 * Network health model for the dashboard widget (issue #1154).
 *
 * Built from the listener's `GET /health` response, which reports the
 * configured Stellar network and whether the Stellar RPC is reachable.
 */

export type NetworkHealthState = 'healthy' | 'degraded' | 'unavailable';

/** RPC answers slower than this are reported as degraded. */
export const NETWORK_DEGRADED_LATENCY_MS = 2_000;
/** A status not refreshed successfully for this long is shown as stale. */
export const NETWORK_STATUS_STALE_AFTER_MS = 60_000;

export interface NetworkHealthSnapshot {
  /** Network name reported by the backend, if any. */
  network: string | null;
  /** Overall listener status from /health. */
  overall: 'ok' | 'degraded' | 'error' | null;
  rpcStatus: 'ok' | 'error' | 'not_configured' | null;
  rpcLatencyMs: number | null;
  /** When the backend produced the snapshot (ms). */
  checkedAtMs: number;
}

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : null;
}

function asNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

/** Parse a /health body defensively; unknown shapes never throw. */
export function parseNetworkHealth(payload: unknown, nowMs = Date.now()): NetworkHealthSnapshot {
  const root = (payload ?? {}) as Record<string, unknown>;
  // Some deployments wrap responses as { data: ... }.
  const body =
    root.data && typeof root.data === 'object' ? (root.data as Record<string, unknown>) : root;
  const services = (body.services ?? {}) as Record<string, unknown>;
  const rpc = (services.stellarRpc ?? {}) as Record<string, unknown>;

  const overall = asString(body.status);
  const rpcStatus = asString(rpc.status);
  const network = asString(body.network);
  const checkedAt = asString(body.timestamp);
  const parsedTime = checkedAt ? Date.parse(checkedAt) : Number.NaN;

  return {
    network: network && network !== 'unknown' ? network : null,
    overall: overall === 'ok' || overall === 'degraded' || overall === 'error' ? overall : null,
    rpcStatus:
      rpcStatus === 'ok' || rpcStatus === 'error' || rpcStatus === 'not_configured'
        ? rpcStatus
        : null,
    rpcLatencyMs: asNumber(rpc.latencyMs),
    checkedAtMs: Number.isFinite(parsedTime) ? parsedTime : nowMs,
  };
}

/** Classify a snapshot as healthy, degraded or unavailable. */
export function classifyNetworkHealth(snapshot: NetworkHealthSnapshot | null): NetworkHealthState {
  if (!snapshot) return 'unavailable';
  if (snapshot.rpcStatus === 'error' || snapshot.rpcStatus === 'not_configured') {
    return 'unavailable';
  }
  if (snapshot.rpcStatus === null) {
    // No RPC detail: fall back to the overall listener status.
    if (snapshot.overall === 'ok') return 'healthy';
    if (snapshot.overall === 'degraded') return 'degraded';
    return 'unavailable';
  }
  if (snapshot.overall === 'degraded') return 'degraded';
  if (snapshot.rpcLatencyMs !== null && snapshot.rpcLatencyMs > NETWORK_DEGRADED_LATENCY_MS) {
    return 'degraded';
  }
  return 'healthy';
}

export function isNetworkStatusStale(
  lastSuccessAtMs: number | null,
  nowMs = Date.now(),
  staleAfterMs = NETWORK_STATUS_STALE_AFTER_MS,
): boolean {
  return lastSuccessAtMs === null || nowMs - lastSuccessAtMs > staleAfterMs;
}

/** `{base}/api/events` → `{base}/health`. */
export function resolveNetworkHealthUrl(eventsApiUrl: string): string {
  try {
    const url = new URL(eventsApiUrl);
    url.pathname = '/health';
    url.search = '';
    return url.toString();
  } catch {
    return 'http://localhost:8787/health';
  }
}
