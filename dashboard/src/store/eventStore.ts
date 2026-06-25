import { create } from 'zustand';
import type { BlockchainEvent, EventFilters, NotificationStatus } from '../types/event';
import { NOTIFICATION_STATUS_EVENTS } from '../types/event';
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
  setEvents: (events: BlockchainEvent[]) => void;
  appendEvents: (events: BlockchainEvent[]) => void;
  setSearch: (search: string) => void;
  setContractFilter: (contractAddress: string) => void;
  setEventTypeFilter: (eventType: string) => void;
  setLoading: (isLoading: boolean) => void;
  setError: (error: string | null) => void;
  /**
   * Patch the `notificationStatus` of every cached event whose `eventId`
   * matches `targetEventId`. Call this immediately after a successful
   * blockchain transaction that changes notification state (e.g. a
   * `notification_expired` or `notification_revoked` event confirms on-chain)
   * so the UI reflects the new status without requiring a full refetch.
   *
   * This is the primary fix for the cache–blockchain desynchronization: instead
   * of leaving the stale status in the store until the next hard refresh, we
   * update the matching entry in-place the moment the blockchain confirms.
   */
  updateEventStatus: (targetEventId: string, status: NotificationStatus) => void;
  /**
   * Reset `lastFetchedAt` to `0`, forcing the next `loadEvents` call to treat
   * the cache as stale and re-fetch unconditionally. Call this after any
   * blockchain transaction that may have changed notification state but whose
   * exact `targetEventId` is unavailable.
   */
  invalidateEvents: () => void;
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
  isLoading: false,
  error: null,
  lastFetchedAt: 0,
  setEvents: (events) => set({ events: dedupeEventsById(events), lastFetchedAt: Date.now() }),
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
  updateEventStatus: (targetEventId, status) =>
    set((state) => ({
      events: state.events.map((event) =>
        event.eventId === targetEventId || event.relatedNotificationId === targetEventId
          ? { ...event, notificationStatus: status }
          : event
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
