# Contract Event Topic Naming and Field Ordering Standard

> Establishes a single, documented convention for NotifyChain smart contract event topics and field ordering so listener decoding stays deterministic and third-party integrations can subscribe selectively without guessing topic positions.

## 1. Purpose

Inconsistent event topic conventions complicate listener decoding and third-party integrations. This standard:

- Establishes a consistent **event topic naming convention**.
- Reviews every event topic structure in the repository.
- Standardizes **field ordering** within topics and data.
- Documents the **expected event schemas** consumed off-chain.
- Preserves **backward compatibility** with existing consumers and documents the implications of changes.

It applies to the AutoShare/notification contract (`contract/contracts/hello-world/src/base/`) and records the deliberate divergence of the TaskBounty contract.

## 2. Naming convention

### 2.1 Event name symbol (topic 0)

Topic 0 is always the event name `Symbol`, emitted automatically by the Soroban runtime from the `#[contractevent]` struct.

| Rule | Convention | Rationale |
|------|-----------|-----------|
| Symbol form | `snake_case` derived from the struct name (e.g. `NotificationScheduled` → `notification_scheduled`) | Stable, human-readable, matches `getEventName()` extraction in `listener/src/utils/event-utils.ts:330` |
| Case | Lowercase with underscores; no PascalCase symbols | `scValToString()` accepts `scvSymbol` and `scvString`; normalizing to one case keeps `matchesEventFilter()` deterministic |
| Separator | `_` (underscore) | Matches existing event names used by tests (`task_created`, `notification_scheduled`) |
| Version suffix | `_v<N>` appended for breaking schema versions (e.g. `notification_scheduled_v2`) | Matches `EVENT_SCHEMA_VERSION_SUFFIX` in `events.rs:41` and `parseEventSchemaVersion` |

Do **not** emit event names in PascalCase as topic 0 symbols. If a contract currently emits a PascalCase symbol, treat it as a pre-standard migration candidate and document it; do not change an emitted symbol without a versioned event name.

### 2.2 Topic structure (indexed fields)

Every standard event follows this ordered topic layout:

```
Topic 0:  event name symbol  (snake_case, auto-emitted)
Topic 1..N-2: primary business key(s)  (e.g. creator Address, notification_id)
Topic N-1: NotificationCategory  (u32 enum)
Topic N:   NotificationPriority  (u32 enum)
Data:      remaining non-topic fields, in struct declaration order
```

`NotificationCategory` and `NotificationPriority` are **trailing** topics on every standard event. They are placed last so consumers that only read the event name (topic 0) and the original business keys are unaffected when they are added — the extra trailing topics are simply ignored.

### 2.3 Data (non-indexed payload)

Data fields are serialized as XDR in `value` and appear in **struct declaration order**. Consumers must decode by field name/type, never by positional index into `value`, because the Soroban runtime does not guarantee stable positional encoding of map/single-value payloads across compiler versions.

## 3. Shared topic types

Defined in `contract/contracts/hello-world/src/base/events.rs`:

| Type | Encoding | Values |
|------|----------|--------|
| `NotificationCategory` | `u32` enum topic | `0=Group`, `1=Admin`, `2=Financial`, `3=Notification`, `4=System` |
| `NotificationPriority` | `u32` enum topic | `0=Low`, `1=Medium`, `2=High`, `3=Critical` |
| `AuditAction` | `u32` enum topic | `0=Created`, `1=DeliveryAttempt`, `2=DeliveryFailed`, `3=Acknowledged`, `4=Cancelled`, `5=Expired` |

`category` is always the penultimate topic; `priority` is always the final topic.

## 4. Review of event topic structures

### 4.1 AutoShare/notification contract — `events.rs`

