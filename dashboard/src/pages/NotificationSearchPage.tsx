import { useState, useCallback, useEffect, useRef } from 'react';
import { useDebounce } from '../hooks/useDebounce';
import {
  searchNotifications,
  type NotificationSearchResult,
  type NotificationSearchResponse,
} from '../services/eventsApi';

const PAGE_SIZE = 20;
const API_BASE = (import.meta.env.VITE_EVENTS_API_URL ?? 'http://localhost:8787/api/events').replace(
  '/api/events',
  ''
);

const STATUS_OPTIONS = ['', 'PENDING', 'PROCESSING', 'COMPLETED', 'FAILED', 'CANCELLED', 'PROCESSED'];

export function NotificationSearchPage() {
  const [query, setQuery] = useState('');
  const [sender, setSender] = useState('');
  const [txHash, setTxHash] = useState('');
  const [eventId, setEventId] = useState('');
  const [status, setStatus] = useState('');
  const [type, setType] = useState('');
  const [page, setPage] = useState(1);

  const [response, setResponse] = useState<NotificationSearchResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const debouncedQuery = useDebounce(query, 300);
  const debouncedSender = useDebounce(sender, 300);
  const debouncedTxHash = useDebounce(txHash, 300);
  const debouncedEventId = useDebounce(eventId, 300);

  // Track whether any search param is active
  const hasParams =
    debouncedQuery || debouncedSender || debouncedTxHash || debouncedEventId || status || type;

  const abortRef = useRef<AbortController | null>(null);

  const runSearch = useCallback(async () => {
    if (!hasParams) {
      setResponse(null);
      setError(null);
      return;
    }

    abortRef.current?.abort();
    abortRef.current = new AbortController();

    setLoading(true);
    setError(null);

    try {
      const result = await searchNotifications(API_BASE, {
        q: debouncedQuery || undefined,
        sender: debouncedSender || undefined,
        txHash: debouncedTxHash || undefined,
        eventId: debouncedEventId || undefined,
        status: status || undefined,
        type: type || undefined,
        limit: PAGE_SIZE,
        offset: (page - 1) * PAGE_SIZE,
      });
      setResponse(result);
    } catch (err: unknown) {
      if (err instanceof Error && err.name === 'AbortError') return;
      setError(err instanceof Error ? err.message : 'Search failed');
    } finally {
      setLoading(false);
    }
  }, [debouncedQuery, debouncedSender, debouncedTxHash, debouncedEventId, status, type, page, hasParams]);

  // Re-run search whenever debounced params change; reset page when filters change
  const filtersKey = `${debouncedQuery}|${debouncedSender}|${debouncedTxHash}|${debouncedEventId}|${status}|${type}`;
  const prevFiltersRef = useRef(filtersKey);
  useEffect(() => {
    if (filtersKey !== prevFiltersRef.current) {
      setPage(1);
      prevFiltersRef.current = filtersKey;
    }
  }, [filtersKey]);

  useEffect(() => {
    runSearch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtersKey, page]);

  function clearAll() {
    setQuery('');
    setSender('');
    setTxHash('');
    setEventId('');
    setStatus('');
    setType('');
    setPage(1);
    setResponse(null);
    setError(null);
  }

  const totalPages = response ? response.totalPages : 0;

  return (
    <main className="notif-search-page">
      <header className="notif-search-page__header">
        <p className="event-explorer__eyebrow">Notifications</p>
        <h1>Notification Search</h1>
        <p className="event-explorer__lead">
          Search scheduled and processed notifications by sender, transaction hash, event ID, type, or free-text.
        </p>
      </header>

      {/* Search form */}
      <section className="notif-search-form" aria-label="Notification search filters">
        <div className="notif-search-form__row">
          <div className="notif-search-form__group notif-search-form__group--wide">
            <label htmlFor="nsf-query" className="notif-search-form__label">Search</label>
            <input
              id="nsf-query"
              type="search"
              className="notif-search-form__input"
              placeholder="Sender, event ID, tx hash, type, payload…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              aria-label="Free-text search"
            />
          </div>

          <div className="notif-search-form__group">
            <label htmlFor="nsf-sender" className="notif-search-form__label">Sender</label>
            <input
              id="nsf-sender"
              type="text"
              className="notif-search-form__input"
              placeholder="Target recipient"
              value={sender}
              onChange={(e) => setSender(e.target.value)}
            />
          </div>

          <div className="notif-search-form__group">
            <label htmlFor="nsf-tx" className="notif-search-form__label">Tx Hash</label>
            <input
              id="nsf-tx"
              type="text"
              className="notif-search-form__input"
              placeholder="Transaction hash"
              value={txHash}
              onChange={(e) => setTxHash(e.target.value)}
            />
          </div>

          <div className="notif-search-form__group">
            <label htmlFor="nsf-event" className="notif-search-form__label">Event ID</label>
            <input
              id="nsf-event"
              type="text"
              className="notif-search-form__input"
              placeholder="Event identifier"
              value={eventId}
              onChange={(e) => setEventId(e.target.value)}
            />
          </div>

          <div className="notif-search-form__group">
            <label htmlFor="nsf-status" className="notif-search-form__label">Status</label>
            <select
              id="nsf-status"
              className="notif-search-form__input"
              value={status}
              onChange={(e) => setStatus(e.target.value)}
            >
              {STATUS_OPTIONS.map((s) => (
                <option key={s} value={s}>{s || 'All statuses'}</option>
              ))}
            </select>
          </div>

          <div className="notif-search-form__group">
            <label htmlFor="nsf-type" className="notif-search-form__label">Type</label>
            <input
              id="nsf-type"
              type="text"
              className="notif-search-form__input"
              placeholder="discord, email…"
              value={type}
              onChange={(e) => setType(e.target.value)}
            />
          </div>
        </div>

        {hasParams && (
          <button type="button" className="notif-search__clear" onClick={clearAll} aria-label="Clear all filters">
            Clear filters
          </button>
        )}
      </section>

      {/* Results area */}
      <section aria-label="Search results" aria-live="polite">
        {loading && (
          <p className="notif-search-page__status">Searching…</p>
        )}

        {error && !loading && (
          <div className="event-explorer__error-banner" role="alert">
            <strong>Error:</strong> {error}
          </div>
        )}

        {!loading && !error && !hasParams && (
          <div className="notif-search-page__empty" role="status">
            <h2>Start searching</h2>
            <p>Enter a query above to find notifications by sender, transaction hash, event ID, or type.</p>
          </div>
        )}

        {!loading && !error && hasParams && response?.results.length === 0 && (
          <div className="notif-search-page__empty" role="status">
            <h2>No results found</h2>
            <p>Try different keywords or clear filters to broaden the search.</p>
          </div>
        )}

        {!loading && !error && response && response.results.length > 0 && (
          <>
            <p className="event-explorer__summary">
              {response.total.toLocaleString()} result{response.total !== 1 ? 's' : ''} — showing{' '}
              {((page - 1) * PAGE_SIZE + 1).toLocaleString()}–
              {Math.min(page * PAGE_SIZE, response.total).toLocaleString()}
            </p>

            <div className="notif-search-results">
              {response.results.map((r) => (
                <NotificationResultCard key={`${r.source}-${r.id}`} result={r} />
              ))}
            </div>

            {totalPages > 1 && (
              <nav className="notif-search-page__pagination" aria-label="Pagination">
                <button
                  type="button"
                  className="pagination__btn"
                  disabled={page === 1}
                  onClick={() => setPage((p) => p - 1)}
                  aria-label="Previous page"
                >
                  ← Previous
                </button>
                <span className="pagination__info">
                  Page {page} of {totalPages}
                </span>
                <button
                  type="button"
                  className="pagination__btn"
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => p + 1)}
                  aria-label="Next page"
                >
                  Next →
                </button>
              </nav>
            )}
          </>
        )}
      </section>
    </main>
  );
}

