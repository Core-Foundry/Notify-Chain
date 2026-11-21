import { create } from 'zustand';
import type {
  BlockchainEvent,
  EventFilters,
  NotificationLifecycleStatus,
  NotificationSortOption,
} from '../types/event';
import { filterEvents } from '../utils/eventData';

interface EventStoreState {
  events: BlockchainEvent[];
  filters: EventFilters;
  /** Event ids selected for side-by-side comparison (#1156). */
  selectedEventIds: string[];
  isLoading: boolean;
  error: string | null;
  lastFetchedAt: number;
  lastSuccessfulSyncAt: number | null;
  lastSyncFailureAt: number | null;
  lastSyncError: string | null;

  setEvents: (events: BlockchainEvent[]) => void;
  appendEvents: (events: BlockchainEvent[]) => void;
  setSearch: (search: string) => void;
  setContractFilter: (contractAddress: string) => void;
  setEventTypeFilter: (eventType: string) => void;
  setStatusFilter: (status: EventFilters['status']) => void;
  setDateFrom: (dateFrom: string) => void;
  setDateTo: (dateTo: string) => void;
  setTxHashFilter: (txHash: string) => void;
  setSortBy: (sortBy: NotificationSortOption) => void;
  addTopicFilter: (topic: string) => void;
  removeTopicFilter: (topic: string) => void;
  clearTopicFilters: () => void;
  setLoading: (isLoading: boolean) => void;
  setError: (error: string | null) => void;
  markSyncSuccess: () => void;
  markSyncFailure: (error: string) => void;
  updateEventStatus: (
    targetEventId: string,
    status: NotificationLifecycleStatus,
  ) => void;
  invalidateEvents: () => void;
  toggleEventSelection: (eventId: string) => void;
  clearEventSelection: () => void;
}

function dedupeEventsById(
  events: BlockchainEvent[],
): BlockchainEvent[] {
  const byId = new Map<string, BlockchainEvent>();

  for (const event of events) {
    byId.set(event.eventId, event);
  }

  return Array.from(byId.values());
}

const SORT_STORAGE_KEY = 'notifychain:sortBy';

function loadPersistedSort(): NotificationSortOption {
  try {
    const saved = localStorage.getItem(
      SORT_STORAGE_KEY,
    ) as NotificationSortOption | null;

    if (
      saved &&
      [
        'newest',
        'oldest',
        'priority',
        'delivery_status',
      ].includes(saved)
    ) {
      return saved;
    }
  } catch {
    // localStorage may be unavailable in some environments
  }

  return 'newest';
}

export const useEventStore = create<EventStoreState>(
  (set) => ({
    events: [],

    filters: {
      search: '',
      contractAddress: 'all',
      eventType: 'all',
      status: 'all',
      dateFrom: '',
      dateTo: '',
      txHash: '',
      sortBy: loadPersistedSort(),
      topics: [],
    },

    selectedEventIds: [],

    isLoading: false,
    error: null,
    lastFetchedAt: 0,
    lastSuccessfulSyncAt: null,
    lastSyncFailureAt: null,
    lastSyncError: null,

    setEvents: (events) =>
      set({
        events: dedupeEventsById(events),
        lastFetchedAt: Date.now(),
      }),

    appendEvents: (events) =>
      set((state) => ({
        events: dedupeEventsById([
          ...state.events,
          ...events,
        ]),
      })),

    setSearch: (search) =>
      set((state) => ({
        filters: {
          ...state.filters,
          search,
        },
      })),

    setContractFilter: (contractAddress) =>
      set((state) => ({
        filters: {
          ...state.filters,
          contractAddress,
        },
      })),

    setEventTypeFilter: (eventType) =>
      set((state) => ({
        filters: {
          ...state.filters,
          eventType,
        },
      })),

    setStatusFilter: (status) =>
      set((state) => ({
        filters: {
          ...state.filters,
          status,
        },
      })),

    setDateFrom: (dateFrom) =>
      set((state) => ({
        filters: {
          ...state.filters,
          dateFrom,
        },
      })),

    setDateTo: (dateTo) =>
      set((state) => ({
        filters: {
          ...state.filters,
          dateTo,
        },
      })),

    setTxHashFilter: (txHash) =>
      set((state) => ({
        filters: {
          ...state.filters,
          txHash,
        },
      })),

    setSortBy: (sortBy) => {
      try {
        localStorage.setItem(
          SORT_STORAGE_KEY,
          sortBy,
        );
      } catch {
        // localStorage may be unavailable
      }

      set((state) => ({
        filters: {
          ...state.filters,
          sortBy,
        },
      }));
    },

    addTopicFilter: (topic) =>
      set((state) => ({
        filters: {
          ...state.filters,
          topics: state.filters.topics?.includes(topic)
            ? state.filters.topics
            : [...(state.filters.topics ?? []), topic],
        },
      })),

    removeTopicFilter: (topic) =>
      set((state) => ({
        filters: {
          ...state.filters,
          topics: (state.filters.topics ?? []).filter((t) => t !== topic),
        },
      })),

    clearTopicFilters: () =>
      set((state) => ({
        filters: {
          ...state.filters,
          topics: [],
        },
      })),

    setLoading: (isLoading) =>
      set({ isLoading }),

    setError: (error) =>
      set({ error }),

    markSyncSuccess: () =>
      set({
        lastSuccessfulSyncAt: Date.now(),
        lastSyncFailureAt: null,
        lastSyncError: null,
      }),

    markSyncFailure: (error) =>
      set({
        lastSyncFailureAt: Date.now(),
        lastSyncError: error,
      }),

    updateEventStatus: (targetEventId, status) =>
      set((state) => ({
        events: state.events.map((event) =>
          event.eventId === targetEventId ||
          event.relatedNotificationId === targetEventId
            ? {
                ...event,
                notificationStatus: status,
              }
            : event,
        ),
      })),

    invalidateEvents: () =>
      set({
        lastFetchedAt: 0,
      }),

    toggleEventSelection: (eventId) =>
      set((state) => ({
        selectedEventIds: state.selectedEventIds.includes(eventId)
          ? state.selectedEventIds.filter((id) => id !== eventId)
          : [...state.selectedEventIds, eventId],
      })),

    clearEventSelection: () => set({ selectedEventIds: [] }),
  }),
);

export function selectFilteredEvents(
  state: EventStoreState,
): BlockchainEvent[] {
  const { events, filters } = state;

  return filterEvents(
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
  );
}

export function selectEventCount(
  state: EventStoreState,
): number {
  return state.events.length;
}

export function selectFilters(
  state: EventStoreState,
): EventFilters {
  return state.filters;
}

export function selectContractOptions(
  state: EventStoreState,
): string[] {
  return Array.from(
    new Set(
      state.events.map(
        (event) => event.contractAddress,
      ),
    ),
  );
}

export function selectSelectedEvents(state: EventStoreState): BlockchainEvent[] {
  if (state.selectedEventIds.length === 0) return [];
  const byId = new Map(state.events.map((event) => [event.eventId, event]));
  return state.selectedEventIds
    .map((id) => byId.get(id))
    .filter((event): event is BlockchainEvent => Boolean(event));
}

export function selectTopicOptions(state: EventStoreState): string[] {
  return Array.from(new Set(state.events.flatMap((event) => event.topic ?? [])));
}

export function selectEventTypeOptions(
  state: EventStoreState,
): string[] {
  return Array.from(
    new Set(
      state.events
        .map((event) => event.eventName)
        .filter(
          (name): name is string => Boolean(name),
        ),
    ),
  );
}