| Event | Topic 1 | Topic 2 | Topic 3 | Topic 4 | Data fields (order) |
|-------|---------|---------|---------|---------|---------------------|
| `AutoshareCreated` | `creator` (Address) | `category` | `priority` | — | `id` (BytesN<32>) |
| `AutoshareUpdated` | `updater` (Address) | `category` | `priority` | — | `id` (BytesN<32>) |
| `GroupDeactivated` | `creator` (Address) | `category` | `priority` | — | `id` (BytesN<32>) |
| `GroupActivated` | `creator` (Address) | `category` | `priority` | — | `id` (BytesN<32>) |
| `CategoryRegistered` | `admin` (Address) | `category` | `priority` | — | (none) |
| `ContractPaused` | `admin` (Address) | `category` | `priority` | — | (none) |
| `ChannelPreferenceUpdated` | `recipient` (Address) | `category` | `priority` | — | `channel` (u32), `enabled` (bool), `updated_at` (u64) |
| `ContractUnpaused` | `admin` (Address) | `category` | `priority` | — | (none) |
| `AdminTransferred` | `old_admin` (Address) | `category` | `priority` | — | `new_admin` (Address) |
| `AuthorizationFailure` | `caller` (Address) | `category` | `priority` | — | `action` (String) |
| `Withdrawal` | `token` (Address) | `recipient` (Address) | `category` | `priority` | `amount` (i128) |
| `NotificationScheduled` | `creator` (Address) | `category` | `priority` | — | `notification_id` (BytesN<32>), `payload_version` (u32) |
| `NotificationExpired` | `notification_id` (BytesN<32>) | `category` | `priority` | — | `expires_at` (u64) |
| `ScheduledNotificationCancelled` | `caller` (Address) | `category` | `priority` | — | `notification_id` (BytesN<32>) |
| `NotificationDelivered` | `notification_id` (BytesN<32>) | `delivered_by` (Address) | `category` | `priority` | `delivered_at` (u64) |
| `NotificationRecalled` | `notification_id` (BytesN<32>) | `recalled_by` (Address) | `category` | `priority` | `recalled_at` (u64) |
| `NotificationRevoked` | `notification_id` (BytesN<32>) | `revoked_by` (Address) | `category` | `priority` | (none — `revoked_at` removed) |
| `NotificationExtended` | `notification_id` (BytesN<32>) | `caller` (Address) | `category` | `priority` | `new_expires_at` (u64) |
| `NotificationAcknowledged` | `notification_id` (BytesN<32>) | `acknowledger` (Address) | `category` | `priority` | `timestamp` (u64) |
| `SubscriptionCancelled` | `group_id` (BytesN<32>) | `subscriber` (Address) | `category` | `priority` | `cancelled_at` (u64) |
| `BatchNotificationsCreated` | `creator` (Address) | `category` | `priority` | — | `count` (u32), `ids` (Vec<BytesN<32>>) |
| `BatchProcessingCompleted` | `batch_id` (BytesN<32>) | `category` | `priority` | — | `processed_count` (u32) |
| `AuditRecordAppended` | `notification_id` (BytesN<32>) | `action` (AuditAction) | `category` | `priority` | `seq` (u64), `actor` (Address) |
| `OwnershipTransferInitiated` | `previous_owner` (Address) | `category` | `priority` | — | `pending_owner` (Address) |
| `OwnershipTransferred` | `previous_owner` (Address) | `category` | `priority` | — | `new_owner` (Address) |
| `ReputationUpdated` | `sender` (Address) | `category` | `priority` | — | `new_score` (i64), `successful_count` (u32), `failed_count` (u32) |
| `NotificationLimitsConfigured` | `admin` (Address) | `category` | `priority` | — | `max_payload_size`, `max_expiration_seconds`, `min_expiration_seconds`, `max_batch_size` |
| `ReputationTierChanged` | `sender` (Address) | `category` | `priority` | — | `old_tier` (u32), `new_tier` (u32), `reputation_score` (i64) |
| `SchemaVersionSet` | `admin` (Address) | `category` | `priority` | — | `schema_version` (u32), `previous_version` (u32) |
| `NotificationAccessed` | `notification_id` (BytesN<32>) | `accessor` (Address) | `category` | `priority` | `accessed_at` (u64) |
| `ChannelMetadataUpdated` | `channel_id` (BytesN<32>) | `updater` (Address) | `category` | `priority` | `updated_at` (u64) |
| `NotificationArchived` | `notification_id` (BytesN<32>) | `category` | `priority` | — | `archived_at` (u64), `archive_reason` (String) |
| `TemplateRegistered` | `owner` (Address) | `category` | `priority` | — | `template_id` (BytesN<32>) |
| `TemplateUpdated` | `owner` (Address) | `category` | `priority` | — | `template_id` (BytesN<32>) |

