/**
 * Verifies migration 002 query-performance indexes exist and that the
 * scheduler claim plan can use the new composite index.
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { Database } from '../database/database';

const REQUIRED_INDEXES = [
  'idx_scheduled_notifications_claim',
  'idx_scheduled_notifications_processor_lock',
  'idx_scheduled_notifications_status_created',
  'idx_scheduled_notifications_type_status',
  'idx_processed_events_status_processed',
  'idx_processed_events_tx_hash',
  'idx_execution_log_notification_attempt',
];

describe('query performance indexes (migration 002)', () => {
  let db: Database;
  let dbPath: string;

  beforeAll(async () => {
    dbPath = path.join(os.tmpdir(), `notify-perf-${Date.now()}.db`);
    db = new Database(dbPath);
    await db.initialize();
  });

  afterAll(async () => {
    await db.close();
    if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
  });

  it('creates the performance indexes from schema / migrations', async () => {
    const rows = await db.all<{ name: string }>(
      `SELECT name FROM sqlite_master WHERE type = 'index' AND name LIKE 'idx_%'`
    );
    const names = new Set(rows.map((r) => r.name));

    for (const required of REQUIRED_INDEXES) {
      expect(names.has(required)).toBe(true);
    }
  });

  it('uses an indexed plan for pending claim queries', async () => {
    // Seed enough rows that a full scan would be meaningful
    for (let i = 0; i < 200; i++) {
      await db.run(
        `INSERT INTO scheduled_notifications
          (payload, notification_type, target_recipient, execute_at, status, priority)
         VALUES (?, 'discord', ?, datetime('now', ?), 'PENDING', ?)`,
        [
          JSON.stringify({ i }),
          `user-${i}`,
          `-${i} seconds`,
          (i % 10) + 1,
        ]
      );
    }

    const planRows = await db.all<{ detail: string }>(
      `EXPLAIN QUERY PLAN
       SELECT id FROM scheduled_notifications
       WHERE status = 'PENDING' AND execute_at <= datetime('now')
       ORDER BY priority ASC, execute_at ASC
       LIMIT 25`
    );
    const plan = planRows.map((r) => r.detail).join(' | ').toLowerCase();

    // Should mention our claim index (or at least an index search, not a bare scan+sort)
    expect(
      plan.includes('idx_scheduled_notifications_claim') ||
        plan.includes('using index') ||
        plan.includes('search')
    ).toBe(true);
  });
});
