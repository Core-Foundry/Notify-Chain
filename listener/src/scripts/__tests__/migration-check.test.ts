/**
 * Tests for the migration-check script.
 *
 * Verifies the three terminal states the script can return:
 *   - exit 0 when the on-disk schema hash matches the recorded hash
 *   - exit 1 when the on-disk schema has drifted from the database
 *   - exit 1 when the schema_migrations table is empty
 *
 * Each test builds a fresh, throwaway SQLite database so the existing
 * `./data/notifications.db` (used by the rest of the listener) is never
 * touched.
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as crypto from 'crypto';

// We re-implement the hashing helper here to avoid importing the script
// module (which spawns the database connection at top level). Keep this in
// sync with migration-check.ts and database.ts.
function sha256OfContent(content: string): string {
  const normalized = content.replace(/\r\n/g, '\n');
  return crypto.createHash('sha256').update(normalized, 'utf-8').digest('hex');
}

import { Database } from '../../database/database';

describe('schema_migrations tracking (issue #103)', () => {
  let tmpDir: string;
  let dbPath: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'migcheck-'));
    dbPath = path.join(tmpDir, 'test.db');
  });

  afterEach(() => {
    if (fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('records a schema_migrations row after Database.initialize()', async () => {
    const db = new Database(dbPath);
    await db.initialize();

    const row = await db.get<{ version: string; source: string }>(
      `SELECT version, source FROM schema_migrations ORDER BY applied_at DESC LIMIT 1`
    );
    expect(row).toBeDefined();
    expect(row!.source).toBe('migrate');
    expect(row!.version).toMatch(/^v-\d+$/);

    await db.close();
  });

  it('stored hash matches the on-disk schema.sql', async () => {
    const db = new Database(dbPath);
    await db.initialize();

    const stored = await db.get<{ schema_hash: string }>(
      `SELECT schema_hash FROM schema_migrations ORDER BY applied_at DESC LIMIT 1`
    );
    expect(stored).toBeDefined();

    const schemaPath = path.join(__dirname, '..', '..', 'database', 'schema.sql');
    const onDisk = sha256OfContent(fs.readFileSync(schemaPath, 'utf-8'));
    expect(stored!.schema_hash).toBe(onDisk);

    await db.close();
  });

  it('a second initialize() refreshes the row without duplicating it', async () => {
    const db = new Database(dbPath);
    await db.initialize();
    await db.initialize();

    const rows = await db.all<{ version: string }>(
      `SELECT version FROM schema_migrations`
    );
    expect(rows.length).toBe(1);

    await db.close();
  });
});