All `events.rs` events follow the standard: business key(s) → `category` → `priority`, then data in declaration order.

### 4.2 Channel contract — `channel.rs`

| Event | Topic 1 | Topic 2 | Topic 3 | Topic 4 | Data fields |
|-------|---------|---------|---------|---------|-------------|
| `ChannelCreated` | `creator` (Address) | `category` | `priority` | — | `channel_id` (BytesN<32>) |
| `ChannelSubscribed` | `channel_id` (BytesN<32>) | `subscriber` (Address) | `category` | — | `subscriber_count` (u32) |
| `ChannelUnsubscribed` | `channel_id` (BytesN<32>) | `subscriber` (Address) | `category` | — | `subscriber_count` (u32) |
| `BatchSubscribeCompleted` | `subscriber` (Address) | `category` | `priority` | — | `succeeded` (u32), `failed` (u32) |

**Deviation:** `ChannelSubscribed` and `ChannelUnsubscribed` omit the trailing `priority` topic and end on `category`. Under this standard they are non-conforming: every standard event must end with `priority`. Because these topics are already emitted, adding `priority` now would be a **breaking topic reorder/addition** for consumers indexing by topic position from the end. Documented as a known deviation (§7); new channel events must include `priority`.

### 4.3 TaskBounty contract — deliberate divergence

`Documents/Task Bounty/src/events.rs` uses a different, pre-existing convention:

- Topics are a two-element symbol tuple, e.g. `("task", "created")`, `("work", "submit")`, `("api", "register")` — not a single event-name symbol.
- Data is a positional tuple, e.g. `(task_id, poster, title, reward, deadline)` — not named fields.
- No `NotificationCategory` / `NotificationPriority` topics.
- No `#[contractevent]` / `#[topic]` attributes; events are published directly via `env.events().publish(...)`.

This is a **deliberate divergence** maintained for the TaskBounty contract. Listener decoders for TaskBounty events must not assume the AutoShare topic layout. Cross-contract consumers should key on `contractId` before applying a topic layout.

## 5. Field ordering standard

### 5.1 Within topics

Order is significant and part of the event contract:

1. `topic[0]` = event name symbol (`snake_case`)
2. Business key(s) in declaration order (the most selective filter field first)
3. `NotificationCategory`
4. `NotificationPriority`

### 5.2 Within data

Data fields appear in **struct declaration order**. Consumers decode by name + type, not position.

### 5.3 Trailing metadata rule

`category` and `priority` are always appended last. Adding them to an event that previously lacked them is backward compatible for consumers that read only leading topics, but is a **breaking change** for consumers that derive meaning from the total topic count or last-topic position.

## 6. Documented expected event schemas

The canonical machine-readable schema consumed by the listener compatibility checker is:

`listener/src/schema/consumer-event-schema.json`

It lists, per event: `expectedTopics` (ordered `{name, type}`) and `expectedFields` (ordered `{name, type}`). The compatibility check (`listener/src/schema/compatibility-check.ts`) verifies:

- Every consumer-expected topic/field exists in the contract at the same position.
- Names and types match exactly.
- Trailing contract topics/fields beyond consumer expectations are safe additions.
- Missing contract events or fields are breaking changes.

The schema is kept in sync with `events.rs` and `channel.rs`. When a contract event changes, update both the `.rs` and the JSON schema, and bump the event schema version per `docs/EVENT_SCHEMA_VERSIONING.md`.

