import { Database } from '../database/database';
import logger from '../utils/logger';

export interface BackpressureEvent {
  id?: number;
  event_type: 'ACTIVATED' | 'DEACTIVATED';
  queue_size: number;
  target_throughput_per_sec: number;
  duration_ms?: number;
  reason?: string;
  timestamp: string;
}

/**
 * Monitors and records backpressure events to the database
 * Provides audit trail and historical analysis of system load
 */
export class BackpressureMonitor {
  constructor(private db: Database) {}

  /**
   * Record a backpressure event (activation or deactivation)
   */
  async recordEvent(event: BackpressureEvent): Promise<number> {
    const sql = `
      INSERT INTO backpressure_events (
        event_type, queue_size, target_throughput_per_sec,
        duration_ms, reason, timestamp
      ) VALUES (?, ?, ?, ?, ?, ?)
    `;

    const result = await this.db.run(sql, [
      event.event_type,
      event.queue_size,
      event.target_throughput_per_sec,
      event.duration_ms ?? null,
      event.reason ?? null,
      event.timestamp,
    ]);

    logger.info('Backpressure event recorded', {
      id: result.lastID,
      eventType: event.event_type,
      queueSize: event.queue_size,
    });

    return result.lastID;
  }

  /**
   * Get backpressure events within a time range
   */
  async getEventsInRange(startTime: Date, endTime: Date): Promise<BackpressureEvent[]> {
    const sql = `
      SELECT * FROM backpressure_events
      WHERE timestamp >= ? AND timestamp <= ?
      ORDER BY timestamp DESC
    `;

    const rows = await this.db.all<BackpressureEvent>(sql, [
      startTime.toISOString(),
      endTime.toISOString(),
    ]);

    return rows || [];
  }

  /**
   * Get the most recent backpressure events
   */
  async getRecentEvents(limit: number = 50): Promise<BackpressureEvent[]> {
    const sql = `
      SELECT * FROM backpressure_events
      ORDER BY timestamp DESC
      LIMIT ?
    `;

    const rows = await this.db.all<BackpressureEvent>(sql, [limit]);
    return rows || [];
  }

  /**
   * Get backpressure statistics
   */
  async getStatistics(): Promise<{
    totalActivations: number;
    totalDeactivations: number;
    averageQueueSizeAtActivation: number;
    averageQueueSizeAtDeactivation: number;
    averageDurationMs: number;
    lastActivationAt: string | null;
    lastDeactivationAt: string | null;
  }> {
    const activationsSql = `
      SELECT
        COUNT(*) as count,
        AVG(queue_size) as avg_queue_size,
        MAX(timestamp) as last_at
      FROM backpressure_events
      WHERE event_type = 'ACTIVATED'
    `;

    const deactivationsSql = `
      SELECT
        COUNT(*) as count,
        AVG(queue_size) as avg_queue_size,
        AVG(duration_ms) as avg_duration,
        MAX(timestamp) as last_at
      FROM backpressure_events
      WHERE event_type = 'DEACTIVATED'
    `;

    const [activations, deactivations] = await Promise.all([
      this.db.get<{
        count: number;
        avg_queue_size: number;
        last_at: string;
      }>(activationsSql),
      this.db.get<{
        count: number;
        avg_queue_size: number;
        avg_duration: number;
        last_at: string;
      }>(deactivationsSql),
    ]);

    return {
      totalActivations: activations?.count ?? 0,
      totalDeactivations: deactivations?.count ?? 0,
      averageQueueSizeAtActivation: activations?.avg_queue_size ?? 0,
      averageQueueSizeAtDeactivation: deactivations?.avg_queue_size ?? 0,
      averageDurationMs: deactivations?.avg_duration ?? 0,
      lastActivationAt: activations?.last_at ?? null,
      lastDeactivationAt: deactivations?.last_at ?? null,
    };
  }

  /**
   * Clean up old backpressure events (older than specified days)
   */
  async cleanupOldEvents(daysOld: number = 30): Promise<number> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysOld);

    const sql = `
      DELETE FROM backpressure_events
      WHERE timestamp < ?
    `;

    const result = await this.db.run(sql, [cutoffDate.toISOString()]);

    if (result.changes > 0) {
      logger.info('Cleaned up old backpressure events', { count: result.changes, daysOld });
    }

    return result.changes;
  }
}
