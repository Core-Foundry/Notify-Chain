import { getDatabase } from '../database/database';
import logger from '../utils/logger';
import { buildPaginationMetadata, normalizePaginationParams } from '../utils/pagination';

export interface NotificationSearchParams {
  q?: string;         // partial match: sender, eventId, txHash, contractAddress, notificationType, payload
  sender?: string;    // target_recipient exact/partial match
  txHash?: string;    // tx_hash exact/partial match
  eventId?: string;   // event_id exact/partial match
  status?: string;    // scheduled_notifications.status / processed_events.status
  type?: string;      // notification_type (discord|email|webhook|sms)
  startDate?: string; // inclusive lower bound on created_at / processed_at (YYYY-MM-DD or ISO)
  endDate?: string;   // inclusive upper bound on created_at / processed_at (YYYY-MM-DD or ISO)
  limit?: number;
  offset?: number;
  /**
   * Sort order for results (#495).
   * - newest (default) – most recently created first
   * - oldest           – earliest created first
   * - status           – group by delivery status, then newest within each group
   */
  sortBy?: 'newest' | 'oldest' | 'status';
}

/** Normalize a date filter so YYYY-MM-DD covers the full UTC day. */
export function normalizeSearchDateBound(value: string, bound: 'start' | 'end'): string {
  if (value.includes('T')) return value;
  return bound === 'start' ? `${value}T00:00:00.000Z` : `${value}T23:59:59.999Z`;
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
  /**
   * Human-readable reason the delivery failed (#493).
   * Populated from `last_error` for scheduled notifications and from
   * `error_message` for processed events.  `null` when the notification
   * succeeded or is still pending.
   */
  failureReason: string | null;
}

export interface PaginatedSearchResponse {
  results: NotificationSearchResult[];
  total: number;
  limit: number;
  offset: number;
  itemCount: number;
  totalPages: number;
}

export class NotificationSearchService {
  private db = getDatabase();

  async search(params: NotificationSearchParams): Promise<PaginatedSearchResponse> {
    const { limit, offset } = normalizePaginationParams(params.limit, params.offset);
    const pattern = params.q ? `%${params.q}%` : null;

    try {
      const scheduledResults = await this.searchScheduled(params, pattern, limit, offset);
      const processedResults = await this.searchProcessed(params, pattern, limit, offset);

      // Merge, sort by createdAt desc, then re-paginate
      const merged = [...scheduledResults.rows, ...processedResults.rows].sort(
        (a, b) => {
          const sortBy = params.sortBy ?? 'newest';
          if (sortBy === 'oldest') {
            return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
          }
          if (sortBy === 'status') {
            const STATUS_ORDER: Record<string, number> = {
              PENDING: 0,
              PROCESSING: 1,
              COMPLETED: 2,
              FAILED: 3,
              CANCELLED: 4,
              PROCESSED: 5,
            };
            const sa = STATUS_ORDER[a.status.toUpperCase()] ?? 99;
            const sb = STATUS_ORDER[b.status.toUpperCase()] ?? 99;
            if (sa !== sb) return sa - sb;
            return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
          }
          // default: newest
          return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
        }
      );
      const total = scheduledResults.total + processedResults.total;

      const paginated = merged.slice(0, limit);

      const pagination = buildPaginationMetadata(total, limit, offset);

      logger.info('Notification search complete', { total, returned: paginated.length, limit, offset });

      return {
        results: paginated,
        total,
        limit: pagination.limit,
        offset: pagination.offset,
        itemCount: pagination.itemCount,
        totalPages: pagination.totalPages,
      };
    } catch (error) {
      logger.error('Notification search failed', { error, params });
      throw error;
    }
  }

