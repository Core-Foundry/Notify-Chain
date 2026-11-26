/**
 * Migration version tracking for incremental schema upgrades (#1167)
 *
 * `scheduled_notifications` gains a few additive columns on startup via
 * `Database.applyIncrementalMigrations`. These tests verify that the
 * applied migrations are recorded with unique ids and timestamps, that
 * repeated initialization does not re-run or duplicate them, and that the
 * history can be inspected.
 */

import { Database } from './database';

jest.mock('../utils/logger', () => ({
  __esModule: true,
  default: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

async function setupDb(): Promise<Database> {
  const db = new Database(':memory:');
  await db.initialize();
  return db;
}

describe('schema_migrations tracking', () => {
  let db: Database;

  afterEach(async () => {
    if (db) await db.close();
  });

  it('records every applied incremental migration with a unique id and timestamp', async () => {
    db = await setupDb();
    // The incremental migrations only apply to a database that already has
    // `scheduled_notifications` (an upgrade, not a fresh schema.sql create),
    // so re-initialize to exercise that path.
    await db.initialize();
    const rows = await db.all<{ id: string; applied_at: string }>(
      'SELECT id, applied_at FROM schema_migrations ORDER BY id',
    );

    const ids = rows.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toEqual(
      expect.arrayContaining([
        '006-scheduled-notifications-next-retry-at',
        '006-scheduled-notifications-version',
        '006-scheduled-notifications-recovery-state',
      ]),
    );
    for (const row of rows) {
      expect(row.applied_at).toBeTruthy();
    }
  });

  it('does not duplicate migration history on repeated initialization', async () => {
    db = await setupDb();
    await db.initialize();
    await db.initialize();

    const rows = await db.all<{ id: string }>('SELECT id FROM schema_migrations');
    const ids = rows.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
