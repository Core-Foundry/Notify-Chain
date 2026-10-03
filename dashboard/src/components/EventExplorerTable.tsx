import { useState, useCallback, memo, useMemo } from 'react';
import type { BlockchainEvent } from '../types/event';
import { EventExplorerCard } from './EventExplorerCard';

const STORAGE_KEY = 'notify-chain-event-table-widths';

export const DEFAULT_COLUMN_WIDTHS = [220, 160, 110, 180, 100, 160] as const;
export const MIN_COLUMN_WIDTH = 80;

const COLUMN_LABELS = ['Contract', 'Event', 'Kind', 'Received', 'Ledger', 'Transaction'] as const;

interface EventExplorerTableProps {
  events: BlockchainEvent[];
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

export const EventExplorerTable = memo(function EventExplorerTable({ events }: EventExplorerTableProps) {
  const [copiedAddress, setCopiedAddress] = useState<string | null>(null);

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

  const handleCopyContract = async (address: string) => {
  const handleCopyContract = useCallback(async (address: string) => {
    try {
      await syncCopyText(address);
      setCopiedAddress(address);
      window.setTimeout(() => setCopiedAddress(null), 1800);
    } catch {
      setCopiedAddress(null);
    }
  }, []);

  const isCopied = useMemo(() => (address: string) => copiedAddress === address, [copiedAddress]);

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
        className="event-explorer__table-body"
        role="rowgroup"
        style={{ ['--event-explorer-columns' as string]: gridTemplate }}
      >
        {events.map((event) => (
          <EventExplorerCard
            key={event.eventId}
            event={event}
            onCopyContract={handleCopyContract}
            isCopied={isCopied(event.contractAddress)}
          />
        ))}
      </div>
    </section>
  );
});
