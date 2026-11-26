import type { BlockchainEvent } from '../types/event';
import { formatTimestamp } from '../utils/formatTime';
import { EXTERNAL_LINK_PROPS, getEventExplorerUrl } from '../utils/explorerLinks';

export interface PrintableEventDetailsProps {
  event: BlockchainEvent;
}

/**
 * Print-only representation of a single blockchain event.
 *
 * The section is hidden on screen (see styles/print.css) and promoted to the
 * only visible content when the user prints. It deliberately includes the full
 * identifiers rather than the truncated versions used by the on-screen card so
 * the printed report is useful for incident investigations.
 */
export function PrintableEventDetails({ event }: PrintableEventDetailsProps) {
  const explorerUrl = getEventExplorerUrl(event);

  return (
    <section className="printable-event-details" aria-label="Printable event details">
      <header className="printable-event-details__header">
        <h1 className="printable-event-details__title">Event details report</h1>
        <p className="printable-event-details__generated">
          Generated {formatTimestamp(Date.now())}
        </p>
      </header>

      <dl className="printable-event-details__fields">
        <div className="printable-event-details__field">
          <dt>Event</dt>
          <dd>{event.eventName ?? event.type}</dd>
        </div>
        <div className="printable-event-details__field">
          <dt>Event ID</dt>
          <dd className="printable-event-details__monospace">{event.eventId}</dd>
        </div>
        <div className="printable-event-details__field">
          <dt>Ledger</dt>
          <dd>{event.ledger}</dd>
        </div>
        <div className="printable-event-details__field">
          <dt>Received at</dt>
          <dd>{formatTimestamp(event.receivedAt)}</dd>
        </div>
        <div className="printable-event-details__field">
          <dt>Contract address</dt>
          <dd className="printable-event-details__monospace">{event.contractAddress}</dd>
        </div>
        <div className="printable-event-details__field">
          <dt>Transaction hash</dt>
          <dd className="printable-event-details__monospace">{event.txHash ?? 'Not available'}</dd>
        </div>
        <div className="printable-event-details__field">
          <dt>Event type</dt>
          <dd>{event.type}</dd>
        </div>
        <div className="printable-event-details__field">
          <dt>Topics</dt>
          <dd className="printable-event-details__monospace">
            {event.topic.length > 0 ? event.topic.join(', ') : 'None'}
          </dd>
        </div>
        <div className="printable-event-details__field printable-event-details__field--payload">
          <dt>Event payload</dt>
          <dd className="printable-event-details__monospace">{event.value}</dd>
        </div>
      </dl>

      {explorerUrl && (
        <footer className="printable-event-details__footer">
          <span>Transaction explorer:</span>{' '}
          <a href={explorerUrl} {...EXTERNAL_LINK_PROPS}>
            {explorerUrl}
          </a>
        </footer>
      )}
    </section>
  );
}
