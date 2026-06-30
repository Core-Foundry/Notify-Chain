import { memo, useState, useMemo, useCallback } from 'react';
import type { WebhookDelivery } from '../types/webhook';
import { formatTimestamp } from '../utils/formatTime';
import { getErrorCategory } from '../utils/webhookData';

interface WebhookFailedTableProps {
  deliveries: WebhookDelivery[];
  isLoading: boolean;
}

type SortField = 'attemptedAt' | 'httpStatus' | 'latencyMs' | 'targetUrl' | 'eventType';
type SortDir = 'asc' | 'desc';

const PAGE_SIZE_OPTIONS = [10, 20, 50];

/** Truncate a URL for display without breaking layout. */
function truncateUrl(url: string, maxLen = 52): string {
  if (url.length <= maxLen) return url;
  return `${url.slice(0, maxLen - 1)}…`;
}

/** Map HTTP status to a CSS modifier. */
function statusCodeClass(code: number | null): string {
  if (code === null) return 'webhook-failed-table__code--network';
  if (code >= 500) return 'webhook-failed-table__code--5xx';
  if (code >= 400) return 'webhook-failed-table__code--4xx';
  return '';
}

const SkeletonRow = () => (
  <tr className="webhook-failed-table__row webhook-failed-table__row--skeleton" aria-hidden="true">
    {Array.from({ length: 6 }).map((_, i) => (
      <td key={i} className="webhook-failed-table__cell">
        <span className="webhook-failed-table__skeleton" style={{ width: `${50 + (i * 23) % 40}%` }} />
      </td>
    ))}
  </tr>
);

function SortButton({
  field,
  currentField,
  currentDir,
  label,
  onSort,
}: {
  field: SortField;
  currentField: SortField;
  currentDir: SortDir;
  label: string;
  onSort: (f: SortField) => void;
}) {
  const isActive = field === currentField;
  const arrow = isActive ? (currentDir === 'asc' ? ' ↑' : ' ↓') : '';
  return (
    <button
      type="button"
      className={`webhook-failed-table__sort-btn${isActive ? ' webhook-failed-table__sort-btn--active' : ''}`}
      onClick={() => onSort(field)}
      aria-sort={isActive ? (currentDir === 'asc' ? 'ascending' : 'descending') : 'none'}
    >
      {label}{arrow}
    </button>
  );
}

