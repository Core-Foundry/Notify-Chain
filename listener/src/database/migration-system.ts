/**
 * Migration System
 *
 * A custom SQLite database migration system for the Notify-Chain listener.
 *
 * Features:
 * - Tracks applied migrations in a `migrations` table
 * - Atomic migrations using transactions (rolls back on failure)
 * - Loads migrations from a specified directory
 * - Applies pending migrations in order
 * - Reverts applied migrations in reverse order, guarding destructive ones
 *
 * Migration file structure:
 * Each migration should export a default object with:
 * - id: Unique identifier (e.g., "001")
 * - name: Human-readable name (e.g., "initial-schema")
 * - up(db): Function to apply the migration
 * - down(db): Function to roll back the migration (required for rollback support)
 * - destructive: Set true when `down` discards data that cannot be reconstructed
 *   by re-running `up` (drops columns/tables holding rows, truncates, etc.)
 */
import * as sqlite3 from 'sqlite3';
import * as fs from 'fs';
import * as path from 'path';
import logger from '../utils/logger';

export interface Migration {
  id: string;
  name: string;
  up: (db: sqlite3.Database) => Promise<void>;
  down: (db: sqlite3.Database) => Promise<void>;
  /**
   * When true, reverting this migration destroys data that `up` cannot restore.
   * Destructive reverts are refused unless the caller explicitly opts in, so a
   * routine `rollback-last` can never silently drop production rows.
   */
  destructive?: boolean;
}

/** Options controlling a single revert operation. */
export interface RollbackOptions {
  /**
   * Permit reverting migrations flagged `destructive`. Required for any revert
   * that would otherwise discard unrecoverable data.
   */
  allowDestructive?: boolean;
  /** Maximum number of migrations to revert. Defaults to 1. */
  steps?: number;
}

export class DestructiveMigrationError extends Error {
  public readonly migrationId: string;
  public readonly migrationName: string;

  constructor(id: string, name: string) {
    super(
      `Refusing to roll back destructive migration ${id} (${name}). ` +
        'Re-run with allowDestructive to confirm the data loss is intended.',
    );
    this.name = 'DestructiveMigrationError';
    this.migrationId = id;
    this.migrationName = name;
  }
}

export class MigrationRunner {
  private db: sqlite3.Database;
  private migrationsDir: string;

  constructor(db: sqlite3.Database, migrationsDir: string) {
    this.db = db;
    this.migrationsDir = migrationsDir;
  }

  /**
   * Promisified `run`.
   *
   * `sqlite3` only resolves when a callback is supplied: calling `db.run(sql)`
   * without one returns the Database handle for chaining and does NOT wait for
   * the statement to finish. Awaiting it therefore races the next statement,
   * which is why migration sequencing cannot rely on the raw handle.
   */
  private run(sql: string, params: unknown[] = []): Promise<void> {
    return new Promise((resolve, reject) => {
      this.db.run(sql, params, (error: Error | null) => (error ? reject(error) : resolve()));
    });
  }

  /** Promisified `all`. See {@link run} for why the callback is required. */
  private all<T>(sql: string, params: unknown[] = []): Promise<T[]> {
    return new Promise((resolve, reject) => {
      this.db.all(sql, params, (error: Error | null, rows: unknown[]) =>
        error ? reject(error) : resolve(rows as T[]),
      );
    });
  }

  /**
   * Runs a migration's `up`/`down` with real awaiting semantics.
   *
   * Migrations call `await db.run(...)`. Against the raw sqlite3 handle that
   * await is a no-op, so every DDL statement in a migration was fire-and-forget
   * and could still be in flight when the surrounding transaction committed,
   * which is how a migration could half-apply. This proxy turns each call into
   * a real promise, so `up`/`down` become a genuinely atomic unit.
   */
  private async runMigrationStep(step: (db: sqlite3.Database) => Promise<void>): Promise<void> {
    const db = this.db;

    const bridged = new Proxy(
      {},
      {
        get(_target, property) {
          if (property === 'run' || property === 'all' || property === 'exec') {
            return (...args: unknown[]) =>
              new Promise((resolve, reject) => {
                const done = (error: Error | null) => (error ? reject(error) : resolve(undefined));
                const method = db[property as 'run' | 'all' | 'exec'] as unknown as (
                  ...inner: unknown[]
                ) => unknown;
                method.apply(db, [...args, done]);
              });
          }
          return undefined;
        },
      },
    );

    await step(bridged as unknown as sqlite3.Database);
  }