The historical fixtures used for compatibility regression testing live in:

`listener/src/test-fixtures/historical-events.ts`

**Known fixture inconsistency:** `HISTORICAL_EVENTS_V1.notificationRevoked` declares `data: { revoker, revoked_at, reason }`, but the contract (`NotificationRevoked`) and consumer schema both have no data fields (`revoked_at` was removed for gas). The fixture predates the removal. Until the fixture is corrected, decoders must not rely on `revoked_at` in `NotificationRevoked` data.

## 7. Compatibility implications

| Change | Compatibility | Action required |
|--------|--------------|-----------------|
| Add a new event | Safe | Consumers ignoring unknown names are unaffected; register decoder optionally |
| Add a trailing `category`/`priority` topic | Safe for leading-topic readers; breaking for last-topic-position readers | Document; consumers using total topic count must update |
| Add a trailing data field | Safe | Consumers decoding by name ignore unknown keys |
| Reorder or remove a topic | **Breaking** | Ship as `<name>_v<N>`; dual-emit old version for ≥1 release |
| Remove or rename a data field, or change its type | **Breaking** | Ship as `<name>_v<N>` |
| Change event name symbol case | **Breaking** for `getEventName()`/`matchesEventFilter()` | Keep `snake_case`; do not rename emitted symbols |
| TaskBounty contract events | Divergent layout | Key on `contractId`; do not apply AutoShare topic layout |

## 8. Deterministic listener decoding

Decoding remains deterministic when:

- Event name is extracted from the first decodable symbol/string topic via `getEventName()` (`event-utils.ts:330`), which scans topics in order and returns the first match.
- Decoders are registered by event name in `EventDecoderRegistry` (`event-decoder-registry.ts`) and return `null` on parse failure so the pipeline falls back to `RawUndecodedEvent` without crashing.
- Topics are decoded by **position** per this standard; data is decoded by **name/type**, never by positional index into `value`.
- Unknown event names produce `RawUndecodedEvent` with `reason: 'no_decoder'`; decode failures produce `reason: 'decode_failed'`.

## 9. Source map

| Concern | File |
|---------|------|
| Naming standard & version suffix | `contract/contracts/hello-world/src/base/events.rs:35-41` |
| `NotificationCategory` / `NotificationPriority` | `contract/contracts/hello-world/src/base/events.rs:56-98` |
| All AutoShare event structs + `#[topic]` layout | `contract/contracts/hello-world/src/base/events.rs:100-730` |
| Channel events (known `priority` deviation) | `contract/contracts/hello-world/src/base/channel.rs:128-178` |
| TaskBounty divergent convention | `Documents/Task Bounty/src/events.rs` |
| Consumer schema (topics + fields) | `listener/src/schema/consumer-event-schema.json` |
| Compatibility checker | `listener/src/schema/compatibility-check.ts` |
| Event name extraction | `listener/src/utils/event-utils.ts:330` (`getEventName`) |
| Decoder registry | `listener/src/services/event-decoder-registry.ts` |
| Historical fixtures | `listener/src/test-fixtures/historical-events.ts` |
| Event schema versioning rules | `docs/EVENT_SCHEMA_VERSIONING.md` |
| Event reference (per-event examples) | `CONTRACT_EVENT_REFERENCE.md` |
| Decoding cookbook | `STELLAR_EVENT_DECODING_COOKBOOK.md` |

## 10. Acceptance criteria status

- Contract events follow a documented convention — §2–§4 (snake_case event name symbol; business keys → `category` → `priority` topic order; data in declaration order).
- Event fields are consistently ordered — §5 (topic and data ordering rules; per-event tables in §4).
- Listener decoding remains deterministic — §8 (positional topic decoding, name/typed data decoding, `getEventName`, registry fallback).
- Compatibility implications are documented — §7 (safe vs breaking changes; TaskBounty divergence; channel `priority` deviation; fixture inconsistency).