  private async searchScheduled(
    params: NotificationSearchParams,
    pattern: string | null,
    limit: number,
    offset: number
  ): Promise<{ rows: NotificationSearchResult[]; total: number }> {
    const conditions: string[] = [];
    const queryParams: unknown[] = [];

    if (pattern) {
      conditions.push(
        `(target_recipient LIKE ? OR event_id LIKE ? OR contract_address LIKE ? OR notification_type LIKE ? OR payload LIKE ?)`
      );
      queryParams.push(pattern, pattern, pattern, pattern, pattern);
    }
    if (params.sender) {
      conditions.push('target_recipient LIKE ?');
      queryParams.push(`%${params.sender}%`);
    }
    if (params.eventId) {
      conditions.push('event_id LIKE ?');
      queryParams.push(`%${params.eventId}%`);
    }
    if (params.status) {
      conditions.push('status = ?');
      queryParams.push(params.status.toUpperCase());
    }
    if (params.type) {
      conditions.push('LOWER(notification_type) = ?');
      queryParams.push(params.type.toLowerCase());
    }
    if (params.startDate) {
      conditions.push('created_at >= ?');
      queryParams.push(normalizeSearchDateBound(params.startDate, 'start'));
    }
    if (params.endDate) {
      conditions.push('created_at <= ?');
      queryParams.push(normalizeSearchDateBound(params.endDate, 'end'));
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const countRow = await this.db.get<{ count: number }>(
      `SELECT COUNT(*) as count FROM scheduled_notifications ${where}`,
      queryParams
    );
    const total = countRow?.count ?? 0;

    const rows = await this.db.all<{
      id: number;
      event_id: string | null;
      contract_address: string | null;
      notification_type: string;
      target_recipient: string;
      status: string;
      created_at: string;
      payload: string;
      last_error: string | null;
    }>(
      `SELECT id, event_id, contract_address, notification_type, target_recipient, status, created_at, payload, last_error
       FROM scheduled_notifications ${where}
       ORDER BY created_at DESC
       LIMIT ? OFFSET ?`,
      [...queryParams, limit, offset]
    );

    return {
      total,
      rows: rows.map((r) => ({
        id: r.id,
        source: 'scheduled' as const,
        eventId: r.event_id,
        txHash: null,
        contractAddress: r.contract_address,
        notificationType: r.notification_type,
        targetRecipient: r.target_recipient,
        status: r.status,
        createdAt: r.created_at,
        payload: r.payload,
        failureReason: r.last_error ?? null,
      })),
    };
  }

  private async searchProcessed(
    params: NotificationSearchParams,
    pattern: string | null,
    limit: number,
    offset: number
  ): Promise<{ rows: NotificationSearchResult[]; total: number }> {
    const conditions: string[] = [];
    const queryParams: unknown[] = [];

    if (pattern) {
      conditions.push(
        `(event_id LIKE ? OR tx_hash LIKE ? OR contract_address LIKE ? OR event_type LIKE ?)`
      );
      queryParams.push(pattern, pattern, pattern, pattern);
    }
    if (params.txHash) {
      conditions.push('tx_hash LIKE ?');
      queryParams.push(`%${params.txHash}%`);
    }
    if (params.eventId) {
      conditions.push('event_id LIKE ?');
      queryParams.push(`%${params.eventId}%`);
    }
    if (params.status) {
      conditions.push('status = ?');
      queryParams.push(params.status.toUpperCase());
    }
    if (params.type) {
      // processed_events store channel/event type in event_type
      conditions.push('LOWER(event_type) = ?');
      queryParams.push(params.type.toLowerCase());
    }
    if (params.startDate) {
      conditions.push('processed_at >= ?');
      queryParams.push(normalizeSearchDateBound(params.startDate, 'start'));
    }
    if (params.endDate) {
      conditions.push('processed_at <= ?');
      queryParams.push(normalizeSearchDateBound(params.endDate, 'end'));
    }

    // sender does not apply to processed_events

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const countRow = await this.db.get<{ count: number }>(
      `SELECT COUNT(*) as count FROM processed_events ${where}`,
      queryParams
    );
    const total = countRow?.count ?? 0;

    const rows = await this.db.all<{
      id: number;
      event_id: string;
      tx_hash: string | null;
      contract_address: string;
      event_type: string;
      status: string;
      processed_at: string;
      error_reason: string | null;
    }>(
      `SELECT id, event_id, tx_hash, contract_address, event_type, status, processed_at, error_reason
       FROM processed_events ${where}
       ORDER BY processed_at DESC
       LIMIT ? OFFSET ?`,
      [...queryParams, limit, offset]
    );

    return {
      total,
      rows: rows.map((r) => ({
        id: r.id,
        source: 'processed' as const,
        eventId: r.event_id,
        txHash: r.tx_hash,
        contractAddress: r.contract_address,
        notificationType: r.event_type,
        targetRecipient: null,
        status: r.status,
        createdAt: r.processed_at,
        payload: null,
        failureReason: r.error_reason ?? null,
      })),
    };
  }
}
