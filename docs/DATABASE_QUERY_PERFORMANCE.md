# Database Query Performance

## Goal

Identify the listener’s hottest SQLite queries and speed them up with targeted
composite / partial indexes (migration `002-query-performance-indexes`).

## Slow queries identified

| Area | Query pattern | Why it was slow |
|---|---|---|
| Scheduler claim | `WHERE status='PENDING' AND execute_at <= ? ORDER BY priority, execute_at LIMIT N` | Single-column `status` index forced sort + filter on remaining columns |
| Retry claim | `WHERE status='PENDING' AND retry_count > 0 AND next_retry_at <= ? ORDER BY priority` | Partial coverage only |
| Post-claim fetch | `WHERE processor_id=? AND status=? AND lock_expires_at=?` | No composite on processor lock tuple |
| Notification search | `WHERE status=? … ORDER BY created_at DESC` | Status filter + time sort not covered together |
| Type filter search | `WHERE notification_type=? AND status=?` | No type index |
| Processed search | `WHERE status=? ORDER BY processed_at DESC` | Missing `(status, processed_at)` |
| Tx hash lookup | `tx_hash LIKE/ =` | No `tx_hash` index |
| Metrics CTE | join on `notification_execution_log` by `(scheduled_notification_id, execution_attempt)` | Only single-column FK index |
| Rate-limit audit | `WHERE client_id=? AND timestamp …` | Separate indexes, not composite |

## Indexes added (migration 002)

- `idx_scheduled_notifications_claim` — `(status, priority, execute_at)` WHERE PENDING
- `idx_scheduled_notifications_processor_lock` — `(processor_id, status, lock_expires_at)`
- `idx_scheduled_notifications_status_created` — `(status, created_at)`
- `idx_scheduled_notifications_type_status` — `(notification_type, status)`
- `idx_scheduled_notifications_contract` — `(contract_address)` partial
- `idx_processed_events_status_processed` — `(status, processed_at)`
- `idx_processed_events_event_type_status` — `(event_type, status)`
- `idx_processed_events_tx_hash` — `(tx_hash)` partial
- `idx_execution_log_notification_attempt` — `(scheduled_notification_id, execution_attempt)`
- `idx_rate_limit_events_client_timestamp` — `(client_id, timestamp)`

Applied via:

```bash
# from listener/
npx ts-node src/scripts/check-migrations.ts   # or your usual migrate path
```

New installs pick these up from `listener/src/database/schema.sql` as well.

## Measuring improvement

Use SQLite `EXPLAIN QUERY PLAN` before/after on a database with realistic volume
(≥10k `scheduled_notifications`, ≥10k `processed_events`):

```sql
EXPLAIN QUERY PLAN
SELECT id FROM scheduled_notifications
WHERE status = 'PENDING' AND execute_at <= datetime('now')
ORDER BY priority ASC, execute_at ASC
LIMIT 50;

EXPLAIN QUERY PLAN
SELECT id, status, created_at FROM scheduled_notifications
WHERE status = 'PENDING'
ORDER BY created_at DESC
LIMIT 50;

EXPLAIN QUERY PLAN
SELECT id FROM processed_events
WHERE status = 'PROCESSED'
ORDER BY processed_at DESC
LIMIT 50;
```

### Expected plan changes

| Query | Before | After |
|---|---|---|
| Claim pending | SCAN / SEARCH status + TEMP B-TREE sort | SEARCH using `idx_scheduled_notifications_claim` (no temp sort) |
| Search by status+time | SEARCH status + sort | SEARCH `idx_scheduled_notifications_status_created` |
| Processed status+time | SCAN or single-col + sort | SEARCH `idx_processed_events_status_processed` |

### Wall-clock check (optional)

```sql
-- Rough timing harness (run twice: cold + warm cache)
.timer on
SELECT COUNT(*) FROM scheduled_notifications
WHERE status = 'PENDING' AND execute_at <= datetime('now');
```

On a ~50k-row fixture, claim/search queries typically drop from multi-digit
milliseconds (full sort) to sub-millisecond indexed lookups. Exact numbers
depend on disk and cache; capture your before/after `.timer` results in the PR.

## Query-side notes

- Prefer equality filters (`status = ?`) over leading wildcards (`LIKE '%x%'`).
  Leading-wildcard `LIKE` cannot use B-tree indexes; keep them for optional `q`
  free-text search only.
- Keep `LIMIT`/`OFFSET` pagination; deep offsets remain expensive — prefer
  keyset pagination for very large result sets in a follow-up.
- Partial indexes (`WHERE status = 'PENDING'`) stay small as completed rows grow.

## Rollback

Migration `002` `down()` drops the new indexes if needed.
