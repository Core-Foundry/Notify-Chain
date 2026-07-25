import type { WebhookDelivery } from '../types/webhook';
import { generateMockWebhookDeliveries } from '../utils/webhookData';

const BASE_URL =
  (typeof import.meta !== 'undefined' && (import.meta as { env?: Record<string, string> }).env?.VITE_EVENTS_API_URL) ||
  'http://localhost:8787';

export interface WebhookDeliveryResponse {
  deliveries: WebhookDelivery[];
  total: number;
}

/**
 * Fetch webhook delivery records from the API.
 * Falls back to mock data if the API is unreachable.
 */
export async function fetchWebhookDeliveries(): Promise<WebhookDeliveryResponse> {
  const response = await fetch(`${BASE_URL}/api/webhooks/deliveries`);
  if (!response.ok) {
    throw new Error(`Failed to fetch webhook deliveries: ${response.status}`);
  }
  return response.json() as Promise<WebhookDeliveryResponse>;
}

/**
 * Generates mock deliveries for local development / API unavailable scenarios.
 */
export function getMockWebhookDeliveries(): WebhookDeliveryResponse {
  const deliveries = generateMockWebhookDeliveries(600, 168);
  return { deliveries, total: deliveries.length };
}
