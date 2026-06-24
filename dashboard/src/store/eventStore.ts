import { create } from 'zustand';
import type { BlockchainEvent, EventFilters, SavedFilter } from '../types/event';
import { filterEvents } from '../utils/eventData';
import { getSavedFilters, addSavedFilter, updateSavedFilter, deleteSavedFilter } from '../utils/filterPersistence';

interface EventStoreState {
  events: BlockchainEvent[];
  filters: EventFilters;
  savedFilters: SavedFilter[];
  isLoading: boolean;
  error: string | null;
  setEvents: (events: BlockchainEvent[]) => void;
  appendEvents: (events: BlockchainEvent[]) => void;
  setSearch: (search: string) => void;
  setContractFilter: (contractAddress: string) => void;
  setEventTypeFilter: (eventType: string) => void;
  setLoading: (isLoading: boolean) => void;
  setError: (error: string | null) => void;
  saveCurrentFilter: (name: string) => void;
  loadSavedFilter: (id: string) => void;
  renameSavedFilter: (id: string, newName: string) => void;
  deleteSavedFilter: (id: string) => void;
  loadSavedFiltersFromStorage: () => void;
}

function dedupeEventsById(events: BlockchainEvent[]): BlockchainEvent[] {
  const seenEventIds = new Set<string>();

  return events.filter((event) => {
    if (seenEventIds.has(event.eventId)) {
      return false;
    }

    seenEventIds.add(event.eventId);
    return true;
  });
}

export const useEventStore = create<EventStoreState>((set) => ({
  events: [],
  filters: {
    search: '',
    contractAddress: 'all',
    eventType: 'all',
  },
  savedFilters: [],
  isLoading: false,
  error: null,
  setEvents: (events) => set({ events: dedupeEventsById(events) }),
  appendEvents: (events) =>
    set((state) => ({
      events: dedupeEventsById([...state.events, ...events]),
    })),
  setSearch: (search) =>
    set((state) => ({
      filters: { ...state.filters, search },
    })),
  setContractFilter: (contractAddress) =>
    set((state) => ({
      filters: { ...state.filters, contractAddress },
    })),
  setEventTypeFilter: (eventType) =>
    set((state) => ({
      filters: { ...state.filters, eventType },
    })),
  setLoading: (isLoading) => set({ isLoading }),
  setError: (error) => set({ error }),
  saveCurrentFilter: (name) =>
    set((state) => {
      const newFilter: SavedFilter = {
        id: `filter-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        name,
        filters: { ...state.filters },
        createdAt: Date.now(),
      };
      const updated = addSavedFilter(newFilter);
      return { savedFilters: updated };
    }),
  loadSavedFilter: (id) =>
    set((state) => {
      const savedFilter = state.savedFilters.find((f) => f.id === id);
      if (!savedFilter) return state;
      return { filters: { ...savedFilter.filters } };
    }),
  renameSavedFilter: (id, newName) =>
    set(() => {
      const updated = updateSavedFilter(id, { name: newName });
      return { savedFilters: updated };
    }),
  deleteSavedFilter: (id) =>
    set(() => {
      const updated = deleteSavedFilter(id);
      return { savedFilters: updated };
    }),
  loadSavedFiltersFromStorage: () =>
    set(() => ({
      savedFilters: getSavedFilters(),
    })),
}));

export function selectFilteredEvents(state: EventStoreState): BlockchainEvent[] {
  const { events, filters } = state;
  return filterEvents(
    events,
    filters.search,
    filters.contractAddress,
    filters.eventType
  );
}

export function selectEventCount(state: EventStoreState): number {
  return state.events.length;
}

export function selectFilters(state: EventStoreState): EventFilters {
  return state.filters;
}

export function selectContractOptions(state: EventStoreState): string[] {
  return Array.from(new Set(state.events.map((event) => event.contractAddress)));
}

export function selectEventTypeOptions(state: EventStoreState): string[] {
  return Array.from(
    new Set(
      state.events
        .map((event) => event.eventName)
        .filter((name): name is string => Boolean(name))
    )
  );
}

export function selectSavedFilters(state: EventStoreState) {
  return state.savedFilters;
}