function NotificationResultCard({ result }: { result: NotificationSearchResult }) {
  return (
    <article className="notif-result-card">
      <div className="notif-result-card__header">
        <span className={`notif-result-card__source notif-result-card__source--${result.source}`}>
          {result.source}
        </span>
        <span className={`notif-result-card__status notif-result-card__status--${result.status.toLowerCase()}`}>
          {result.status}
        </span>
        {result.notificationType && (
          <span className="notif-result-card__type">{result.notificationType}</span>
        )}
      </div>

      <dl className="notif-result-card__fields">
        {result.eventId && (
          <>
            <dt>Event ID</dt>
            <dd><code>{result.eventId}</code></dd>
          </>
        )}
        {result.txHash && (
          <>
            <dt>Tx Hash</dt>
            <dd><code>{result.txHash}</code></dd>
          </>
        )}
        {result.contractAddress && (
          <>
            <dt>Contract</dt>
            <dd><code>{result.contractAddress}</code></dd>
          </>
        )}
        {result.targetRecipient && (
          <>
            <dt>Recipient</dt>
            <dd>{result.targetRecipient}</dd>
          </>
        )}
        <dt>Created</dt>
        <dd>{new Date(result.createdAt).toLocaleString()}</dd>
      </dl>
    </article>
  );
}
