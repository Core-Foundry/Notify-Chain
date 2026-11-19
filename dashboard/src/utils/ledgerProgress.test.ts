import type { IndexingHealth } from '../types/indexingHealth';
import { computeLedgerProgress, LEDGER_PROGRESS_STALE_AFTER_MS } from './ledgerProgress';

// Issue #1159: ledger progress indicator.

const NOW = Date.UTC(2026, 0, 1, 12, 0, 0);

const health = (overrides: Partial<IndexingHealth> = {}): IndexingHealth => ({
  status: 'syncing',
  timestampMs: NOW,
  indexedLedger: 900,
  networkTipLedger: 1000,
  ledgerLag: 100,
  processingDelayMs: 0,
  lastIngestedAtMs: NOW - 1_000,
  detail: null,
  ...overrides,
});

describe('computeLedgerProgress', () => {
  it('reports processed, latest, difference and percentage', () => {
    expect(computeLedgerProgress(health(), { nowMs: NOW })).toMatchObject({
      state: 'behind',
      processedLedger: 900,
      latestLedger: 1000,
      ledgersBehind: 100,
      percent: 90,
      isStale: false,
    });
  });

  it('is current when processed equals latest', () => {
    const p = computeLedgerProgress(health({ indexedLedger: 1000 }), { nowMs: NOW });
    expect(p.state).toBe('current');
    expect(p.ledgersBehind).toBe(0);
    expect(p.percent).toBe(100);
  });

  it('never reports a negative difference', () => {
    const p = computeLedgerProgress(health({ indexedLedger: 1005 }), { nowMs: NOW });
    expect(p.ledgersBehind).toBe(0);
    expect(p.percent).toBe(100);
  });

  it('shows no percentage when the latest ledger is unknown', () => {
    const p = computeLedgerProgress(health({ networkTipLedger: null }), { nowMs: NOW });
    expect(p.state).toBe('partial');
    expect(p.ledgersBehind).toBeNull();
    expect(p.percent).toBeNull();
  });

  it('is unavailable before anything loads or when both values are missing', () => {
    expect(computeLedgerProgress(null, { nowMs: NOW }).state).toBe('unavailable');
    const p = computeLedgerProgress(health({ indexedLedger: null, networkTipLedger: null }), {
      nowMs: NOW,
    });
    expect(p.state).toBe('unavailable');
    expect(p.percent).toBeNull();
  });

  it('flags old progress as stale and hides the percentage', () => {
    const p = computeLedgerProgress(
      health({ lastIngestedAtMs: NOW - LEDGER_PROGRESS_STALE_AFTER_MS - 1 }),
      { nowMs: NOW },
    );
    expect(p.state).toBe('stale');
    expect(p.isStale).toBe(true);
    expect(p.percent).toBeNull();
    expect(p.ledgersBehind).toBe(100);
  });

  it('treats the last known values as stale after a failed refresh', () => {
    const p = computeLedgerProgress(health(), { nowMs: NOW, fetchFailed: true });
    expect(p.state).toBe('stale');
    expect(p.percent).toBeNull();
  });

  it('falls back to the snapshot time when last ingestion time is unknown', () => {
    const p = computeLedgerProgress(health({ lastIngestedAtMs: null, timestampMs: NOW - 5_000 }), {
      nowMs: NOW,
    });
    expect(p.isStale).toBe(false);
    expect(p.observedAtMs).toBe(NOW - 5_000);
  });
});
