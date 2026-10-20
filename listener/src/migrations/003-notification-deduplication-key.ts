import * as sqlite3 from 'sqlite3';

function run(db: sqlite3.Database, sql: string, params: unknown[] = []): Promise<void> {
  return new Promise((resolve, reject) => {
    db.run(sql, params, (err) => {
      if (err) {
        reject(err);
      } else {
        resolve();
      }
    });
  });
}

const migration = {
  id: '003-notification-deduplication-key',
  name: 'notification-deduplication-key',
  up: async (db: sqlite3.Database) => {
    await new Promise<void>((resolve, reject) => {
      db.run('ALTER TABLE scheduled_notifications ADD COLUMN deduplication_key TEXT', (err) => {
        if (err && !err.message?.includes('duplicate column name')) {
          reject(err);
        } else {
          resolve();
        }
      });
    });
    await run(
      db,
      `CREATE UNIQUE INDEX IF NOT EXISTS idx_scheduled_notifications_dedup_key
       ON scheduled_notifications(deduplication_key)
       WHERE deduplication_key IS NOT NULL`,
    );
  },
  down: async (db: sqlite3.Database) => {
    await run(db, 'DROP INDEX IF EXISTS idx_scheduled_notifications_dedup_key');
    // SQLite does not support DROP COLUMN before 3.35; recreate without the column.
    await run(
      db,
      `CREATE TABLE scheduled_notifications_backup AS
        SELECT id, payload, payload_hash, notification_type, target_recipient,
               execute_at, created_at, updated_at, status, retry_count, max_retries,
               processing_started_at, processing_completed_at, processor_id,
               lock_expires_at, last_error, error_details, event_id,
               contract_address, priority, metadata, next_retry_at
        FROM scheduled_notifications`,
    );
    await run(db, 'DROP TABLE scheduled_notifications');
    await run(db, 'ALTER TABLE scheduled_notifications_backup RENAME TO scheduled_notifications');
  },
};

export default migration;

