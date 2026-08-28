import { useState, useCallback, memo, useMemo } from 'react';
import type { BlockchainEvent } from '../types/event';
import { EventExplorerCard } from './EventExplorerCard';

interface EventExplorerTableProps {
  events: BlockchainEvent[];
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

export const EventExplorerTable = memo(function EventExplorerTable({ events }: EventExplorerTableProps) {
  const [copiedAddress, setCopiedAddress] = useState<string | null>(null);

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

  return (
    <section className="event-explorer__table-wrapper">
      <div className="event-explorer__table-header" role="rowgroup">
        <div>Contract</div>
        <div>Event</div>
        <div>Kind</div>
        <div>Received</div>
        <div>Ledger</div>
        <div>Transaction</div>
      </div>

      <div className="event-explorer__table-body" role="rowgroup">
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
