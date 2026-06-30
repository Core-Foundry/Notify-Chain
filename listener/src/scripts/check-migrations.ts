#!/usr/bin/env ts-node
/**
 * Migration status check script
 * Used in CI to verify that there are no pending migrations
 * 
 * Usage:
 *   npm run check-migrations
 *   or
 *   ts-node src/scripts/check-migrations.ts
 */

import { Database } from '../database/database';
import { MigrationRunner } from '../database/migration-system';
import logger from '../utils/logger';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config();

async function checkMigrations() {
  try {
    const dbPath = process.env.DATABASE_PATH || './data/notifications.db';
    const migrationsDir = path.join(__dirname, '../migrations');
    
    const db = new Database(dbPath);
    await db.initialize();
    
    // @ts-ignore - Accessing private db property
    const sqliteDb = db['db'] as any;
    
    const runner = new MigrationRunner(sqliteDb, migrationsDir);
    const pendingMigrations = await runner.getPendingMigrations();
    
    await db.close();

    if (pendingMigrations.length > 0) {
      console.error('❌ Pending migrations detected:');
      for (const migration of pendingMigrations) {
        console.error(`  - ${migration.id}: ${migration.name}`);
      }
      console.error('\nTo fix this:');
      console.error('1. Ensure all migrations are applied to the target database');
      console.error('2. Run "npm run migrate" locally to test the migration');
      console.error('3. Commit any new migration files');
      process.exit(1);
    } else {
      console.log('✅ All migrations are applied, database is up to date');
      process.exit(0);
    }
  } catch (error) {
    console.error('❌ Migration check failed:', error);
    process.exit(2);
  }
}

checkMigrations();
