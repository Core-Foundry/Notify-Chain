import type { BlockchainEvent } from '../types/event';

export interface ContractStatus {
  address: string;
  paused: boolean;
  error?: string;
}

export interface StatusResponse {
  timestamp: string;
  contracts: ContractStatus[];
}

export interface NotificationSearchResult {
  id: number;
  source: 'scheduled' | 'processed';
  eventId: string | null;
  txHash: string | null;
  contractAddress: string | null;
  notificationType: string | null;
  targetRecipient: string | null;
  status: string;
  createdAt: string;
  payload: string | null;
}

export interface NotificationSearchResponse {
  results: NotificationSearchResult[];
  total: number;
  limit: number;
  offset: number;
  itemCount: number;
  totalPages: number;
}

export interface NotificationSearchParams {
  q?: string;
  sender?: string;
  txHash?: string;
  eventId?: string;
  status?: string;
  type?: string;
  limit?: number;
  offset?: number;
}

export async function fetchEvents(apiUrl: string): Promise<BlockchainEvent[]> {
  const response = await fetch(apiUrl);
  if (!response.ok) {
    throw new Error(`Failed to fetch events: ${response.status}`);
  }

  const payload = (await response.json()) as { events?: BlockchainEvent[] };
  return payload.events ?? [];
}

export async function fetchStatus(apiUrl: string): Promise<StatusResponse> {
  const response = await fetch(`${apiUrl}/api/status`);
  if (!response.ok) {
    throw new Error(`Failed to fetch status: ${response.status}`);
  }
  return response.json() as Promise<StatusResponse>;
}

export async function searchNotifications(
  baseUrl: string,
  params: NotificationSearchParams
): Promise<NotificationSearchResponse> {
  const url = new URL(`${baseUrl}/api/notifications/search`);
  if (params.q) url.searchParams.set('q', params.q);
  if (params.sender) url.searchParams.set('sender', params.sender);
  if (params.txHash) url.searchParams.set('txHash', params.txHash);
  if (params.eventId) url.searchParams.set('eventId', params.eventId);
  if (params.status) url.searchParams.set('status', params.status);
  if (params.type) url.searchParams.set('type', params.type);
  if (params.limit !== undefined) url.searchParams.set('limit', String(params.limit));
  if (params.offset !== undefined) url.searchParams.set('offset', String(params.offset));

  const response = await fetch(url.toString());
  if (!response.ok) {
    throw new Error(`Search failed: ${response.status}`);
  }
  return response.json() as Promise<NotificationSearchResponse>;
}