export const WebhookFailedTable = memo(function WebhookFailedTable({
  deliveries,
  isLoading,
}: WebhookFailedTableProps) {
  const [sortField, setSortField] = useState<SortField>('attemptedAt');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const handleSort = useCallback((field: SortField) => {
    setSortField((prev) => {
      if (prev === field) {
        setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
        return field;
      }
      setSortDir('desc');
      return field;
    });
    setPage(1);
  }, []);

  const sorted = useMemo(() => {
    return [...deliveries].sort((a, b) => {
      let aVal: number | string | null;
      let bVal: number | string | null;

      switch (sortField) {
        case 'attemptedAt':
          aVal = a.attemptedAt;
          bVal = b.attemptedAt;
          break;
        case 'httpStatus':
          aVal = a.httpStatus ?? -1;
          bVal = b.httpStatus ?? -1;
          break;
        case 'latencyMs':
          aVal = a.latencyMs ?? -1;
          bVal = b.latencyMs ?? -1;
          break;
        case 'targetUrl':
          aVal = a.targetUrl;
          bVal = b.targetUrl;
          break;
        case 'eventType':
          aVal = a.eventType;
          bVal = b.eventType;
          break;
        default:
          return 0;
      }

      if (aVal === bVal) return 0;
      const cmp = aVal < bVal ? -1 : 1;
      return sortDir === 'asc' ? cmp : -cmp;
    });
  }, [deliveries, sortField, sortDir]);

  const pageCount = Math.max(1, Math.ceil(sorted.length / pageSize));
  const safePage = Math.min(page, pageCount);
  const pageItems = sorted.slice((safePage - 1) * pageSize, safePage * pageSize);

  const toggleExpand = useCallback((id: string) => {
    setExpandedId((prev) => (prev === id ? null : id));
  }, []);

  return (
    <section className="webhook-failed-table-section" aria-labelledby="failed-table-title">
      <div className="webhook-failed-table-section__header">
        <h3 id="failed-table-title" className="webhook-failed-table-section__title">
          Failed Deliveries
        </h3>
        <span className="webhook-failed-table-section__count" aria-live="polite" role="status">
          {isLoading ? '—' : `${deliveries.length.toLocaleString()} records`}
        </span>
      </div>

      <div className="webhook-failed-table__wrapper" role="region" aria-label="Failed deliveries table" tabIndex={0}>
        <table className="webhook-failed-table" aria-labelledby="failed-table-title" aria-rowcount={deliveries.length}>
          <thead>
            <tr>
              <th scope="col" className="webhook-failed-table__th">
                <SortButton field="attemptedAt" currentField={sortField} currentDir={sortDir} label="Timestamp" onSort={handleSort} />
              </th>
              <th scope="col" className="webhook-failed-table__th">
                <SortButton field="eventType" currentField={sortField} currentDir={sortDir} label="Event" onSort={handleSort} />
              </th>
              <th scope="col" className="webhook-failed-table__th">
                <SortButton field="targetUrl" currentField={sortField} currentDir={sortDir} label="Target URL" onSort={handleSort} />
              </th>
              <th scope="col" className="webhook-failed-table__th">
                <SortButton field="httpStatus" currentField={sortField} currentDir={sortDir} label="HTTP Status" onSort={handleSort} />
              </th>
              <th scope="col" className="webhook-failed-table__th">
                <SortButton field="latencyMs" currentField={sortField} currentDir={sortDir} label="Latency" onSort={handleSort} />
              </th>
              <th scope="col" className="webhook-failed-table__th">
                Error Category
              </th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              Array.from({ length: 5 }).map((_, i) => <SkeletonRow key={i} />)
            ) : pageItems.length === 0 ? (
              <tr>
                <td colSpan={6} className="webhook-failed-table__empty" role="cell">
                  No failed deliveries for the selected filters
                </td>
              </tr>
            ) : (
              pageItems.map((d) => {
                const isExpanded = expandedId === d.id;
                const category = getErrorCategory(d);
                return (
                  <>
                    <tr
                      key={d.id}
                      className={`webhook-failed-table__row${isExpanded ? ' webhook-failed-table__row--expanded' : ''}`}
                      aria-expanded={isExpanded}
                      aria-controls={`wh-error-detail-${d.id}`}
                    >
                      <td className="webhook-failed-table__cell webhook-failed-table__cell--mono">
                        <time dateTime={new Date(d.attemptedAt).toISOString()}>
                          {formatTimestamp(d.attemptedAt)}
                        </time>
                      </td>
                      <td className="webhook-failed-table__cell">
                        <span className="webhook-failed-table__event-badge">{d.eventType}</span>
                      </td>
                      <td
                        className="webhook-failed-table__cell webhook-failed-table__cell--url"
                        title={d.targetUrl}
                      >
                        {truncateUrl(d.targetUrl)}
                      </td>
                      <td className="webhook-failed-table__cell">
                        <span className={`webhook-failed-table__code ${statusCodeClass(d.httpStatus)}`}>
                          {d.httpStatus !== null ? d.httpStatus : 'None'}
                        </span>
                      </td>
                      <td className="webhook-failed-table__cell webhook-failed-table__cell--mono">
                        {d.latencyMs !== null ? `${d.latencyMs} ms` : '—'}
                      </td>
                      <td className="webhook-failed-table__cell">
                        <div className="webhook-failed-table__cell-row">
                          {category && (
                            <span className={`webhook-failed-table__category webhook-failed-table__category--${category}`}>
                              {category}
                            </span>
                          )}
                          {d.errorPayload && (
                            <button
                              type="button"
                              className="webhook-failed-table__expand-btn"
                              onClick={() => toggleExpand(d.id)}
                              aria-expanded={isExpanded}
                              aria-controls={`wh-error-detail-${d.id}`}
                              aria-label={`${isExpanded ? 'Collapse' : 'Expand'} error payload for delivery ${d.id}`}
                            >
                              {isExpanded ? '▲ Hide' : '▼ Payload'}
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                    {isExpanded && d.errorPayload && (
                      <tr
                        key={`${d.id}-detail`}
                        id={`wh-error-detail-${d.id}`}
                        className="webhook-failed-table__detail-row"
                        aria-label="Error payload detail"
                      >
                        <td colSpan={6} className="webhook-failed-table__detail-cell">
                          <pre className="webhook-failed-table__error-payload">
                            {(() => {
                              try {
                                return JSON.stringify(JSON.parse(d.errorPayload), null, 2);
                              } catch {
                                return d.errorPayload;
                              }
                            })()}
                          </pre>
                        </td>
                      </tr>
                    )}
                  </>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {!isLoading && deliveries.length > 0 && (
        <div className="webhook-failed-table__pagination">
          <span className="webhook-failed-table__pagination-info">
            {deliveries.length === 0
              ? '0 records'
              : `${(safePage - 1) * pageSize + 1}–${Math.min(safePage * pageSize, sorted.length)} of ${sorted.length.toLocaleString()}`}
          </span>
          <div className="webhook-failed-table__pagination-controls">
            <button
              type="button"
              className="webhook-failed-table__page-btn"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={safePage <= 1}
            >
              Prev
            </button>
            <span className="webhook-failed-table__page-indicator">
              {safePage} / {pageCount}
            </span>
            <button
              type="button"
              className="webhook-failed-table__page-btn"
              onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
              disabled={safePage >= pageCount}
            >
              Next
            </button>
            <label htmlFor="wh-failed-page-size" className="webhook-failed-table__page-size-label">
              Per page
            </label>
            <select
              id="wh-failed-page-size"
              className="webhook-failed-table__page-size-select"
              value={pageSize}
              onChange={(e) => {
                setPageSize(Number(e.target.value));
                setPage(1);
              }}
            >
              {PAGE_SIZE_OPTIONS.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </div>
        </div>
      )}
    </section>
  );
});
