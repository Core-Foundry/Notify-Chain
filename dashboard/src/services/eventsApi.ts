import type { BlockchainEvent } from '../types/event';
import { NOTIFICATION_STATUS_EVENTS } from '../types/event';

/**
 * Resolves the `notificationStatus` field on each incoming event by inspecting
 * its `eventName` against the known status-transition event names.
 *
 * This ensures that after a hard page refresh (where the store is empty and
 * events are fetched fresh from the API), notification statuses are accurately
 * set from the first render — not left `undefined` until a mutation action
 * patches them in.
 */
function hydrateNotificationStatus(events: BlockchainEvent[]): BlockchainEvent[] {
  return events.map((event) => {
    if (!event.eventName) return event;
    const status = NOTIFICATION_STATUS_EVENTS[event.eventName];
    if (!status) return event;
    return { ...event, notificationStatus: status };
  });
}

export interface ContractStatus {
  address: string;
  paused: boolean;
  error?: string;
}

export interface StatusResponse {
  timestamp: string;
  contracts: ContractStatus[];
}

export async function fetchEvents(apiUrl: string): Promise<BlockchainEvent[]> {
  const response = await fetch(apiUrl);
  if (!response.ok) {
    throw new Error(`Failed to fetch events: ${response.status}`);
  }

  const payload = (await response.json()) as { events?: BlockchainEvent[] };
  const raw = payload.events ?? [];
  return hydrateNotificationStatus(raw);
}

export async function fetchStatus(apiUrl: string): Promise<StatusResponse> {
  const response = await fetch(`${apiUrl}/api/status`);
  if (!response.ok) {
    throw new Error(`Failed to fetch status: ${response.status}`);
  }
  return response.json() as Promise<StatusResponse>;
}
