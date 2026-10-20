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
  id: '003',
  name: 'delivery-receipts',
  up: async (db: sqlite3.Database) => {
    await run(db, `
      CREATE TABLE IF NOT EXISTS delivery_receipts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        notification_id INTEGER NOT NULL,
        channel TEXT NOT NULL,
        status TEXT NOT NULL CHECK (status IN ('delivered', 'failed', 'rejected', 'pending')),
        attempt_count INTEGER NOT NULL CHECK (attempt_count > 0),
        provider_message_id TEXT,
        provider_response TEXT,
        error_code TEXT,
        error_message TEXT,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);
    await run(db, `
      CREATE INDEX IF NOT EXISTS idx_delivery_receipts_notification_attempt
        ON delivery_receipts(notification_id, attempt_count, id)
    `);
    await run(db, `
      CREATE INDEX IF NOT EXISTS idx_delivery_receipts_status_created
        ON delivery_receipts(status, created_at)
    `);
  },
  down: async (db: sqlite3.Database) => {
    await run(db, 'DROP INDEX IF EXISTS idx_delivery_receipts_status_created');
    await run(db, 'DROP INDEX IF EXISTS idx_delivery_receipts_notification_attempt');
    await run(db, 'DROP TABLE IF EXISTS delivery_receipts');
  },
};

export default migration;

