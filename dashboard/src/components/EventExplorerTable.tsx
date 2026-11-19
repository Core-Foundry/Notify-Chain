import { useState, useCallback, memo, useMemo, useEffect, useRef } from 'react';
import type { BlockchainEvent } from '../types/event';
import { EventExplorerCard } from './EventExplorerCard';
import type { ContractStatus } from '../services/eventsApi';
import {
  EVENT_COLUMNS,
  EVENT_COLUMN_IDS,
  findEmptyColumns,
  isColumnLocked,
  loadVisibleColumns,
  persistVisibleColumns,
  toggleColumn,
  type EventColumnId,
} from '../utils/eventTableColumns';

const STORAGE_KEY = 'notify-chain-event-table-widths';

export const DEFAULT_COLUMN_WIDTHS = [220, 160, 110, 180, 100, 160] as const;

export const MIN_COLUMN_WIDTH = 80;

const COLUMN_LABELS = EVENT_COLUMNS.map((column) => column.label);

interface EventExplorerTableProps {
  events: BlockchainEvent[];
  onSelectEvent?: (event: BlockchainEvent) => void;
  contractStatuses?: ContractStatus[];
  onContractClick?: (contractAddress: string) => void;
}

export function loadColumnWidths(): number[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);

    if (!raw) {
      return [...DEFAULT_COLUMN_WIDTHS];
    }

    const parsed = JSON.parse(raw) as unknown;

    if (!Array.isArray(parsed) || parsed.length !== DEFAULT_COLUMN_WIDTHS.length) {
      return [...DEFAULT_COLUMN_WIDTHS];
    }

    return parsed.map((value, index) => {
      const n = Number(value);

      if (!Number.isFinite(n) || n < MIN_COLUMN_WIDTH) {
        return DEFAULT_COLUMN_WIDTHS[index];
      }

      return n;
    });
  } catch {
    return [...DEFAULT_COLUMN_WIDTHS];
  }
}

export function persistColumnWidths(widths: number[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(widths));
  } catch {
    // Ignore storage errors.
  }
}

export function widthsToGridTemplate(widths: number[]) {
  return widths.map((width) => `${width}px`).join(' ');
}

/** Grid template for the visible columns only (#1160). */
export function visibleGridTemplate(widths: number[], visible: readonly EventColumnId[]) {
  return widthsToGridTemplate(
    EVENT_COLUMN_IDS.flatMap((id, index) => (visible.includes(id) ? [widths[index]] : [])),
  );
}

function ColumnVisibilityMenu({
  visible,
  emptyColumns,
  onToggle,
  onReset,
}: {
  visible: readonly EventColumnId[];
  emptyColumns: ReadonlySet<EventColumnId>;
  onToggle: (id: EventColumnId) => void;
  onReset: () => void;
}) {
  return (
    <details className="event-explorer__columns-menu">
      <summary className="event-explorer__columns-toggle">Columns</summary>
      <fieldset className="event-explorer__columns-options">
        <legend className="event-explorer__columns-legend">Visible columns</legend>
        {EVENT_COLUMNS.map((column) => {
          const locked = isColumnLocked(column.id);
          const inputId = `event-column-${column.id}`;
          return (
            <label key={column.id} htmlFor={inputId} className="event-explorer__columns-option">
              <input
                id={inputId}
                type="checkbox"
                checked={visible.includes(column.id)}
                disabled={locked}
                aria-label={column.label}
                onChange={() => onToggle(column.id)}
              />
              <span>{column.label}</span>
              {locked && <span className="event-explorer__columns-note">(always shown)</span>}
              {!locked && emptyColumns.has(column.id) && (
                <span className="event-explorer__columns-note">(no data on this page)</span>
              )}
            </label>
          );
        })}
        <button type="button" className="event-explorer__columns-reset" onClick={onReset}>
          Show all columns
        </button>
      </fieldset>
    </details>
  );
}

async function syncCopyText(text: string) {
  if (navigator.clipboard?.writeText) {
    return navigator.clipboard.writeText(text);
  }

  const fallback = document.createElement('textarea');

  fallback.value = text;
  fallback.setAttribute('readonly', '');
  fallback.style.position = 'absolute';
  fallback.style.left = '-9999px';

  document.body.appendChild(fallback);
  fallback.select();

  const successful = document.execCommand('copy');

  document.body.removeChild(fallback);

  if (!successful) {
    throw new Error('Clipboard copy failed.');
  }
}

