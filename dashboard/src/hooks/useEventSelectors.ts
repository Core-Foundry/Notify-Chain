import { useMemo } from 'react';
import { useShallow } from 'zustand/react/shallow';
import {
  selectEventCount,
  selectFilters,
  selectSelectedEvents,
  selectTopicOptions,
  useEventStore,
} from '../store/eventStore';
import { filterEvents } from '../utils/eventData';

export function useFilteredEvents() {
  const events = useEventStore((state) => state.events);
  const filters = useEventStore(useShallow(selectFilters));

  return useMemo(
    () =>
      filterEvents(
        events,
        filters.search,
        filters.contractAddress,
        filters.eventType,
        filters.status,
        filters.dateFrom,
        filters.dateTo,
        filters.txHash,
        filters.sortBy ?? 'newest',
        filters.topics ?? [],
      ),
    [events, filters],
  );
}

export function useTopicOptions() {
  return useEventStore(selectTopicOptions);
}

export function useTopicFilterActions() {
  return useEventStore(
    useShallow((state) => ({
      addTopicFilter: state.addTopicFilter,
      removeTopicFilter: state.removeTopicFilter,
      clearTopicFilters: state.clearTopicFilters,
    })),
  );
}

export function useEventFilters() {
  return useEventStore(useShallow(selectFilters));
}

export function useEventCount() {
  return useEventStore(selectEventCount);
}

export function useFilterOptions() {
  const events = useEventStore((state) => state.events);

  return useMemo(() => {
    const contractOptions = Array.from(new Set(events.map((event) => event.contractAddress)));
    const eventTypeOptions = Array.from(
      new Set(
        events.map((event) => event.eventName).filter((name): name is string => Boolean(name)),
      ),
    );

    return { contractOptions, eventTypeOptions };
  }, [events]);
}

export function useEventSelection() {
  return useEventStore(
    useShallow((state) => ({
      selectedEventIds: state.selectedEventIds,
      toggleEventSelection: state.toggleEventSelection,
      clearEventSelection: state.clearEventSelection,
    })),
  );
}

export function useSelectedEvents() {
  return useEventStore(useShallow(selectSelectedEvents));
}

export function useEventLoadingState() {
  return useEventStore(
    useShallow((state) => ({
      isLoading: state.isLoading,
      error: state.error,
    })),
  );
}