  async initializeMigrationTable(): Promise<void> {
    await this.run(`
      CREATE TABLE IF NOT EXISTS migrations (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        applied_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Applied DBs predate this column, so add it defensively rather than
    // assuming a fresh database.
    const columns = await this.all<{ name: string }>('PRAGMA table_info(migrations)');
    if (!columns.some((column) => column.name === 'reverted_at')) {
      await this.run('ALTER TABLE migrations ADD COLUMN reverted_at DATETIME');
    }
  }

  async getAppliedMigrations(): Promise<string[]> {
    const rows = await this.all<{ id: string }>(
      'SELECT id FROM migrations WHERE reverted_at IS NULL ORDER BY applied_at',
    );
    return rows.map((row) => row.id);
  }

  async applyMigration(migration: Migration): Promise<void> {
    // NOTE: deliberately not wrapped in db.serialize(). serialize() invokes its
    // callback synchronously and does not await an async one, so the runner
    // resolved before the migration finished and callers could close the
    // database mid-transaction. Statements on one connection already execute
    // in the order they are queued, which the explicit awaits below guarantee.
    await this.run('BEGIN TRANSACTION');
    try {
      await this.runMigrationStep(migration.up);
      // Upsert rather than plain INSERT: `id` is the primary key and a revert is
      // recorded in place to preserve the audit trail, so a previously reverted
      // migration still occupies its row. Re-applying must revive that row
      // instead of colliding with it.
      await this.run(
        `INSERT INTO migrations (id, name, reverted_at) VALUES (?, ?, NULL)
         ON CONFLICT(id) DO UPDATE SET
           name = excluded.name,
           applied_at = CURRENT_TIMESTAMP,
           reverted_at = NULL`,
        [migration.id, migration.name],
      );
      await this.run('COMMIT');
      logger.info(`Migration ${migration.id} (${migration.name}) applied successfully`);
    } catch (error) {
      // A failed ROLLBACK must not replace the original error, which is the one
      // that explains the failure.
      await this.run('ROLLBACK').catch((rollbackError: Error) => {
        logger.error(`Could not roll back transaction for ${migration.id}:`, {
          error: rollbackError,
        });
      });
      logger.error(`Migration ${migration.id} failed, rolling back:`, { error: error as Error });
      throw error;
    }
  }

  async loadMigrations(): Promise<Migration[]> {
    const files = fs.readdirSync(this.migrationsDir).sort();
    const migrations: Migration[] = [];

    for (const file of files) {
      if (file.endsWith('.ts') || file.endsWith('.js')) {
        const migrationPath = path.join(this.migrationsDir, file);
        const module = await import(migrationPath);
        if (module.default && typeof module.default.up === 'function') {
          migrations.push(module.default);
        }
      }
    }

    return migrations;
  }

  async getPendingMigrations(): Promise<Migration[]> {
    const appliedMigrations = await this.getAppliedMigrations();
    const allMigrations = await this.loadMigrations();
    return allMigrations.filter((migration) => !appliedMigrations.includes(migration.id));
  }

  async runMigrations(): Promise<void> {
    await this.initializeMigrationTable();
    const pendingMigrations = await this.getPendingMigrations();

    if (pendingMigrations.length === 0) {
      logger.info('No pending migrations to apply');
      return;
    }

    logger.info(`Applying ${pendingMigrations.length} pending migrations...`);
    for (const migration of pendingMigrations) {
      await this.applyMigration(migration);
    }
    logger.info('All migrations applied successfully');
  }

  /**
   * Revert the most recently applied migrations, newest first.
   *
   * Each revert runs inside its own transaction and the `migrations` row is
   * marked rather than deleted, so the audit trail of what was applied and
   * when it was reverted is preserved.
   *
   * @param options Revert options. `steps` defaults to 1.
   * @returns The migrations that were reverted, newest first.
   */
  async rollback(options: RollbackOptions = {}): Promise<Migration[]> {
    const steps = options.steps ?? 1;
    if (!Number.isInteger(steps) || steps < 1) {
      throw new Error(`Rollback steps must be a positive integer, received ${steps}`);
    }

    await this.initializeMigrationTable();
    const allMigrations = await this.loadMigrations();
    const appliedIds = await this.getAppliedMigrations();

    // Newest first: reverts must unwind in the opposite order to `up`.
    const targets = [...appliedIds].reverse().slice(0, steps);
    if (targets.length === 0) {
      logger.info('No applied migrations to roll back');
      return [];
    }

    // Validate every target before mutating anything, so a refusal halfway
    // through cannot leave the database partially reverted.
    const migrations: Migration[] = [];
    for (const id of targets) {
      const migration = allMigrations.find((candidate) => candidate.id === id);
      if (!migration) {
        throw new Error(
          `Cannot roll back migration ${id}: no migration file defines it. ` +
            'The migration directory and the migrations table are out of sync.',
        );
      }
      if (typeof migration.down !== 'function') {
        throw new Error(`Migration ${id} (${migration.name}) does not export a down() function`);
      }
      if (migration.destructive && !options.allowDestructive) {
        throw new DestructiveMigrationError(migration.id, migration.name);
      }
      migrations.push(migration);
    }

    const reverted: Migration[] = [];
    for (const migration of migrations) {
      await this.revertMigration(migration);
      reverted.push(migration);
    }
    return reverted;
  }

  private async revertMigration(migration: Migration): Promise<void> {
    await this.run('BEGIN TRANSACTION');
    try {
      await this.runMigrationStep(migration.down);
      await this.run('UPDATE migrations SET reverted_at = CURRENT_TIMESTAMP WHERE id = ?', [
        migration.id,
      ]);
      await this.run('COMMIT');
      logger.warn(
        `Migration ${migration.id} (${migration.name}) rolled back` +
          (migration.destructive ? ' [destructive]' : ''),
      );
    } catch (error) {
      await this.run('ROLLBACK').catch((rollbackError: Error) => {
        logger.error(`Could not roll back transaction for ${migration.id}:`, {
          error: rollbackError,
        });
      });
      logger.error(`Rollback of migration ${migration.id} failed, transaction reverted:`, {
        error: error as Error,
      });
      throw error;
    }
  }

  /**
   * Migrations that are applied and not yet reverted, newest first.
   */
  async getRollbackCandidates(): Promise<Migration[]> {
    const allMigrations = await this.loadMigrations();
    const appliedIds = new Set(await this.getAppliedMigrations());
    return [...appliedIds]
      .reverse()
      .map((id) => allMigrations.find((m) => m.id === id))
      .filter((migration): migration is Migration => migration !== undefined);
  }
}
