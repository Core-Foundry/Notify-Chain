import { useEventStore } from '../store/eventStore';
import { formatTimestampShort } from '../utils/formatTime';

export function SyncStatus() {
  const lastSuccessfulSyncAt = useEventStore((state) => state.lastSuccessfulSyncAt);
  const lastSyncFailureAt = useEventStore((state) => state.lastSyncFailureAt);
  const lastSyncError = useEventStore((state) => state.lastSyncError);

  if (!lastSuccessfulSyncAt && !lastSyncFailureAt) return null;

  const label = lastSuccessfulSyncAt ? formatTimestampShort(lastSuccessfulSyncAt) : '—';
  const isError = Boolean(lastSyncError);

  return (
    <div className={`sync-status${isError ? ' sync-status--error' : ''}`} title={lastSyncError ?? undefined}>
      <span className="sync-status__dot" aria-hidden="true" />
      <span>Last sync: {label}</span>
      {isError && <span className="sync-status__error">refresh failed</span>}
    </div>
  );
}