export const EventExplorerTable = memo(function EventExplorerTable({
  events,
  onSelectEvent,
  contractStatuses,
  onContractClick,
}: EventExplorerTableProps) {
  const [visibleColumns, setVisibleColumns] = useState<EventColumnId[]>(loadVisibleColumns);
  const emptyColumns = useMemo(() => findEmptyColumns(events), [events]);

  const handleToggleColumn = useCallback((id: EventColumnId) => {
    setVisibleColumns((current) => {
      const next = toggleColumn(current, id);
      persistVisibleColumns(next);
      return next;
    });
  }, []);

  const handleResetColumns = useCallback(() => {
    const all = [...EVENT_COLUMN_IDS];
    persistVisibleColumns(all);
    setVisibleColumns(all);
  }, []);
  const [columnWidths, setColumnWidths] = useState<number[]>(loadColumnWidths);

  const [copiedAddress, setCopiedAddress] = useState<string | null>(null);

  const dragRef = useRef<{
    index: number;
    startX: number;
    startWidth: number;
  } | null>(null);

  const startResize = useCallback(
    (index: number, clientX: number) => {
      dragRef.current = {
        index,
        startX: clientX,
        startWidth: columnWidths[index],
      };

      document.body.classList.add('event-explorer--resizing');
    },
    [columnWidths],
  );

  useEffect(() => {
    const handleMouseMove = (event: MouseEvent) => {
      if (!dragRef.current) {
        return;
      }

      const { index, startX, startWidth } = dragRef.current;
      const difference = event.clientX - startX;

      const newWidth = Math.max(MIN_COLUMN_WIDTH, startWidth + difference);

      setColumnWidths((current) => {
        const updated = [...current];
        updated[index] = newWidth;
        return updated;
      });
    };

    const handleMouseUp = () => {
      if (!dragRef.current) {
        return;
      }

      dragRef.current = null;
      document.body.classList.remove('event-explorer--resizing');

      setColumnWidths((current) => {
        persistColumnWidths(current);
        return current;
      });
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      document.body.classList.remove('event-explorer--resizing');
    };
  }, []);

  const handleCopyContract = useCallback(async (address: string) => {
    try {
      await syncCopyText(address);

      setCopiedAddress(address);

      window.setTimeout(() => {
        setCopiedAddress(null);
      }, 1800);
    } catch {
      setCopiedAddress(null);
    }
  }, []);

  const isCopied = useMemo(() => (address: string) => copiedAddress === address, [copiedAddress]);

  const handleSelectEvent = useCallback(
    (event: BlockchainEvent) => {
      onSelectEvent?.(event);
    },
    [onSelectEvent],
  );

  const gridTemplate = visibleGridTemplate(columnWidths, visibleColumns);
  // Visible columns keep their full width; narrow screens scroll sideways
  // instead of dropping identifier columns (#1160).
  const minTableWidth = EVENT_COLUMN_IDS.reduce(
    (total, id, index) => (visibleColumns.includes(id) ? total + columnWidths[index] : total),
    0,
  );
  const lastVisible = visibleColumns[visibleColumns.length - 1];

  return (
    <section className="event-explorer__table-wrapper">
      <div className="event-explorer__table-toolbar">
        <ColumnVisibilityMenu
          visible={visibleColumns}
          emptyColumns={emptyColumns}
          onToggle={handleToggleColumn}
          onReset={handleResetColumns}
        />
      </div>
      <div
        className="event-explorer__table-scroll"
        role="table"
        aria-label="Contract events"
        tabIndex={0}
      >
        <div
          className="event-explorer__table-header"
          role="rowgroup"
          style={{ gridTemplateColumns: gridTemplate, minWidth: minTableWidth }}
        >
          {COLUMN_LABELS.map((label, index) =>
            !visibleColumns.includes(EVENT_COLUMN_IDS[index]) ? null : (
              <div
                key={label}
                className="event-explorer__column-header"
                role="columnheader"
                data-column={EVENT_COLUMN_IDS[index]}
              >
                <span>{label}</span>

                {EVENT_COLUMN_IDS[index] !== lastVisible && (
                  <button
                    type="button"
                    className="event-explorer__resize-handle"
                    aria-label={`Resize ${label} column`}
                    onMouseDown={(event) => {
                      event.preventDefault();
                      startResize(index, event.clientX);
                    }}
                  />
                )}
              </div>
            ),
          )}
        </div>

        <div
          className="event-explorer__table-body"
          role="rowgroup"
          style={{
            ['--event-explorer-columns' as string]: gridTemplate,
            minWidth: minTableWidth,
          }}
        >
          {events.map((event) => (
            <EventExplorerCard
              key={event.eventId}
              event={event}
              onCopyContract={handleCopyContract}
              isCopied={isCopied(event.contractAddress)}
              onSelect={onSelectEvent ? handleSelectEvent : undefined}
              contractStatuses={contractStatuses}
              onContractClick={onContractClick}
              visibleColumns={visibleColumns}
            />
          ))}
        </div>
      </div>
    </section>
  );
});
