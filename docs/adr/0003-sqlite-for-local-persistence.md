# ADR-0003: SQLite for Local Notification Persistence

**Date:** 2024-03-10  
**Status:** Accepted  
**Deciders:** Core-Foundry maintainers

---

## Context

The listener service initially held all processed events and scheduled notifications in memory. While this is simple, a restart wipes all state. Contributors and operators running the service long-term need durability: scheduled notifications that survive restarts, a queryable event history, and an audit trail for delivery attempts.

The persistence layer must work without external infrastructure — no managed databases, no Docker Compose requirement — so any contributor can run the full stack with `npm run dev`.

---

## Decision Drivers

- Scheduled notifications must survive listener restarts.
- Delivery history and retry state must be queryable.
- Zero external infrastructure dependencies for local development.
- The solution must be embeddable in the Node.js process.
- Migration management must be simple enough for contributors to run with a single command.

---

## Options Considered

### Option A — In-memory store only

Keep all state in JavaScript objects / Maps with no persistence.

**Pros:**
- Zero setup, zero dependencies.
- Simplest possible implementation.

**Cons:**
- All scheduled notifications lost on restart.
- No queryable history for debugging.
- Not viable for any production-like deployment.

---

### Option B — SQLite via `better-sqlite3` / `sqlite3` (chosen)

Embed a SQLite database file in the listener's working directory, managed via simple migration scripts.

**Pros:**
- No external process or daemon required — the database is a single file.
- Full SQL query support for history, search, and analytics queries.
- Works identically in local dev, CI, and self-hosted deployments.
- Migration state is tracked in a `migrations` table, making schema evolution predictable.
- Well-supported in the Node.js ecosystem.

**Cons:**
- Not horizontally scalable (single writer).
- Performance degrades with very large datasets (mitigated by archiving).
- Requires native bindings (`npm rebuild sqlite3` if Node.js version changes).

---

### Option C — PostgreSQL

Use a managed relational database.

**Pros:**
- Horizontally scalable.
- Full ACID guarantees.
- Rich tooling and monitoring.

**Cons:**
- Requires a running PostgreSQL instance — breaks the "single `npm run dev`" contributor experience.
- Significantly more complex setup for local development and CI.
- Overkill for the current scale.

---

### Option D — Redis

Use Redis for event queues and notification state.

**Pros:**
- Fast in-memory operations with optional persistence.
- Natural fit for queues and pub/sub.

**Cons:**
- Another external process required.
- Less natural for relational queries (history, search, audit).
- Adds operational complexity.

---

## Decision

> We will use **Option B** — SQLite, configured via the `DATABASE_PATH` environment variable.

SQLite satisfies every requirement: zero external dependencies, full SQL querying, file-based persistence, and contributor-friendly setup. The single-writer limitation is not a concern at current scale. If the project outgrows SQLite, this ADR will be superseded by a decision to migrate to PostgreSQL or a managed database.

---

## Consequences

### Positive

- Scheduled notifications survive listener restarts.
- Contributors can inspect the database file directly with any SQLite client.
- History, retry state, and audit logs are queryable with standard SQL.
- CI runs with an in-memory or temp-file database without additional setup.

### Negative / Trade-offs

- Native module rebuild required when switching Node.js versions.
- Not suitable for multi-process deployments without a connection proxy.
- Database file must be excluded from version control (already in `.gitignore`).

### Neutral / Notes

- `DATABASE_PATH` defaults to `./data/notifications.db`.
- Migrations live in `listener/src/migrations/` and are applied with `npm run migrate`.
- The archiving service (`listener/src/services/`) periodically moves old records to reduce database size.

---

## Links

- Environment variable reference: [`ENVIRONMENT_VARIABLES_AND_SECRETS.md`](../../ENVIRONMENT_VARIABLES_AND_SECRETS.md)
- Troubleshooting database errors: [`TROUBLESHOOTING.md`](../../TROUBLESHOOTING.md#listener-service-nodejs)
- Migrations directory: [`listener/src/migrations/`](../../listener/src/migrations/)
