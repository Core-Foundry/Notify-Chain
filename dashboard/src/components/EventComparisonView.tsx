import { memo } from 'react';
import type { BlockchainEvent } from '../types/event';
import { useEventSelection, useSelectedEvents } from '../hooks/useEventSelectors';
import { formatTimestamp } from '../utils/formatTime';

type ComparableField = {
  label: string;
  get: (event: BlockchainEvent) => string;
};

// Preserves the original payload values (no reformatting/coercion beyond
// turning them into displayable strings) so differences are faithful to the
// underlying data.
const FIELDS: ComparableField[] = [
  { label: 'Event ID', get: (e) => e.eventId },
  { label: 'Type', get: (e) => e.eventName ?? e.type },
  { label: 'Contract', get: (e) => e.contractAddress },
  { label: 'Ledger', get: (e) => String(e.ledger) },
  { label: 'Topic', get: (e) => JSON.stringify(e.topic ?? []) },
  { label: 'Value', get: (e) => e.value },
  { label: 'Transaction', get: (e) => e.txHash ?? '' },
  { label: 'Received at', get: (e) => formatTimestamp(e.receivedAt) },
  { label: 'Status', get: (e) => e.notificationStatus ?? '' },
];

/**
 * Side-by-side comparison of two or more selected events (#1156).
 *
 * Common fields are aligned row by row; a row whose values differ across the
 * selected events is marked so differences stand out. Values are shown
 * exactly as received (JSON.stringify for structured fields, otherwise the
 * raw string) rather than summarized, and long values wrap instead of being
 * truncated so large payloads stay readable.
 */
export const EventComparisonView = memo(function EventComparisonView() {
  const events = useSelectedEvents();
  const { clearEventSelection, toggleEventSelection } = useEventSelection();

  if (events.length < 2) {
    return null;
  }

  return (
    <section className="event-comparison" aria-label="Event comparison">
      <div className="event-comparison__header">
        <h2>Comparing {events.length} events</h2>
        <button type="button" onClick={clearEventSelection}>
          Close comparison
        </button>
      </div>
      <div className="event-comparison__table-wrapper">
        <table className="event-comparison__table">
          <thead>
            <tr>
              <th scope="col">Field</th>
              {events.map((event) => (
                <th scope="col" key={event.eventId}>
                  {event.eventId}
                  <button
                    type="button"
                    aria-label={`Remove ${event.eventId} from comparison`}
                    onClick={() => toggleEventSelection(event.eventId)}
                  >
                    ×
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {FIELDS.map((field) => {
              const values = events.map((event) => field.get(event));
              const isDifferent = new Set(values).size > 1;
              return (
                <tr
                  key={field.label}
                  className={isDifferent ? 'event-comparison__row--diff' : undefined}
                >
                  <th scope="row">{field.label}</th>
                  {values.map((value, index) => (
                    <td
                      key={events[index].eventId}
                      className="event-comparison__value"
                      title={value}
                    >
                      {value || <span className="event-comparison__empty">—</span>}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
});
