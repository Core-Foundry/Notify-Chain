import { create } from 'zustand';
import type {
  BlockchainEvent,
  EventFilters,
  NotificationLifecycleStatus,
  NotificationReadFilter,
  NotificationSortOption,
} from '../types/event';
import { filterEvents } from '../utils/eventData';

interface EventStoreState {
  events: BlockchainEvent[];
  filters: EventFilters;
  isLoading: boolean;
  error: string | null;
  /**
   * Epoch-ms timestamp of the last successful event fetch. Used to detect
   * staleness: if a blockchain transaction mutates notification state after
   * `lastFetchedAt`, callers should re-fetch to get authoritative data.
   *
   * Starts at `0` (never fetched) so the first load is always treated as fresh
   * after it completes.
   */
  lastFetchedAt: number;
  lastSuccessfulSyncAt: number | null;
  lastSyncFailureAt: number | null;
  lastSyncError: string | null;
  setEvents: (events: BlockchainEvent[]) => void;
  appendEvents: (events: BlockchainEvent[]) => void;
  setSearch: (search: string) => void;
  setContractFilter: (contractAddress: string) => void;
  setEventTypeFilter: (eventType: string) => void;
  /** Filter by UI read/unread status. Accepts `NotificationStatus` ('all' | 'read' | 'unread'). */
  setStatusFilter: (status: NotificationReadFilter) => void;
  setDateFrom: (dateFrom: string) => void;
  setDateTo: (dateTo: string) => void;
  setTxHashFilter: (txHash: string) => void;
  /**
   * Set the active sort order (#495).
   * The selection is persisted to localStorage so it survives page refreshes.
   */
  setSortBy: (sortBy: NotificationSortOption) => void;
  setLoading: (isLoading: boolean) => void;
  setError: (error: string | null) => void;
  markSyncSuccess: () => void;
  markSyncFailure: (error: string) => void;
  /**
   * Patch the `notificationStatus` of every cached event whose `eventId`
   * matches `targetEventId`. Call this immediately after a successful
   * blockchain transaction that changes notification state (e.g. a
   * `notification_expired` or `notification_revoked` event confirms on-chain)
   * so the UI reflects the new status without requiring a full refetch.
   *
   * Accepts `NotificationLifecycleStatus` ('active' | 'expired' | 'revoked').
   */
  updateEventStatus: (targetEventId: string, status: NotificationLifecycleStatus) => void;
  /**
   * Reset `lastFetchedAt` to `0`, forcing the next `loadEvents` call to treat
   * the cache as stale and re-fetch unconditionally. Call this after any
   * blockchain transaction that may have changed notification state but whose
   * exact `targetEventId` is unavailable.
   */
  invalidateEvents: () => void;
}

function dedupeEventsById(events: BlockchainEvent[]): BlockchainEvent[] {
  const byId = new Map<string, BlockchainEvent>();
  for (const event of events) {
    byId.set(event.eventId, event);
  }
  return Array.from(byId.values());
}

/** Persist the selected sort order across page refreshes. */
const SORT_STORAGE_KEY = 'notifychain:sortBy';

function loadPersistedSort(): NotificationSortOption {
  try {
    const saved = localStorage.getItem(SORT_STORAGE_KEY) as NotificationSortOption | null;
    if (saved && ['newest', 'oldest', 'priority', 'delivery_status'].includes(saved)) {
      return saved;
    }
  } catch {
    // localStorage may be unavailable in some environments
  }
  return 'newest';
}

export const useEventStore = create<EventStoreState>((set) => ({
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
  },
  isLoading: false,
  error: null,
  lastFetchedAt: 0,
  lastSuccessfulSyncAt: null,
  lastSyncFailureAt: null,
  lastSyncError: null,
  setEvents: (events) => set({ events: dedupeEventsById(events), lastFetchedAt: Date.now() }),
  appendEvents: (events) =>
    set((state) => ({
      events: dedupeEventsById([...state.events, ...events]),
    })),
  setSearch: (search) => set((state) => ({ filters: { ...state.filters, search } })),
  setContractFilter: (contractAddress) =>
    set((state) => ({ filters: { ...state.filters, contractAddress } })),
  setEventTypeFilter: (eventType) => set((state) => ({ filters: { ...state.filters, eventType } })),
  setStatusFilter: (status) => set((state) => ({ filters: { ...state.filters, status } })),
  setDateFrom: (dateFrom) => set((state) => ({ filters: { ...state.filters, dateFrom } })),
  setDateTo: (dateTo) => set((state) => ({ filters: { ...state.filters, dateTo } })),
  setTxHashFilter: (txHash) => set((state) => ({ filters: { ...state.filters, txHash } })),
  setSortBy: (sortBy) => {
    try {
      localStorage.setItem(SORT_STORAGE_KEY, sortBy);
    } catch {
      // localStorage may be unavailable
    }
    set((state) => ({ filters: { ...state.filters, sortBy } }));
  },
  setLoading: (isLoading) => set({ isLoading }),
  setError: (error) => set({ error }),
  markSyncSuccess: () =>
    set({ lastSuccessfulSyncAt: Date.now(), lastSyncFailureAt: null, lastSyncError: null }),
  markSyncFailure: (error) => set({ lastSyncFailureAt: Date.now(), lastSyncError: error }),
  updateEventStatus: (targetEventId, status) =>
    set((state) => ({
      events: state.events.map((event) =>
        event.eventId === targetEventId || event.relatedNotificationId === targetEventId
          ? { ...event, notificationStatus: status }
          : event,
      ),
    })),
  invalidateEvents: () => set({ lastFetchedAt: 0 }),
}));

export function selectFilteredEvents(state: EventStoreState): BlockchainEvent[] {
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
      state.events.map((event) => event.eventName).filter((name): name is string => Boolean(name)),
    ),
  );
}
