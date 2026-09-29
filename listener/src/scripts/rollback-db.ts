#!/usr/bin/env ts-node
/**
 * Rollback CLI for the listener database.
 *
 * Reverts applied migrations in reverse order, unwinding as many steps as
 * requested. Destructive migrations are refused unless --allow-destructive is
 * passed, so a routine rollback can never quietly drop production data.
 *
 * Usage:
 *   npm run rollback                    # revert the most recent migration
 *   npm run rollback -- --steps 3       # revert the three most recent
 *   npm run rollback -- --status        # list what would be reverted
 *   npm run rollback -- --allow-destructive
 *
 * Environment:
 *   DATABASE_PATH  overrides the database location
 */
import { Database } from '../database/database';
import { DestructiveMigrationError, MigrationRunner } from '../database/migration-system';
import logger from '../utils/logger';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config();

function parseSteps(argv: string[]): number {
  const index = argv.indexOf('--steps');
  if (index === -1) return 1;

  const value = argv[index + 1];
  if (!value) {
    throw new Error('--steps requires a value, e.g. --steps 3');
  }

  const steps = Number.parseInt(value, 10);
  if (!Number.isInteger(steps) || steps < 1) {
    throw new Error(`--steps must be a positive integer, received "${value}"`);
  }
  return steps;
}

async function rollback() {
  const argv = process.argv.slice(2);
  const dbPath = process.env.DATABASE_PATH || './data/notifications.db';
  const migrationsDir = path.join(__dirname, '../migrations');
  const allowDestructive = argv.includes('--allow-destructive');

  const db = new Database(dbPath);
  await db.initialize();

  // @ts-ignore - Accessing private db property
  const sqliteDb = db['db'] as any;
  const runner = new MigrationRunner(sqliteDb, migrationsDir);

  try {
    // `--status` has to work before anything has ever been applied, so ensure
    // the bookkeeping table exists rather than assuming a migrated database.
    await runner.initializeMigrationTable();

    if (argv.includes('--status')) {
      const candidates = await runner.getRollbackCandidates();
      if (candidates.length === 0) {
        console.log('No applied migrations to roll back');
        return;
      }
      console.log('Applied migrations, newest first (next to be reverted):');
      for (const migration of candidates) {
        const marker = migration.destructive ? 'destructive' : 'reversible';
        console.log(`  ${migration.id}  ${migration.name}  [${marker}]`);
      }
      return;
    }

    const steps = parseSteps(argv);
    const reverted = await runner.rollback({ steps, allowDestructive });

    if (reverted.length === 0) {
      console.log('Nothing to roll back');
      return;
    }

    console.log(`Rolled back ${reverted.length} migration(s):`);
    for (const migration of reverted) {
      console.log(`  ${migration.id}  ${migration.name}`);
    }
  } catch (error) {
    if (error instanceof DestructiveMigrationError) {
      console.error(`❌ ${error.message}`);
      console.error('\nThis migration drops data that cannot be recovered by re-applying it.');
      console.error('Re-run with --allow-destructive only once you are certain.');
      process.exit(3);
    }
    throw error;
  } finally {
    await db.close();
  }
}

rollback().catch((error) => {
  logger.error('Rollback failed:', error);
  process.exit(1);
});
