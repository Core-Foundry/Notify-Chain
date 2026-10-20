import { RawEventData } from '../services/event-raw-retention';

export interface DisplayEvent {
  eventId: string;
  contractAddress: string;
  eventName: string | null;
  ledger: number;
  type: string;
  topic: string[];
  value: string;
  txHash?: string;
  receivedAt: number;
  /** Retained original event representation (issue #945). */
  raw?: RawEventData | null;
}
