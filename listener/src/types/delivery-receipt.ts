export type DeliveryReceiptStatus = 'delivered' | 'failed' | 'rejected' | 'pending';
export type DeliveryOutcome = 'ACCEPTED' | 'REJECTED' | 'UNKNOWN';

export interface DeliveryReceipt {
  id: number;
  notificationId: number;
  eventId: string | null;
  contractAddress: string | null;
  channel: string;
  status: DeliveryReceiptStatus;
  outcome: DeliveryOutcome;
  providerStatus: number | null;
  attemptCount: number;
  attemptTimestamp: Date;
  deliveredAt: Date | null;
  providerMessageId: string | null;
  providerResponse: Record<string, unknown> | null;
  errorCode: string | null;
  errorMessage: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export type CreateDeliveryReceiptInput = {
  notificationId: number;
  eventId?: string | null;
  contractAddress?: string | null;
  channel: string;
  status?: DeliveryReceiptStatus;
  outcome?: DeliveryOutcome;
  providerStatus?: number | null;
  attemptCount: number;
  attemptTimestamp?: Date;
  deliveredAt?: Date | null;
  providerMessageId?: string | null;
  providerResponse?: unknown;
  errorCode?: string | null;
  errorMessage?: string | null;
};

export interface DeliveryReceiptRow {
  id: number;
  notification_id: number;
  event_id: string | null;
  contract_address: string | null;
  channel: string;
  status: DeliveryReceiptStatus;
  outcome: DeliveryOutcome;
  provider_status: number | null;
  attempt_count: number;
  attempt_timestamp: string;
  delivered_at: string | null;
  provider_message_id: string | null;
  provider_response: string | null;
  error_code: string | null;
  error_message: string | null;
  created_at: string;
  updated_at: string;
}

export interface DeliveryHistoryQueryOptions {
  eventId?: string;
  contractAddress?: string;
  notificationId?: number;
  outcome?: DeliveryOutcome;
  status?: DeliveryReceiptStatus;
  channel?: string;
  startDate?: string | Date;
  endDate?: string | Date;
  limit?: number;
  offset?: number;
}

export interface DeliveryHistoryQueryResult {
  receipts: DeliveryReceipt[];
  total: number;
  limit: number;
  offset: number;
}

export interface DetermineOutcomeInput {
  success?: boolean;
  statusCode?: number | null;
  errorCode?: string | null;
  errorMessage?: string | null;
}

/**
 * Classify a provider delivery attempt outcome into ACCEPTED, REJECTED, or UNKNOWN (#1116).
 *
 * Invariants:
 * - ACCEPTED: Provider explicitly confirms acceptance of the notification.
 *   (Does NOT imply final recipient delivery).
 * - REJECTED: Provider explicitly rejects the notification (e.g. 400, 401, 403, 404, 413, 422,
 *   or explicit client rejection errors).
 * - UNKNOWN: Timeouts, network drops, missing responses, 5xx server errors, or 429 rate limits
 *   where receipt/acceptance cannot be established with certainty.
 */
export function determineDeliveryOutcome(input: DetermineOutcomeInput): DeliveryOutcome {
  if (input.success) {
    if (input.statusCode !== undefined && input.statusCode !== null) {
      if (input.statusCode >= 200 && input.statusCode < 300) {
        return 'ACCEPTED';
      }
      return 'UNKNOWN';
    }
    return 'ACCEPTED';
  }

  const sc = input.statusCode;
  if (sc !== undefined && sc !== null) {
    // 408 (timeout) and 499 (client closed) are ambiguous transport/proxy states
    if (sc === 408 || sc === 499) {
      return 'UNKNOWN';
    }
    // 429 is temporary rate limiting / backpressure, not a permanent rejection of the notification
    if (sc === 429) {
      return 'UNKNOWN';
    }
    // Client-side errors indicate provider explicitly inspected and rejected the request
    if (sc >= 400 && sc < 500) {
      return 'REJECTED';
    }
    // Server-side errors (5xx) mean the provider failed; acceptance cannot be established
    if (sc >= 500 && sc < 600) {
      return 'UNKNOWN';
    }
  }

  const errCode = (input.errorCode || '').toUpperCase();
  const errMsg = (input.errorMessage || '').toUpperCase();

  // Network and timeout signatures are UNKNOWN
  if (
    errCode.includes('TIMEOUT') ||
    errCode.includes('ABORT') ||
    errCode.includes('ECONNRESET') ||
    errCode.includes('ECONNREFUSED') ||
    errCode.includes('ENOTFOUND') ||
    errCode.includes('EPIPE') ||
    errMsg.includes('TIMEOUT') ||
    errMsg.includes('ABORT') ||
    errMsg.includes('HANG UP') ||
    errMsg.includes('NETWORK')
  ) {
    return 'UNKNOWN';
  }

  // Explicit client validation / auth / rejection signatures
  if (
    errCode.includes('INVALID') ||
    errCode.includes('REJECT') ||
    errCode.includes('UNAUTHORIZED') ||
    errCode.includes('FORBIDDEN') ||
    errCode.includes('NOT_FOUND') ||
    errMsg.includes('INVALID') ||
    errMsg.includes('REJECT') ||
    errMsg.includes('UNAUTHORIZED') ||
    errMsg.includes('FORBIDDEN')
  ) {
    return 'REJECTED';
  }

  return 'UNKNOWN';
}
