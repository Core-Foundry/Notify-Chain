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

/**
 * Migration 002 — Query performance indexes
 *
 * Adds covering / composite indexes for the hottest listener queries:
 * - scheduler claim + retry fetch
 * - notification search (status/type/created_at)
 * - processed event lookup by tx_hash / status / type
 * - processor lock fetch after claim
 */
const migration = {
  id: '002',
  name: 'query-performance-indexes',
  up: async (db: sqlite3.Database) => {
    await run(db, `
      CREATE INDEX IF NOT EXISTS idx_scheduled_notifications_claim
        ON scheduled_notifications(status, priority, execute_at)
        WHERE status = 'PENDING'
    `);
    await run(db, `
      CREATE INDEX IF NOT EXISTS idx_scheduled_notifications_processor_lock
        ON scheduled_notifications(processor_id, status, lock_expires_at)
    `);
    await run(db, `
      CREATE INDEX IF NOT EXISTS idx_scheduled_notifications_status_created
        ON scheduled_notifications(status, created_at)
    `);
    await run(db, `
      CREATE INDEX IF NOT EXISTS idx_scheduled_notifications_type_status
        ON scheduled_notifications(notification_type, status)
    `);
    await run(db, `
      CREATE INDEX IF NOT EXISTS idx_scheduled_notifications_contract
        ON scheduled_notifications(contract_address)
        WHERE contract_address IS NOT NULL
    `);
    await run(db, `
      CREATE INDEX IF NOT EXISTS idx_processed_events_status_processed
        ON processed_events(status, processed_at)
    `);
    await run(db, `
      CREATE INDEX IF NOT EXISTS idx_processed_events_event_type_status
        ON processed_events(event_type, status)
    `);
    await run(db, `
      CREATE INDEX IF NOT EXISTS idx_processed_events_tx_hash
        ON processed_events(tx_hash)
        WHERE tx_hash IS NOT NULL
    `);
    await run(db, `
      CREATE INDEX IF NOT EXISTS idx_execution_log_notification_attempt
        ON notification_execution_log(scheduled_notification_id, execution_attempt)
    `);
    await run(db, `
      CREATE INDEX IF NOT EXISTS idx_rate_limit_events_client_timestamp
        ON rate_limit_events(client_id, timestamp)
    `);
  },
  down: async (db: sqlite3.Database) => {
    await run(db, 'DROP INDEX IF EXISTS idx_scheduled_notifications_claim');
    await run(db, 'DROP INDEX IF EXISTS idx_scheduled_notifications_processor_lock');
    await run(db, 'DROP INDEX IF EXISTS idx_scheduled_notifications_status_created');
    await run(db, 'DROP INDEX IF EXISTS idx_scheduled_notifications_type_status');
    await run(db, 'DROP INDEX IF EXISTS idx_scheduled_notifications_contract');
    await run(db, 'DROP INDEX IF EXISTS idx_processed_events_status_processed');
    await run(db, 'DROP INDEX IF EXISTS idx_processed_events_event_type_status');
    await run(db, 'DROP INDEX IF EXISTS idx_processed_events_tx_hash');
    await run(db, 'DROP INDEX IF EXISTS idx_execution_log_notification_attempt');
    await run(db, 'DROP INDEX IF EXISTS idx_rate_limit_events_client_timestamp');
  },
};

export default migration;

