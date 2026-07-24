import { getDatabase } from '../database/database';
import logger from '../utils/logger';
import { buildPaginationMetadata, normalizePaginationParams, encodeCursor, decodeCursor } from '../utils/pagination';

export interface NotificationHistoryRecord {
  id: number;
  scheduledNotificationId: number;
  executionAttempt: number;
  executionTime: string;
  status: 'SUCCESS' | 'FAILED' | 'RETRY';
  errorMessage: string | null;
  responseDuration: number | null;
}

export interface HistoryQueryOptions {
  limit?: number;
  offset?: number;
  cursor?: string;
  status?: 'SUCCESS' | 'FAILED' | 'RETRY';
  startDate?: string;
  endDate?: string;
}

export interface PaginatedHistoryResponse {
  records: NotificationHistoryRecord[];
  total: number;
  limit: number;
  offset: number;
  itemCount: number;
  totalPages: number;
  nextCursor?: string | null;
}

export class NotificationHistoryService {
  private db = getDatabase();

  async getHistory(options: HistoryQueryOptions): Promise<PaginatedHistoryResponse> {
    const { limit, offset } = normalizePaginationParams(options.limit, options.offset);

    try {
      // Build WHERE clause
      const conditions: string[] = [];
      const params: any[] = [];

      if (options.status) {
        conditions.push('status = ?');
        params.push(options.status);
      }

      if (options.startDate) {
        conditions.push('execution_time >= ?');
        params.push(options.startDate);
      }

      if (options.endDate) {
        conditions.push('execution_time <= ?');
        params.push(options.endDate);
      }

      const baseConditions = [...conditions];
      const baseParams = [...params];

      const decodedCursor = options.cursor ? decodeCursor(options.cursor) : null;
      if (decodedCursor) {
        conditions.push('(execution_time < ? OR (execution_time = ? AND id < ?))');
        params.push(decodedCursor.executionTime, decodedCursor.executionTime, decodedCursor.id);
      }

      const countWhereClause = baseConditions.length > 0 ? `WHERE ${baseConditions.join(' AND ')}` : '';
      const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

      // Get total count
      const countSql = `SELECT COUNT(*) as count FROM notification_execution_log ${countWhereClause}`;
      const countResult = await this.db.get<{ count: number }>(countSql, baseParams);
      const total = countResult?.count || 0;

      // Get paginated records
      let sql = `
        SELECT 
          id,
          scheduled_notification_id as scheduledNotificationId,
          execution_attempt as executionAttempt,
          execution_time as executionTime,
          status,
          error_message as errorMessage,
          duration_ms as responseDuration
        FROM notification_execution_log
        ${whereClause}
        ORDER BY execution_time DESC, id DESC
        LIMIT ?
      `;
      
      const queryParams = [...params, limit];
      
      if (!decodedCursor) {
        sql += ` OFFSET ?`;
        queryParams.push(offset);
      }

      const records = await this.db.all<NotificationHistoryRecord>(
        sql,
        queryParams
      );

      logger.info('Notification history retrieved', {
        total,
        returned: records.length,
        limit,
        offset,
      });

      const pagination = buildPaginationMetadata(total, limit, offset);

      const nextCursor = records.length > 0 
        ? encodeCursor(records[records.length - 1].executionTime, records[records.length - 1].id)
        : null;

      return {
        records,
        total,
        limit: pagination.limit,
        offset: pagination.offset,
        itemCount: pagination.itemCount,
        totalPages: pagination.totalPages,
        nextCursor,
      };
    } catch (error) {
      logger.error('Failed to retrieve notification history', { error });
      throw error;
    }
  }
}