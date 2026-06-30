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
 * 
 * Migration file structure:
 * Each migration should export a default object with:
 * - id: Unique identifier (e.g., "001")
 * - name: Human-readable name (e.g., "initial-schema")
 * - up(db): Function to apply the migration
 * - down(db): Function to roll back the migration (optional)
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
}

export class MigrationRunner {
  private db: sqlite3.Database;
  private migrationsDir: string;

  constructor(db: sqlite3.Database, migrationsDir: string) {
    this.db = db;
    this.migrationsDir = migrationsDir;
  }

  async initializeMigrationTable(): Promise<void> {
    await this.db.run(`
      CREATE TABLE IF NOT EXISTS migrations (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        applied_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);
  }

  async getAppliedMigrations(): Promise<string[]> {
    const rows = await this.db.all<{ id: string }>(
      'SELECT id FROM migrations ORDER BY applied_at'
    );
    return rows.map((row) => row.id);
  }

  async applyMigration(migration: Migration): Promise<void> {
    await this.db.serialize(async () => {
      await this.db.run('BEGIN TRANSACTION');
      try {
        await migration.up(this.db);
        await this.db.run(
          'INSERT INTO migrations (id, name) VALUES (?, ?)',
          [migration.id, migration.name]
        );
        await this.db.run('COMMIT');
        logger.info(`Migration ${migration.id} (${migration.name}) applied successfully`);
      } catch (error) {
        await this.db.run('ROLLBACK');
        logger.error(`Migration ${migration.id} failed, rolling back:`, error);
        throw error;
      }
    });
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
    return allMigrations.filter(
      (migration) => !appliedMigrations.includes(migration.id)
    );
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
}
