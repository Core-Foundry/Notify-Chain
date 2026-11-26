import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchNetworkHealth } from '../services/networkHealthApi';
import { getStellarNetworkName } from '../config/stellarNetwork';
import {
  classifyNetworkHealth,
  isNetworkStatusStale,
  type NetworkHealthSnapshot,
  type NetworkHealthState,
} from '../utils/networkHealth';
import { formatTimestampShort } from '../utils/formatTime';

const DEFAULT_POLL_INTERVAL_MS = 15_000;

const STATE_LABELS: Record<NetworkHealthState, string> = {
  healthy: 'Healthy',
  degraded: 'Degraded',
  unavailable: 'Unavailable',
};

/**
 * Network health overview (issue #1154): configured network, the last
 * successful connectivity check, and a healthy / degraded / unavailable state.
 * Request failures are caught and shown in the widget; they never throw.
 */
export function NetworkHealthWidget(props: {
  healthUrl: string;
  pollIntervalMs?: number;
  /** Injectable clock for tests. */
  now?: () => number;
}) {
  const pollIntervalMs = props.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;
  const now = props.now ?? Date.now;
  const [snapshot, setSnapshot] = useState<NetworkHealthSnapshot | null>(null);
  const [lastSuccessAtMs, setLastSuccessAtMs] = useState<number | null>(null);
  const [requestError, setRequestError] = useState<string | null>(null);
  const [, setTick] = useState(0);
  const abortRef = useRef<AbortController | null>(null);

  const refresh = useCallback(async () => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const next = await fetchNetworkHealth(props.healthUrl, { signal: controller.signal });
      setSnapshot(next);
      setRequestError(null);
      if (next.rpcStatus === 'ok' || (next.rpcStatus === null && next.overall === 'ok')) {
        setLastSuccessAtMs(next.checkedAtMs);
      }
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') return;
      setRequestError(err instanceof Error ? err.message : String(err));
    } finally {
      // Re-render so staleness is re-evaluated even when nothing changed.
      setTick((t) => t + 1);
    }
  }, [props.healthUrl]);

  useEffect(() => {
    void refresh();
    const id = setInterval(() => void refresh(), pollIntervalMs);
    return () => {
      clearInterval(id);
      abortRef.current?.abort();
    };
  }, [refresh, pollIntervalMs]);

  // A failed request means connectivity is unknown right now.
  const state: NetworkHealthState = requestError ? 'unavailable' : classifyNetworkHealth(snapshot);
  const stale = isNetworkStatusStale(lastSuccessAtMs, now());
  const network = snapshot?.network ?? getStellarNetworkName();

  return (
    <section
      className={`network-health network-health--${state}`}
      aria-label="Network health"
      data-state={state}
    >
      <div className="network-health__header">
        <h2 className="network-health__title">Network Health</h2>
        <span className="network-health__state" role="status">
          {STATE_LABELS[state]}
          {stale && snapshot !== null && ' (stale)'}
        </span>
      </div>
      <dl className="network-health__details">
        <div>
          <dt>Network</dt>
          <dd>{network}</dd>
        </div>
        <div>
          <dt>Last successful check</dt>
          <dd>{lastSuccessAtMs === null ? 'None yet' : formatTimestampShort(lastSuccessAtMs)}</dd>
        </div>
        {snapshot?.rpcLatencyMs != null && (
          <div>
            <dt>RPC latency</dt>
            <dd>{Math.round(snapshot.rpcLatencyMs)} ms</dd>
          </div>
        )}
      </dl>
      {stale && lastSuccessAtMs !== null && (
        <p className="network-health__stale">
          Status is stale: no successful connectivity check recently.
        </p>
      )}
      {requestError && (
        <p className="network-health__error">Could not reach the health endpoint. Retrying…</p>
      )}
    </section>
  );
}
