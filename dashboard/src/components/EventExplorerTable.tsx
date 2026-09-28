import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type UIEvent,
} from 'react';
import type { BlockchainEvent } from '../types/event';
import type { ContractStatus } from '../services/eventsApi';
import { EventExplorerCard } from './EventExplorerCard';

const STORAGE_KEY = 'notify-chain-event-table-widths';
const COMPACT_LAYOUT_QUERY = '(max-width: 640px)';
const DEFAULT_VIEWPORT_HEIGHT = 600;

export const DEFAULT_COLUMN_WIDTHS = [220, 160, 110, 180, 100, 160] as const;
export const MIN_COLUMN_WIDTH = 80;
/** Fixed row height (px) assumed by the virtualizer — mirrors `.event-explorer__row`. */
export const ROW_HEIGHT = 112;
/** Extra rows rendered above and below the viewport to keep scrolling smooth. */
export const OVERSCAN = 6;

const COLUMN_LABELS = ['Contract', 'Event', 'Kind', 'Received', 'Ledger', 'Transaction'] as const;

export interface EventExplorerTableProps {
  events: BlockchainEvent[];
  onSelectEvent?: (event: BlockchainEvent) => void;
  contractStatuses?: ContractStatus[];
}

export function widthsToGridTemplate(widths: readonly number[]): string {
  return widths.map((width) => `${width}px`).join(' ');
}

export function loadColumnWidths(): number[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [...DEFAULT_COLUMN_WIDTHS];
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

export function persistColumnWidths(widths: readonly number[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(widths));
  } catch {
    // Persistence is best-effort; ignore storage-quota / privacy-mode failures.
  }
}

async function syncCopyText(text: string): Promise<void> {
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

/**
 * The fixed-height windowing maths below assumes the desktop grid row. On the
 * stacked card layout (`max-width: 640px`) rows are variable height, so the
 * table falls back to rendering the plain list there.
 */
function useIsCompactLayout(): boolean {
  const [isCompact, setIsCompact] = useState(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return false;
    }
    return window.matchMedia(COMPACT_LAYOUT_QUERY).matches;
  });

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return;
    }
    const query = window.matchMedia(COMPACT_LAYOUT_QUERY);
    const handleChange = (mediaEvent: MediaQueryListEvent) => {
      setIsCompact(mediaEvent.matches);
    };
    query.addEventListener('change', handleChange);
    return () => query.removeEventListener('change', handleChange);
  }, []);

  return isCompact;
}

