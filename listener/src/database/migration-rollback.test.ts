/**
 * Rollback behaviour for the listener migration system.
 *
 * Covers the three properties the rollback strategy depends on:
 * - reverts unwind in reverse order and actually reverse the schema
 * - destructive migrations are refused unless explicitly allowed
 * - a failed revert leaves the database untouched
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as sqlite3 from 'sqlite3';
import { Database } from '../database/database';
import { DestructiveMigrationError, MigrationRunner } from '../database/migration-system';

const MIGRATIONS_DIR = path.join(__dirname, '../migrations');

interface Harness {
  db: Database;
  sqliteDb: sqlite3.Database;
  dbPath: string;
  runner: MigrationRunner;
}

async function createHarness(): Promise<Harness> {
  const dbPath = path.join(os.tmpdir(), `notify-rollback-${Date.now()}-${Math.random()}.db`);
  const db = new Database(dbPath);
  await db.initialize();
  // @ts-ignore - Accessing private db property
  const sqliteDb = db['db'] as any;
  const runner = new MigrationRunner(sqliteDb, MIGRATIONS_DIR);
  return { db, sqliteDb, dbPath, runner };
}

async function destroy(harness: Harness): Promise<void> {
  await harness.db.close();
  if (fs.existsSync(harness.dbPath)) fs.unlinkSync(harness.dbPath);
}

function tableNames(db: sqlite3.Database): Promise<string[]> {
  return new Promise((resolve, reject) => {
    db.all(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'scheduled_notifications'",
      (error, rows: unknown[]) =>
        error ? reject(error) : resolve((rows as any[]).map((r) => r.name)),
    );
  });
}

function indexNames(db: sqlite3.Database): Promise<string[]> {
  return new Promise((resolve, reject) => {
    db.all(
      "SELECT name FROM sqlite_master WHERE type = 'index' AND name LIKE 'idx_%'",
      (error, rows: unknown[]) =>
        error ? reject(error) : resolve((rows as any[]).map((r) => r.name)),
    );
  });
}

async function countTables(db: Database): Promise<number> {
  const rows = await db.all<{ name: string }>(
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name LIKE 't_%'",
  );
  return rows.length;
}

describe('MigrationRunner.rollback', () => {
  let harness: Harness;

  beforeEach(async () => {
    harness = await createHarness();
    await harness.runner.runMigrations();
  });

  afterEach(async () => {
    await destroy(harness);
  });

  it('applies all migrations on first run', async () => {
    const applied = await harness.runner.getAppliedMigrations();
    expect(applied).toEqual(['001', '002']);
  });

  it('reverts the most recent migration by default', async () => {
    const reverted = await harness.runner.rollback();

    expect(reverted.map((m) => m.id)).toEqual(['002']);
    const indexes = await indexNames(harness.sqliteDb);
    expect(indexes).not.toContain('idx_scheduled_notifications_claim');
  });

  it('restores the schema when a migration is re-applied after a revert', async () => {
    await harness.runner.rollback();

    // 001 creates indexes of its own, so assert on the ones 002 owns.
    const afterRevert = await indexNames(harness.sqliteDb);
    expect(afterRevert).not.toContain('idx_scheduled_notifications_claim');
    expect(afterRevert).not.toContain('idx_processed_events_tx_hash');

    await harness.runner.runMigrations();

    const applied = await harness.runner.getAppliedMigrations();
    expect(applied).toEqual(['001', '002']);
    const indexes = await indexNames(harness.sqliteDb);
    expect(indexes).toContain('idx_scheduled_notifications_claim');
  });

  it('unwinds multiple migrations in reverse order', async () => {
    const reverted = await harness.runner.rollback({ steps: 2, allowDestructive: true });

    expect(reverted.map((m) => m.id)).toEqual(['002', '001']);
    expect(await tableNames(harness.sqliteDb)).toEqual([]);
  });

  it('refuses to revert a destructive migration by default', async () => {
    await expect(harness.runner.rollback({ steps: 2 })).rejects.toBeInstanceOf(
      DestructiveMigrationError,
    );

    // Nothing may have been reverted: the safeguard must fail closed.
    const applied = await harness.runner.getAppliedMigrations();
    expect(applied).toEqual(['001', '002']);
    expect((await tableNames(harness.sqliteDb)).length).toBe(1);
  });

  it('names the destructive migration in the error so the operator knows what is at risk', async () => {
    await expect(harness.runner.rollback({ steps: 2 })).rejects.toThrow(/001.*initial-schema/);
  });

  it('rolls back a reversible migration even while a destructive one is queued behind it', async () => {
    // 002 is reversible, so it reverts without the destructive opt-in.
    const reverted = await harness.runner.rollback();
    expect(reverted.map((m) => m.id)).toEqual(['002']);
  });

  it('rejects a non-positive step count', async () => {
    await expect(harness.runner.rollback({ steps: 0 })).rejects.toThrow(/positive integer/);
  });

  it('rejects a fractional step count', async () => {
    await expect(harness.runner.rollback({ steps: 1.5 })).rejects.toThrow(/positive integer/);
  });

  it('is a no-op when there is nothing left to revert', async () => {
    // Unwind everything, then confirm a further rollback changes nothing.
    await harness.runner.rollback({ steps: 2, allowDestructive: true });
    expect(await harness.runner.getAppliedMigrations()).toEqual([]);

    const reverted = await harness.runner.rollback({ allowDestructive: true });
    expect(reverted).toEqual([]);
  });

  it('leaves the schema unchanged when a revert step fails', async () => {
    // A revert can only be exercised through a migration that exists on disk,
    // so this case uses a throwaway migrations directory whose newest migration
    // throws from down().
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'notify-migrations-'));
    const write = (id: string, name: string, body: string) =>
      fs.writeFileSync(
        path.join(tempDir, `${id}-${name}.ts`),
        `const migration = {
  id: '${id}',
  name: '${name}',
  up: async (db: any) => { ${body} },
  down: async (db: any) => { ${id === '002' ? "throw new Error('boom');" : 'await db.run("DROP TABLE IF EXISTS t_a");'} },
};
export default migration;
`,
      );

    write('001', 'create-a', 'await db.run("CREATE TABLE IF NOT EXISTS t_a (id INTEGER)");');
    write('002', 'create-b', 'await db.run("CREATE TABLE IF NOT EXISTS t_b (id INTEGER)");');

    const localPath = path.join(os.tmpdir(), `notify-rollback-fail-${Date.now()}.db`);
    const db = new Database(localPath);
    await db.initialize();
    // @ts-ignore - Accessing private db property
    const runner = new MigrationRunner(db['db'] as any, tempDir);

    try {
      await runner.runMigrations();

      const tablesBefore = await countTables(db);
      await expect(runner.rollback()).rejects.toThrow('boom');

      // The failed step must not have consumed the pending revert.
      expect(await countTables(db)).toEqual(tablesBefore);
      expect(await runner.getAppliedMigrations()).toEqual(['001', '002']);
    } finally {
      await db.close();
      fs.rmSync(tempDir, { recursive: true, force: true });
      if (fs.existsSync(localPath)) fs.unlinkSync(localPath);
    }
  });

  it('records when a migration was reverted', async () => {
    await harness.runner.rollback();

    const rows = await harness.db.all<{ id: string; reverted_at: string | null }>(
      'SELECT id, reverted_at FROM migrations WHERE id = ?',
      ['002'],
    );

    expect(rows).toHaveLength(1);
    expect(rows[0].reverted_at).not.toBeNull();
  });

  it('lists rollback candidates newest first with a destructive marker', async () => {
    const candidates = await harness.runner.getRollbackCandidates();

    expect(candidates.map((m) => m.id)).toEqual(['002', '001']);
    expect(candidates[0].destructive).toBe(false);
    expect(candidates[1].destructive).toBe(true);
  });
});
