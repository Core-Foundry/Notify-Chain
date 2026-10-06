import { memo } from 'react';
import { useFilteredEvents } from '../hooks/useEventSelectors';
import { EventList } from './EventList';
import { EmptyState } from './EmptyState';

export const EventListPanel = memo(function EventListPanel() {
  const events = useFilteredEvents();

  if (events.length === 0) {
    return (
      <div className="event-panel event-panel--empty">
        <EmptyState
          size="inline"
          message="No events match the current filters. Try widening your search or clearing filters."
        />
      </div>
    );
  }

  return (
    <div className="event-panel">
      <EventList events={events} />
    </div>
  );
});
