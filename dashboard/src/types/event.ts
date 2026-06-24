export interface BlockchainEvent {
  eventId: string;
  contractAddress: string;
  eventName: string | null;
  ledger: number;
  type: string;
  topic: string[];
  value: string;
  txHash?: string;
  receivedAt: number;
}

export interface EventFilters {
  search: string;
  contractAddress: string;
  eventType: string;
}

export interface SavedFilter {
  id: string;
  name: string;
  filters: EventFilters;
  createdAt: number;
}
