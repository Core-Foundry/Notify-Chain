import type { BlockchainEvent } from '../types/event';
import { formatTimestamp } from '../utils/formatTime';

const EVENT_KIND_STYLES: Record<string, string> = {
  contract: 'event-explorer__badge--blue',
  system: 'event-explorer__badge--purple',
  debug: 'event-explorer__badge--default',
};

const EVENT_KIND_LABELS: Record<string, string> = {
  contract: 'Contract',
  system: 'System',
  debug: 'Debug',
};

function shortenAddress(address: string) {
  if (address.length <= 14) {
    return address;
  }

  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

function getEventKindClass(type: string) {
  return EVENT_KIND_STYLES[type.toLowerCase()] ?? EVENT_KIND_STYLES.debug;
}

function getEventKindLabel(type: string) {
  return EVENT_KIND_LABELS[type.toLowerCase()] ?? 'Unknown';
}

interface EventExplorerCardProps {
  event: BlockchainEvent;
  onCopyContract: (contractAddress: string) => void;
  isCopied: boolean;
}

export function EventExplorerCard({ event, onCopyContract, isCopied }: EventExplorerCardProps) {
  const label = event.eventName ?? event.type;
  const badgeClass = getEventKindClass(event.type);
  const kindLabel = getEventKindLabel(event.type);

  return (
    <article className="event-explorer__row" role="row" data-event-id={event.eventId}>
      <div className="event-explorer__cell" data-label="Contract" role="cell">
        <div>
          <p className="event-explorer__contract" title={event.contractAddress}>
            {shortenAddress(event.contractAddress)}
          </p>
          <button
            type="button"
            className="event-explorer__copy-button"
            onClick={() => onCopyContract(event.contractAddress)}
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
        <time dateTime={new Date(event.receivedAt).toISOString()}>
          {formatTimestamp(event.receivedAt)}
        </time>
      </div>

      <div className="event-explorer__cell" data-label="Ledger" role="cell">
        <span>{event.ledger.toLocaleString()}</span>
      </div>

      <div className="event-explorer__cell" data-label="Transaction" role="cell">
        <span title={event.txHash ?? 'No transaction hash'}>
          {event.txHash ? shortenAddress(event.txHash) : '—'}
        </span>
      </div>
    </article>
  );
}