export const EventExplorerTable = memo(function EventExplorerTable({
  events,
  onSelectEvent,
  contractStatuses,
}: EventExplorerTableProps) {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const resizeRef = useRef<{ index: number; startX: number; startWidths: number[] } | null>(null);

  const [columnWidths, setColumnWidths] = useState<number[]>(() => loadColumnWidths());
  const [copiedAddress, setCopiedAddress] = useState<string | null>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(DEFAULT_VIEWPORT_HEIGHT);
  const isCompactLayout = useIsCompactLayout();

  // ── Copy contract address ────────────────────────────────────────────────
  const handleCopyContract = useCallback(async (address: string) => {
    try {
      await syncCopyText(address);
      setCopiedAddress(address);
      window.setTimeout(() => {
        setCopiedAddress((current) => (current === address ? null : current));
      }, 1800);
    } catch {
      setCopiedAddress(null);
    }
  }, []);

  const isCopied = useCallback(
    (address: string) => copiedAddress === address,
    [copiedAddress],
  );

  // ── Column resizing (persisted) ──────────────────────────────────────────
  const handleResizeMove = useCallback((mouseEvent: MouseEvent) => {
    const state = resizeRef.current;
    if (!state) return;
    const delta = mouseEvent.clientX - state.startX;
    const next = state.startWidths.map((width, index) =>
      index === state.index ? Math.max(MIN_COLUMN_WIDTH, width + delta) : width,
    );
    setColumnWidths(next);
    persistColumnWidths(next);
  }, []);

  const stopResize = useCallback(() => {
    if (!resizeRef.current) return;
    resizeRef.current = null;
    document.body.classList.remove('event-explorer--resizing');
    window.removeEventListener('mousemove', handleResizeMove);
    window.removeEventListener('mouseup', stopResize);
  }, [handleResizeMove]);

  const startResize = useCallback(
    (index: number, startX: number) => {
      resizeRef.current = { index, startX, startWidths: columnWidths };
      document.body.classList.add('event-explorer--resizing');
      window.addEventListener('mousemove', handleResizeMove);
      window.addEventListener('mouseup', stopResize);
    },
    [columnWidths, handleResizeMove, stopResize],
  );

  useEffect(
    () => () => {
      document.body.classList.remove('event-explorer--resizing');
      window.removeEventListener('mousemove', handleResizeMove);
      window.removeEventListener('mouseup', stopResize);
    },
    [handleResizeMove, stopResize],
  );

  // ── Windowed rendering ───────────────────────────────────────────────────
  useEffect(() => {
    setScrollTop(0);
    if (scrollRef.current) {
      scrollRef.current.scrollTop = 0;
    }
  }, [events]);

  const handleScroll = useCallback((scrollEvent: UIEvent<HTMLDivElement>) => {
    setScrollTop(scrollEvent.currentTarget.scrollTop);
  }, []);

  const attachScrollRef = useCallback((node: HTMLDivElement | null) => {
    scrollRef.current = node;
    if (node) {
      setViewportHeight(node.clientHeight || DEFAULT_VIEWPORT_HEIGHT);
    }
  }, []);

  const windowState = useMemo(() => {
    const totalHeight = events.length * ROW_HEIGHT;
    if (isCompactLayout) {
      return { startIndex: 0, endIndex: events.length, totalHeight };
    }
    const visibleCount = Math.ceil(viewportHeight / ROW_HEIGHT) + OVERSCAN;
    const maxScrollTop = Math.max(0, totalHeight - viewportHeight);
    const clampedScrollTop = Math.min(scrollTop, maxScrollTop);
    const startIndex = Math.max(0, Math.floor(clampedScrollTop / ROW_HEIGHT) - OVERSCAN);
    const endIndex = Math.min(events.length, startIndex + visibleCount + OVERSCAN);
    return { startIndex, endIndex, totalHeight };
  }, [events, isCompactLayout, scrollTop, viewportHeight]);

  const isWindowed = !isCompactLayout;
  const visibleEvents = isWindowed
    ? events.slice(windowState.startIndex, windowState.endIndex)
    : events;
  const gridTemplate = widthsToGridTemplate(columnWidths);

  return (
    <section className="event-explorer__table-wrapper">
      <div
        className="event-explorer__table-header"
        role="rowgroup"
        style={{ gridTemplateColumns: gridTemplate }}
      >
        {COLUMN_LABELS.map((label, index) => (
          <div key={label} className="event-explorer__column-header" role="columnheader">
            <span>{label}</span>
            {index < COLUMN_LABELS.length - 1 && (
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
        ))}
      </div>

      <div
        ref={attachScrollRef}
        className={`event-explorer__table-body${
          isWindowed ? ' event-explorer__table-body--virtualized' : ''
        }`}
        role="rowgroup"
        tabIndex={0}
        aria-label={`Smart contract events, ${events.length.toLocaleString()} rows`}
        onScroll={handleScroll}
        style={{ ['--event-explorer-columns' as string]: gridTemplate }}
      >
        {isWindowed ? (
          <div
            className="event-explorer__table-spacer"
            role="presentation"
            style={{ height: `${windowState.totalHeight}px` }}
          >
            {visibleEvents.map((event, index) => {
              const position = windowState.startIndex + index;
              return (
                <div
                  key={event.eventId}
                  className="event-explorer__virtual-row"
                  role="presentation"
                  style={{ transform: `translateY(${position * ROW_HEIGHT}px)` }}
                >
                  <EventExplorerCard
                    event={event}
                    onCopyContract={handleCopyContract}
                    isCopied={isCopied(event.contractAddress)}
                    onSelect={onSelectEvent}
                    contractStatuses={contractStatuses}
                  />
                </div>
              );
            })}
          </div>
        ) : (
          visibleEvents.map((event) => (
            <EventExplorerCard
              key={event.eventId}
              event={event}
              onCopyContract={handleCopyContract}
              isCopied={isCopied(event.contractAddress)}
              onSelect={onSelectEvent}
              contractStatuses={contractStatuses}
            />
          ))
        )}
      </div>
    </section>
  );
});
