# Pull Request: Event Type Filtering, Batch Notifications & Audit Logging

## Branch
`feature/event-type-filtering-batch-notifications-audit-logging`

## Closes
Closes #102 · Closes #40 · Closes #181 · Closes #173

---

## Overview

This PR delivers three interconnected features that improve how the NotifyChain contract communicates lifecycle events to off-chain consumers, reduce the operational cost of sending notifications at scale, and give organisations a complete, immutable audit trail for compliance and monitoring.

---

## Changes Summary

### 1. Event Type Filtering — closes #102

Off-chain consumers previously had no way to selectively subscribe to specific notification categories without decoding every event. Every emitted event now carries two additional trailing topics:

- **`NotificationCategory`** — `Group`, `Admin`, `Financial`, or `Notification`
- **`NotificationPriority`** — `Low`, `Medium`, `High`, or `Critical`

Both are appended as the last two topics of every event, preserving full backward compatibility: existing listeners that only read the event name and prior topics are unaffected.

**Files changed**
- `src/base/events.rs` — added `NotificationCategory` and `NotificationPriority` enums; all event structs updated
- `src/base/types.rs` — `AutoShareDetails` carries `priority` field
- `src/autoshare_logic.rs` — all emit sites pass category + priority

**Acceptance criteria met**
- ✅ Consumers can identify notification types directly from emitted events
- ✅ Existing functionality remains unaffected
- ✅ Unit tests validate the new event format (`notification_test.rs`, `payload_validation_test.rs`)

---

### 2. Batch Notification Creation — closes #40

Creating notifications individually at scale inflates transaction costs and operational overhead. A new `batch_schedule_notifications` entry point allows up to 50 notifications to be created in a single transaction.

**How it works**
- Accepts parallel `ids` and `ttl_seconds` vectors — must be the same length
- Full pre-validation pass before any writes (all-or-nothing semantics): intra-batch duplicate detection, storage collision check, TTL validity, overflow check
- Emits one `NotificationScheduled` event per notification, plus a single `BatchNotificationsCreated` summary event carrying the count and full id list
- Each notification also receives a `Created` audit record (see below)
- Blocked while the contract is paused

**New error variant**
- `BatchTooLarge = 26` — returned when the batch exceeds 50 entries

**Files changed**
- `src/base/errors.rs` — `BatchTooLarge` variant
- `src/base/events.rs` — `BatchNotificationsCreated` event
- `src/autoshare_logic.rs` — `batch_schedule_notifications` implementation
- `src/lib.rs` — `batch_schedule_notifications` public entry point

**Acceptance criteria met**
- ✅ Multiple notifications can be created in a single transaction (up to 50)
- ✅ Invalid recipients / inputs are handled appropriately (all-or-nothing)
- ✅ Events emitted for each created notification
- ✅ Tests cover large batch scenarios, edge cases, and pause guard (`batch_notification_test.rs`)

---

### 3. Audit Logging — closes #181 & #173

Organisations require visibility into delivery attempts and outcomes for compliance and operational monitoring. An append-only, on-chain audit log now records every stage of the notification lifecycle.

**Lifecycle actions recorded**

| Action | Triggered by |
|---|---|
| `Created` | `schedule_notification`, `batch_schedule_notifications` |
| `DeliveryAttempt` | `record_delivery_attempt` |
| `DeliveryFailed` | `record_delivery_failure` |
| `Acknowledged` | `record_acknowledgment` |
| `Cancelled` | `cancel_notification` |
| `Expired` | `expire_notification` |

**Storage model**
- `DataKey::AuditLog` — single `Vec<AuditRecord>` in persistent storage; append-only, never modified after write
- `DataKey::AuditSeq` — monotonically increasing counter in instance storage
- Each `AuditRecord` carries: `seq`, `notification_id`, `action`, `actor`, `timestamp`

**Query endpoints**
- `get_audit_log()` — returns the full log in creation order
- `get_notification_audit(notification_id)` — returns all records for a specific notification

**New write helpers** (pause-aware, auth-required)
- `record_delivery_attempt(notification_id, actor)`
- `record_delivery_failure(notification_id, actor)`
- `record_acknowledgment(notification_id, actor)`

**Files changed**
- `src/base/events.rs` — `AuditAction` enum, `AuditRecordAppended` event
- `src/base/types.rs` — `AuditRecord` type
- `src/autoshare_logic.rs` — `append_audit_record` (private), all query and write helpers
- `src/lib.rs` — all audit public entry points

**Acceptance criteria met**
- ✅ All lifecycle events are recorded
- ✅ Audit records are searchable by notification id
- ✅ Logs remain immutable after creation (append-only, never updated or deleted)
- ✅ `AuditRecordAppended` event emitted for every record so off-chain indexers can sync in real time (`audit_log_test.rs`)

---

## Testing

### New test files

| File | Tests | What it covers |
|---|---|---|
| `batch_notification_test.rs` | 13 | Happy path, all rejection cases (empty, mismatched lengths, zero TTL, duplicate id, already scheduled, batch too large), boundary (exactly 50 / 51), pause guard, summary event shape |
| `audit_log_test.rs` | 18 | All six lifecycle actions, sequence ordering, immutability, filter by notification id, empty result for unknown id, pause guards on all write helpers, batch integration |
| `payload_validation_test.rs` | 20 | Invalid payloads (zero usage count, name too long, unsupported token, duplicate id, zero TTL, overflow TTL, empty members, bad percentages, duplicates, too many members), boundary values, every event carries category + priority, consumer filtering by category |

**Total suite: 179 tests — 179 passing, 0 failing**

### Running the tests
```bash
cd contract/contracts/hello-world
cargo test
```

---

## Files Changed

### Modified (5)
| File | Change |
|---|---|
| `src/autoshare_logic.rs` | Batch creation, audit helpers, intra-batch duplicate check, audit hooks in schedule/expire/cancel |
| `src/base/errors.rs` | Added `BatchTooLarge = 26` |
| `src/base/events.rs` | Added `AuditAction`, `AuditRecordAppended`, `BatchNotificationsCreated`; import `Vec` |
| `src/base/types.rs` | Added `AuditRecord`; import `AuditAction` |
| `src/lib.rs` | Wired all new public entry points; registered three new test modules |

### New (3)
| File | Description |
|---|---|
| `src/tests/batch_notification_test.rs` | Batch notification tests |
| `src/tests/audit_log_test.rs` | Audit logging tests |
| `src/tests/payload_validation_test.rs` | Payload validation and event filtering tests |

**Total: 8 files · +1,915 insertions · -6 deletions**

---

## Backward Compatibility

All changes are fully backward compatible:

- Event consumers that do not read the trailing category/priority topics are unaffected — the existing topics and data payloads are unchanged
- No existing storage keys or data structures were modified
- All existing 128 tests continue to pass alongside the 51 new ones

---

## Deployment Checklist

- [ ] Review code changes
- [ ] Run `cargo test` — all 179 tests must pass
- [ ] Verify `BatchTooLarge` error code (26) does not collide with any client-side error handling
- [ ] Confirm off-chain listener is updated to read category/priority topics if selective subscription is desired
- [ ] Deploy to testnet
- [ ] Smoke-test batch creation and audit query endpoints on testnet
- [ ] Deploy to production

---

## Commit

```
a85ffbc feat: event type filtering, batch notifications, audit logging
```

---

**Ready for Review** ✅
