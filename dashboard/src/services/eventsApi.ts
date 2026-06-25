import type { BlockchainEvent } from '../types/event';

export async function fetchEvents(apiUrl: string): Promise<BlockchainEvent[]> {
  const response = await fetch(apiUrl);
  if (!response.ok) {
    throw new Error(`Failed to fetch events: ${response.status}`);
  }

  const payload = (await response.json()) as { events?: BlockchainEvent[] };
  return payload.events ?? [];
}
