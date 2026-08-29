import { Database } from '../database/database';
import logger from '../utils/logger';
import { NotificationAnalyticsSnapshot } from './notification-analytics-aggregator';

export interface MetricsSnapshotRow {
  id: number;
  captured_at: string;
  window_start: number;
  window_end: number;
  total_recorded: number;
  snapshot_json: string;
}

export interface StoredMetricsSnapshot {
  id: number;
  capturedAt: string;
  snapshot: NotificationAnalyticsSnapshot;
}

/**
 * Persists summarized notification delivery metrics for historical queries.
 */
export class NotificationMetricsStore {
  constructor(private readonly db: Database) {}

  async saveSnapshot(snapshot: NotificationAnalyticsSnapshot): Promise<number> {
    const sql = `
      INSERT INTO notification_metrics_snapshots (
        window_start, window_end, total_recorded, snapshot_json
      ) VALUES (?, ?, ?, ?)
    `;

    const result = await this.db.run(sql, [
      snapshot.windowStart,
      snapshot.windowEnd,
      snapshot.totalRecorded,
      JSON.stringify(snapshot),
    ]);

    logger.debug('Persisted notification metrics snapshot', {
      id: result.lastID,
      totalRecorded: snapshot.totalRecorded,
      windowStart: snapshot.windowStart,
      windowEnd: snapshot.windowEnd,
    });

    return result.lastID;
  }

  async getHistory(limit = 50, since?: Date): Promise<StoredMetricsSnapshot[]> {
    const params: Array<string | number> = [];
    let sql = `
      SELECT id, captured_at, window_start, window_end, total_recorded, snapshot_json
      FROM notification_metrics_snapshots
    `;

    if (since) {
      sql += ' WHERE captured_at >= ?';
      params.push(since.toISOString());
    }

    sql += ' ORDER BY captured_at DESC LIMIT ?';
    params.push(Math.max(1, limit));

    const rows = await this.db.all<MetricsSnapshotRow>(sql, params);

    return rows.map((row) => ({
      id: row.id,
      capturedAt: row.captured_at,
      snapshot: JSON.parse(row.snapshot_json) as NotificationAnalyticsSnapshot,
    }));
  }

  async purgeOlderThan(retentionDays: number): Promise<number> {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - Math.max(1, retentionDays));

    const result = await this.db.run(
      'DELETE FROM notification_metrics_snapshots WHERE captured_at < ?',
      [cutoff.toISOString()],
    );

    if (result.changes > 0) {
      logger.info('Purged old notification metrics snapshots', {
        deleted: result.changes,
        retentionDays,
      });
    }

    return result.changes;
  }
}
