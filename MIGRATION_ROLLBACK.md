# Database Migration Rollback Strategy

How to revert a listener database migration, and the safeguards that make reverting safe.

The listener uses a custom SQLite migration runner (`listener/src/database/migration-system.ts`).
Migrations are applied forward in order, and can be reverted backward in the reverse of that order.

## Quick reference

```bash
cd listener

# See what is currently applied, newest first, and what would be reverted next.
npm run migrate:rollback -- --status

# Revert the single most recent migration.
npm run migrate:rollback

# Revert the three most recent migrations.
npm run migrate:rollback -- --steps 3

# Revert a migration that destroys data (see safeguards below).
npm run migrate:rollback -- --allow-destructive

# Audit the migration directory for rollback safety.
npm run check-migration-safety
```

Point the CLI at a specific database with `DATABASE_PATH`:

```bash
DATABASE_PATH=./data/notifications.db npm run migrate:rollback -- --status
```

## How reverts behave

- Migrations revert **newest first**, exactly reversing the order they were applied in.
- Each revert runs in its **own transaction**. If a revert fails, that step is rolled back
  and the database is left as it was.
- Every target is **validated before anything is written**, so a refusal partway through a
  multi-step rollback cannot leave the database half-reverted.
- Reverts are **recorded, not erased**. The `migrations` row is stamped with `reverted_at`
  instead of being deleted, so the record of what was applied and when it was reverted
  survives. Re-applying a reverted migration revives its row rather than failing.
- Reverting does not undo data written *after* the migration ran. It only reverses the
  schema change the migration made.

## Safeguards against destructive reverts

A migration whose `down()` cannot reconstruct its data with `up()` is marked
`destructive: true` in the migration file:

```ts
const migration = {
  id: '003',
  name: 'drop-legacy-column',
  destructive: true,
  up: async (db) => { /* ... */ },
  down: async (db) => { /* DROP TABLE / DROP COLUMN / TRUNCATE */ },
};
```

`rollback()` **refuses** to revert a destructive migration unless the caller passes
`allowDestructive`, and the CLI requires `--allow-destructive`. This means a routine
`npm run migrate:rollback` can never quietly drop production rows. When the guard trips,
the command names the migration at risk and exits with status `3`:

```
❌ Refusing to roll back destructive migration 001 (initial-schema).
   Re-run with allowDestructive to confirm the data loss is intended.
```

Migration `001` is flagged because its `down()` drops all ten listener tables. Migration
`002` is not flagged, because it only drops indexes, which `up()` recreates without
touching rows.

### `npm run check-migration-safety`

Audits every migration file and fails when:

1. A migration has no `down()` function, so it cannot be rolled back at all.
2. A migration's `down()` contains `DROP TABLE`, `DROP COLUMN`, or `TRUNCATE` but is not
   flagged `destructive: true`.

Rule 2 matters because an unflagged destructive migration is invisible to the runtime
guard: `rollback()` would revert it like any other and discard data without warning.
Exit code `1` on findings, `0` when clean.

## Authoring a new migration

Every migration needs a working `down()`:

```ts
import * as sqlite3 from 'sqlite3';

const migration = {
  id: '003',
  name: 'add-notification-priority',
  up: async (db: sqlite3.Database) => {
    await db.run('ALTER TABLE scheduled_notifications ADD COLUMN priority INTEGER DEFAULT 0');
  },
  down: async (db: sqlite3.Database) => {
    // SQLite before 3.35 cannot drop a column; recreate the table instead.
    await db.run('ALTER TABLE scheduled_notifications DROP COLUMN priority');
  },
};

export default migration;
```

Guidelines:

- Prefer **additive, reversible changes**: add a column with a default, add an index, add
  a table. These revert cleanly.
- If a change must **remove** data, split it across two migrations: first stop writing the
  data, then drop it in a later, `destructive: true` migration. That gives operators a
  rollback window before anything is lost.
- `db.exec()` is used for multi-statement scripts. Do **not** split a script on `;`, because
  `CREATE TRIGGER ... BEGIN ... END` bodies contain their own semicolons and splitting on
  them produces statements that fail to parse.
- Run `npm run check-migration-safety` before opening a PR that adds a migration.

## Operational runbook

**A migration is failing to apply and is blocking a deploy.**

The runner wraps each `up()` in a transaction, so a failed migration leaves no partial
schema. Fix the migration and re-run `npm run migrate`.

**A migration applied but is causing bad behaviour in production.**

1. `npm run migrate:rollback -- --status` to confirm what would be reverted.
2. `npm run migrate:rollback` to revert the most recent migration.
3. If it was flagged destructive, stop and confirm the data loss is intended first, then
   re-run with `--allow-destructive`.
4. Take a backup before any destructive revert. SQLite's `VACUUM INTO` command produces a
   consistent copy of a live database:

   ```bash
   sqlite3 ./data/notifications.db "VACUUM INTO './data/notifications-backup.db'"
   ```

**Rolling back a release that included several migrations.**

Revert them together, newest first, with `--steps`. Check the list first, because the count
includes any destructive migration in range:

```bash
npm run migrate:rollback -- --status
npm run migrate:rollback -- --steps 3
```

## Verifying state

`migrations` rows carry `applied_at` and `reverted_at`. A `NULL` `reverted_at` means the
migration is currently in effect:

```bash
sqlite3 ./data/notifications.db \
  "SELECT id, name, applied_at, reverted_at FROM migrations ORDER BY applied_at DESC;"
```

`npm run check-migrations` verifies there are no pending migrations, which is the check that
a deploy target is fully up to date.

## CI

`npm run check-migration-safety` and `npm test` (which includes
`src/database/migration-rollback.test.ts`) cover the rollback behaviour. The safety audit is
cheap enough to gate every build; a migration without a rollback path, or a destructive one
that is not flagged, fails the build instead of being discovered during an incident.
