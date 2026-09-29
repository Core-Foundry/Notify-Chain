#!/usr/bin/env ts-node
/**
 * Audits the migration directory for rollback safety.
 *
 * Two rules are enforced, both of which are far cheaper to catch here than in
 * production:
 *
 * 1. Every migration must export a `down()`. A migration without one cannot be
 *    rolled back, so a bad deploy has no way out.
 * 2. Any migration whose `down()` performs a destructive statement must be
 *    flagged `destructive: true`. The flag is what makes `rollback()` refuse
 *    the revert unless the operator explicitly opts in.
 *
 * Destructive statements detected: DROP TABLE, DROP COLUMN, and TRUNCATE.
 *
 * Usage:
 *   npm run check-migration-safety
 */
import * as fs from 'fs';
import * as path from 'path';

const MIGRATIONS_DIR = path.join(__dirname, '../migrations');

/** Statements that discard data `up()` cannot reconstruct. */
const DESTRUCTIVE_PATTERNS: Array<{ pattern: RegExp; label: string }> = [
  { pattern: /DROP\s+TABLE/i, label: 'DROP TABLE' },
  { pattern: /DROP\s+COLUMN/i, label: 'DROP COLUMN' },
  { pattern: /TRUNCATE/i, label: 'TRUNCATE' },
];

interface AuditFinding {
  file: string;
  message: string;
}

async function audit(): Promise<AuditFinding[]> {
  const findings: AuditFinding[] = [];

  if (!fs.existsSync(MIGRATIONS_DIR)) {
    findings.push({ file: MIGRATIONS_DIR, message: 'Migrations directory does not exist' });
    return findings;
  }

  const files = fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((file) => file.endsWith('.ts') || file.endsWith('.js'))
    .sort();

  if (files.length === 0) {
    findings.push({ file: MIGRATIONS_DIR, message: 'No migrations found' });
    return findings;
  }

  for (const file of files) {
    const migrationPath = path.join(MIGRATIONS_DIR, file);
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const module = await import(migrationPath);
    const migration = module.default;

    if (!migration || typeof migration.up !== 'function') {
      findings.push({ file, message: 'Does not export a default object with an up() function' });
      continue;
    }

    if (typeof migration.down !== 'function') {
      findings.push({
        file,
        message: 'Does not export a down() function, so it cannot be rolled back',
      });
    }

    // Rule 2 only applies once a down() exists to inspect.
    if (typeof migration.down === 'function') {
      const source = fs.readFileSync(migrationPath, 'utf8');
      const matched = DESTRUCTIVE_PATTERNS.filter(({ pattern }) => pattern.test(source)).map(
        ({ label }) => label,
      );

      if (matched.length > 0 && migration.destructive !== true) {
        findings.push({
          file,
          message:
            `down() uses ${matched.join(', ')} but the migration is not flagged ` +
            '`destructive: true`, so rollback() would silently discard data',
        });
      }
    }
  }

  return findings;
}

audit()
  .then((findings) => {
    if (findings.length === 0) {
      console.log('✅ All migrations define a rollback path and flag destructive reverts');
      process.exit(0);
    }

    console.error('❌ Migration rollback safety issues found:\n');
    for (const finding of findings) {
      console.error(`  ${finding.file}: ${finding.message}`);
    }
    console.error('\nFix each migration by adding a down() function, and set');
    console.error('`destructive: true` when reverting it would discard unrecoverable data.');
    process.exit(1);
  })
  .catch((error) => {
    console.error('❌ Migration safety check failed to run:', error);
    process.exit(2);
  });
