#!/usr/bin/env ts-node
/**
 * Database migration check
 *
 * Compares the on-disk schema.sql hash against the hash recorded in the
 * `schema_migrations` table of the configured SQLite database. If they differ
 * (or the table has no rows), the script exits with code 1 and a clear,
 * human-readable message identifying the pending migration.
 *
 * Used by CI to fail builds when a schema change has landed in source but
 * has not yet been applied to the target database. See issue #103.
 *
 * Usage:
 *   npm run migrate:check
 *   or
 *   ts-node src/scripts/migration-check.ts
 *
 * Exit codes:
 *   0 = schema is up-to-date (hash matches last applied migration)
 *   1 = pending migration detected, or schema_migrations table is empty
 *   2 = error (db not reachable, schema.sql missing, etc.)
 */

import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import * as dotenv from 'dotenv';
import { Database } from '../database/database';
import logger from '../utils/logger';

dotenv.config();

const SCHEMA_PATH = path.join(__dirname, '..', 'database', 'schema.sql');

function sha256OfFile(filePath: string): string {
  const content = fs.readFileSync(filePath, 'utf-8');
  // Normalise line endings so editors and CI runners agree on a single hash.
  const normalized = content.replace(/\r\n/g, '\n');
  return crypto.createHash('sha256').update(normalized, 'utf-8').digest('hex');
}

async function main(): Promise<number> {
  if (!fs.existsSync(SCHEMA_PATH)) {
    logger.error('Schema file not found', { path: SCHEMA_PATH });
    return 2;
  }

  const currentHash = sha256OfFile(SCHEMA_PATH);
  const dbPath = process.env.DATABASE_PATH || './data/notifications.db';

  let db: Database;
  try {
    db = new Database(dbPath);
    await db.initialize();
  } catch (err) {
    logger.error('Failed to connect to database', { dbPath, error: err });
    return 2;
  }

  let appliedHash: string | null = null;
  let appliedVersion: string | null = null;
  try {
    const row = await db.get<{ schema_hash: string; version: string }>(
      `SELECT schema_hash, version FROM schema_migrations ORDER BY applied_at DESC LIMIT 1`
    );
    appliedHash = row?.schema_hash ?? null;
    appliedVersion = row?.version ?? null;
  } catch (err) {
    logger.error(
      'schema_migrations table not found — has the database been initialised with the latest schema?',
      { error: err }
    );
    await db.close();
    return 2;
  }

  await db.close();

  if (!appliedHash) {
    logger.error(
      'No migrations recorded in schema_migrations — run `npm run migrate` first',
      { expectedHash: currentHash }
    );
    return 1;
  }

  if (appliedHash === currentHash) {
    logger.info('Schema is up-to-date', {
      version: appliedVersion,
      hash: currentHash.slice(0, 12),
    });
    return 0;
  }

  logger.error('Pending migration detected', {
    appliedVersion,
    appliedHash: appliedHash.slice(0, 12),
    expectedHash: currentHash.slice(0, 12),
    hint:
      'Run `npm run migrate` to apply the pending schema changes, then commit the updated schema_migrations row.',
  });
  return 1;
}

main()
  .then((code) => process.exit(code))
  .catch((err) => {
    logger.error('Migration check crashed', { error: err });
    process.exit(2);
  });