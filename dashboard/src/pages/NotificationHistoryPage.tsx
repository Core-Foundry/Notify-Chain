import { useCallback, useEffect, useMemo, useState } from 'react';
import { PaginationControls } from '../components/PaginationControls';
import {
  fetchNotificationHistory,
  generateMockNotificationHistory,
} from '../services/notificationHistoryApi';
import type {
  NotificationHistoryRecord,
  NotificationHistoryStatus,
} from '../types/notificationHistory';
import { formatTimestamp } from '../utils/formatTime';

const PAGE_SIZE_OPTIONS = [5, 10, 25];
const DEFAULT_LIMIT = 10;

const STATUS_LABEL: Record<NotificationHistoryStatus, string> = {
  SUCCESS: 'Delivered',
  FAILED: 'Failed',
  RETRY: 'Retrying',
};

type LoadState = 'loading' | 'ready' | 'error';

function sortChronologically(records: NotificationHistoryRecord[]): NotificationHistoryRecord[] {
  return [...records].sort(
    (a, b) => new Date(b.executionTime).getTime() - new Date(a.executionTime).getTime()
  );
}

function HistorySkeleton() {
  return (
    <ol className="notif-history__list" aria-busy="true" aria-label="Loading notification history">
      {[1, 2, 3, 4].map((i) => (
        <li key={i} className="notif-history__item notif-history__item--skeleton">
          <span className="notif-history__dot notif-history__dot--skeleton" aria-hidden="true" />
          <div className="notif-history__body">
            <div className="notif-history__skeleton-line" style={{ width: '55%' }} />
            <div className="notif-history__skeleton-line" style={{ width: '35%' }} />
          </div>
        </li>
      ))}
    </ol>
  );
}

export function NotificationHistoryPage() {
  const [records, setRecords] = useState<NotificationHistoryRecord[]>([]);
  const [loadState, setLoadState] = useState<LoadState>('loading');
  const [error, setError] = useState<string | null>(null);
  const [usingMock, setUsingMock] = useState(false);
  const [statusFilter, setStatusFilter] = useState<'all' | NotificationHistoryStatus>('all');
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(DEFAULT_LIMIT);

  const loadHistory = useCallback(async () => {
    setLoadState('loading');
    setError(null);

    try {
      const response = await fetchNotificationHistory({
        limit: 100,
        offset: 0,
        status: statusFilter,
      });
      setRecords(sortChronologically(response.records));
      setUsingMock(false);
      setLoadState('ready');
    } catch (err) {
      // Fallback keeps the page usable in local/demo environments without the listener.
      const mock = sortChronologically(generateMockNotificationHistory());
      setRecords(mock);
      setUsingMock(true);
      setError(err instanceof Error ? err.message : 'Unable to reach notification history API');
      setLoadState('ready');
    }
  }, [statusFilter]);

  useEffect(() => {
    void loadHistory();
  }, [loadHistory]);

  useEffect(() => {
    setPage(1);
  }, [statusFilter, limit]);

  const filteredRecords = useMemo(() => {
    if (statusFilter === 'all') return records;
    return records.filter((record) => record.status === statusFilter);
  }, [records, statusFilter]);

  const pageCount = Math.max(1, Math.ceil(filteredRecords.length / limit) || 1);
  const currentPage = Math.min(page, pageCount);
  const pageStart = (currentPage - 1) * limit;
  const pageRecords = filteredRecords.slice(pageStart, pageStart + limit);

  return (
    <main className="notif-history-page">
      <header className="notif-history__header">
        <div>
          <p className="notif-history__eyebrow">Inbox</p>
          <h1>Notification History</h1>
          <p className="notif-history__lead">
            Review previously received notifications in chronological order across devices.
          </p>
        </div>
        <button type="button" className="notif-history__refresh" onClick={() => void loadHistory()}>
          Refresh
        </button>
      </header>

      <section className="notif-history__filters" aria-label="Notification history filters">
        <div className="event-filters__group">
          <label htmlFor="history-status-filter">Status</label>
          <select
            id="history-status-filter"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}
          >
            <option value="all">All statuses</option>
            <option value="SUCCESS">Delivered</option>
            <option value="FAILED">Failed</option>
            <option value="RETRY">Retrying</option>
          </select>
        </div>
        <p className="event-filters__count" aria-live="polite">
          {filteredRecords.length.toLocaleString()}{' '}
          {filteredRecords.length === 1 ? 'notification' : 'notifications'}
        </p>
      </section>

      {usingMock && error && (
        <p className="notif-history__banner" role="status">
          Showing sample history ({error}). Connect the listener API for live data.
        </p>
      )}

      {loadState === 'loading' && <HistorySkeleton />}

      {loadState === 'ready' && pageRecords.length === 0 && (
        <section className="event-explorer__empty-state" role="status" aria-live="polite">
          <h2>No notifications yet</h2>
          <p>When notifications are delivered, they will appear here in chronological order.</p>
        </section>
      )}

      {loadState === 'ready' && pageRecords.length > 0 && (
        <ol className="notif-history__list" aria-label="Notification history timeline">
          {pageRecords.map((record) => (
            <li key={record.id} className="notif-history__item">
              <span
                className={`notif-history__dot notif-history__dot--${record.status.toLowerCase()}`}
                aria-hidden="true"
              />
              <div className="notif-history__body">
                <div className="notif-history__row">
                  <span className="notif-history__status">{STATUS_LABEL[record.status]}</span>
                  <time dateTime={record.executionTime}>
                    {formatTimestamp(new Date(record.executionTime).getTime())}
                  </time>
                </div>
                <p className="notif-history__meta">
                  Notification #{record.scheduledNotificationId} · Attempt{' '}
                  {record.executionAttempt}
                  {record.responseDuration != null ? ` · ${record.responseDuration} ms` : ''}
                </p>
                {record.errorMessage && (
                  <p className="notif-history__error">{record.errorMessage}</p>
                )}
              </div>
            </li>
          ))}
        </ol>
      )}

      {loadState === 'ready' && filteredRecords.length > 0 && (
        <PaginationControls
          page={currentPage}
          pageCount={pageCount}
          limit={limit}
          totalCount={filteredRecords.length}
          onPageChange={setPage}
          onLimitChange={setLimit}
          pageSizeOptions={PAGE_SIZE_OPTIONS}
          summaryLabel="notifications"
        />
      )}
    </main>
  );
}
