import type { IndexingHealth } from '../types/indexingHealth';
import { computeLedgerProgress, type LedgerProgressState } from '../utils/ledgerProgress';
import { formatTimestampShort } from '../utils/formatTime';

const STATE_LABELS: Record<LedgerProgressState, string> = {
  unavailable: 'Progress unavailable',
  partial: 'Partial data',
  current: 'Up to date',
  behind: 'Catching up',
  stale: 'Stale',
};

function formatLedger(value: number | null): string {
  return value === null ? 'Not available' : value.toLocaleString();
}

/** Ledger progress of the listener against the network tip (issue #1159). */
export function LedgerProgressIndicator(props: {
  health: IndexingHealth | null;
  fetchFailed?: boolean;
  nowMs?: number;
}) {
  const progress = computeLedgerProgress(props.health, {
    nowMs: props.nowMs,
    fetchFailed: props.fetchFailed,
  });

  return (
    <section
      className={`ledger-progress ledger-progress--${progress.state}`}
      aria-label="Ledger progress"
    >
      <div className="ledger-progress__header">
        <h3 className="ledger-progress__title">Ledger Progress</h3>
        <span className="ledger-progress__state" data-state={progress.state}>
          {STATE_LABELS[progress.state]}
        </span>
      </div>

      <dl className="ledger-progress__values">
        <div>
          <dt>Latest processed ledger</dt>
          <dd>{formatLedger(progress.processedLedger)}</dd>
        </div>
        <div>
          <dt>Latest available ledger</dt>
          <dd>{formatLedger(progress.latestLedger)}</dd>
        </div>
        <div>
          <dt>Ledgers behind</dt>
          <dd>{progress.ledgersBehind === null ? '—' : progress.ledgersBehind.toLocaleString()}</dd>
        </div>
      </dl>

      {progress.percent !== null ? (
        <div className="ledger-progress__bar-wrap">
          <progress
            className="ledger-progress__bar"
            max={100}
            value={progress.percent}
            aria-label="Processed share of available ledgers"
          />
          <span className="ledger-progress__percent">{progress.percent.toFixed(1)}%</span>
        </div>
      ) : (
        progress.state !== 'unavailable' && (
          <p className="ledger-progress__note">
            Completion percentage hidden:{' '}
            {progress.isStale
              ? 'progress data is stale'
              : 'the latest available ledger is not reported'}
            .
          </p>
        )
      )}

      {progress.isStale && progress.state !== 'unavailable' && (
        <p className="ledger-progress__stale" role="status">
          {progress.observedAtMs === null
            ? 'Progress time is unknown; values may be out of date.'
            : `Last progress at ${formatTimestampShort(progress.observedAtMs)}; values may be out of date.`}
        </p>
      )}
    </section>
  );
}
