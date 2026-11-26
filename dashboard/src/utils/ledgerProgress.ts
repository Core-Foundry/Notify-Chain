import type { IndexingHealth } from '../types/indexingHealth';

/**
 * View model for the ledger progress indicator (issue #1159).
 *
 * Shows how far the listener has processed relative to the latest ledger the
 * network reports. A completion percentage is only produced when both values
 * are known and the data is fresh, so the dashboard never shows a misleading
 * "100%" built from missing or stale numbers.
 */

/** Progress older than this is flagged as stale. */
export const LEDGER_PROGRESS_STALE_AFTER_MS = 60_000;

export type LedgerProgressState =
  | 'unavailable' // nothing loaded yet
  | 'partial' // processed ledger known, network tip unknown (or vice versa)
  | 'current'
  | 'behind'
  | 'stale';

export interface LedgerProgress {
  state: LedgerProgressState;
  processedLedger: number | null;
  latestLedger: number | null;
  /** latest - processed, never negative; null when either side is unknown. */
  ledgersBehind: number | null;
  /** 0-100, only when both values are known and the data is fresh. */
  percent: number | null;
  isStale: boolean;
  /** When the progress values were last observed (ms), if known. */
  observedAtMs: number | null;
}

export function computeLedgerProgress(
  health: IndexingHealth | null,
  options: { nowMs?: number; staleAfterMs?: number; fetchFailed?: boolean } = {},
): LedgerProgress {
  const nowMs = options.nowMs ?? Date.now();
  const staleAfterMs = options.staleAfterMs ?? LEDGER_PROGRESS_STALE_AFTER_MS;

  if (!health) {
    return {
      state: 'unavailable',
      processedLedger: null,
      latestLedger: null,
      ledgersBehind: null,
      percent: null,
      isStale: false,
      observedAtMs: null,
    };
  }

  const processed = health.indexedLedger;
  const latest = health.networkTipLedger;
  // Prefer the time the listener last ingested a ledger; fall back to when the
  // health snapshot itself was produced.
  const observedAtMs = health.lastIngestedAtMs ?? health.timestampMs ?? null;
  const isStale =
    Boolean(options.fetchFailed) || observedAtMs === null || nowMs - observedAtMs > staleAfterMs;

  const bothKnown = processed !== null && latest !== null;
  const ledgersBehind = bothKnown ? Math.max(0, latest - processed) : null;
  const percent =
    bothKnown && !isStale && latest > 0
      ? Math.min(100, Math.max(0, Math.floor((processed / latest) * 1000) / 10))
      : null;

  let state: LedgerProgressState;
  if (processed === null && latest === null) state = 'unavailable';
  else if (isStale) state = 'stale';
  else if (!bothKnown) state = 'partial';
  else state = ledgersBehind === 0 ? 'current' : 'behind';

  return {
    state,
    processedLedger: processed,
    latestLedger: latest,
    ledgersBehind,
    percent,
    isStale,
    observedAtMs,
  };
}
