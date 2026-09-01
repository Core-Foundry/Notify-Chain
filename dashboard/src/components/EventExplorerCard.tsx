import { memo, useMemo } from 'react';
import type { BlockchainEvent } from '../types/event';
import type { ContractStatus } from '../services/eventsApi';
import { formatTimestamp, parseToDate } from '../utils/formatTime';
import { formatTimestamp } from '../utils/formatTime';
import { CopyButton } from './CopyButton';

import { getEventKindClass, getEventKindLabel } from '../utils/eventTypeMapping';

function shortenAddress(address: string) {
  if (address.length <= 14) {
    return address;
  }

  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

interface EventExplorerCardProps {
  event: BlockchainEvent;
  onCopyContract: (contractAddress: string) => void;
  isCopied: boolean;
  onSelect?: (event: BlockchainEvent) => void;
  contractStatuses: ContractStatus[];
  contractStatuses?: ContractStatus[];
}

export function EventExplorerCard({
  event,
  onCopyContract,
  isCopied,
  onSelect,
  contractStatuses = [],
}: EventExplorerCardProps) {
  const contractStatus = contractStatuses.find((c) => c.address === event.contractAddress);
  const isPaused = contractStatus?.paused ?? false;
  const label = event.eventName ?? event.type;
  const badgeClass = getEventKindClass(event.type);
  const kindLabel = getEventKindLabel(event.type);
  const receivedAt = parseToDate(event.receivedAt);

  return (
    <article
      className={`event-explorer__row${onSelect ? ' event-card--clickable' : ''}`}
      role={onSelect ? 'button' : 'row'}
      tabIndex={onSelect ? 0 : undefined}
      data-event-id={event.eventId}
      onClick={onSelect ? () => onSelect(event) : undefined}
      onKeyDown={
        onSelect
          ? (e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onSelect(event);
              }
            }
          : undefined
      }
      aria-label={onSelect ? `View details for ${label} notification` : undefined}
    >
      <div className="event-explorer__cell" data-label="Contract" role="cell">
        <div className="event-explorer__contract-block">
          <p className="event-explorer__contract" title={event.contractAddress}>
            {shortenedContract}
          </p>
          <button
            type="button"
            className="event-explorer__copy-button"
            onClick={handleCopyClick}
            aria-label={`Copy contract address ${event.contractAddress}`}
          >
            {isCopied ? 'Copied' : 'Copy'}
          </button>
        </div>
      </div>

      <div className="event-explorer__cell" data-label="Event" role="cell">
        <p className="event-explorer__event-name">{label}</p>
      </div>

      <div className="event-explorer__cell" data-label="Kind" role="cell">
        <span className={`event-explorer__badge ${badgeClass}`}>{kindLabel}</span>
      </div>

      <div className="event-explorer__cell" data-label="Received" role="cell">
        <time dateTime={receivedAt?.toISOString()}>
          {formatTimestamp(event.receivedAt)}
        <time dateTime={new Date(event.receivedAt).toISOString()}>
          {formattedTime}
        </time>
      </div>

      <div className="event-explorer__cell" data-label="Ledger" role="cell">
        <div className="event-explorer__id-cell">
          <span>{event.ledger.toLocaleString()}</span>
          <CopyButton value={event.eventId} label="event ID" size="xs" />
        </div>
      </div>

      <div className="event-explorer__cell" data-label="Transaction" role="cell">
        {event.txHash ? (
          <div className="event-explorer__id-cell">
            <span title={event.txHash}>{shortenAddress(event.txHash)}</span>
            <CopyButton value={event.txHash} label="tx hash" size="xs" />
          </div>
        ) : (
          <span>—</span>
        )}
      </div>
    </article>
  );
});
