# Contract Upgrade Compatibility and State Migration Guide

This guide explains how to upgrade the NotifyChain smart contracts
compatibly, how contract storage behaves across an upgrade, which checks to
perform before upgrading, how to migrate state between contract
deployments, what cannot be rolled back, and a practical end-to-end
example.

> Related reading:
> - [`CONTRACT_UPGRADE_GUIDE.md`](../CONTRACT_UPGRADE_GUIDE.md) — the original per-change upgrade workflow (both workspaces).
> - [`DEPLOYMENT_GUIDE.md`](../DEPLOYMENT_GUIDE.md) — deployment procedure and cross-references.
> - [`CONTRACT_EVENT_REFERENCE.md`](../CONTRACT_EVENT_REFERENCE.md) — event schemas and versioning.
> - [`examples/event-compatibility/README.md`](../examples/event-compatibility/README.md) — backward-compatible event evolution with a runnable decoder example.

---

## 1. How upgrades actually work in this codebase

**There is no in-place `upgrade()` entry point.** The AutoShare contract
(`contract/contracts/hello-world/src/lib.rs`) exposes no function to
replace its own Wasm — there is no `set_wasm`/`WasmHash` handling, and no
TTL-extension (`extend_instance_ttl`) helpers anywhere in the contract
source. Upgrading therefore means:

1. Build a new Wasm from modified source.
2. **Deploy it as a fresh contract** (new contract ID) via
   `stellar contract deploy`.
3. Re-initialize administration on the new instance.
4. Migrate any required state by reading it from the old contract and
   writing it to the new one.
5. Re-point every off-chain consumer (listener, dashboard, integrators) at
   the new contract ID.

`CONTRACT_UPGRADE_GUIDE.md` §6 documents this deployment sequence; this
guide focuses on the compatibility and state-migration decisions around it.

### Version surfaces you must keep in sync

| Version marker | Where | Who consumes it |
|---|---|---|
| `VERSION: u32 = 1` returned by `version()` (lib.rs:41, 46-48) | Contract | Off-chain deploy tooling; test `src/tests/version_test.rs` |
| `CURRENT_NOTIFICATION_VERSION: u32 = 1` (`src/base/types.rs:12`) | Contract | Stamped into every stored/archived notification; `get_notification_version()` entry (lib.rs:804) |
| Schema-version registry: `MIN_SUPPORTED_SCHEMA_VERSION = 1`, `MAX_SUPPORTED_SCHEMA_VERSION = 1` (`src/autoshare_logic.rs:2332-2395`) | Contract | `set_schema_version` (admin-only), `get_schema_version`, `is_version_supported`; emits `SchemaVersionSet` |
| `CURRENT_EVENT_VERSION = 1`, `SUPPORTED_EVENT_VERSIONS = {1}` (`listener/src/utils/event-utils.ts:131-137`) | Listener | `parseEventVersion` / `validateEventPayload` reject events with unsupported versions |
| `ContractVersionRegistry` (`listener/src/schema/contract-version-registry.ts`) | Listener | Maps contract `version()` output → expected event schema; `diagnose()` classifies changes as `compatible` / `incompatible` / `unsupported` |
| `CURRENT_WEBHOOK_PAYLOAD_VERSION = '1.0'` (`listener/src/utils/webhook-payload-version.ts`) | Listener | Outbound webhook payloads (`schemaVersion` field + `x-notifychain-payload-version` header) |

**Rule of thumb:** bump a version marker whenever its shape changes, and
update every consumer of that marker in the same change.

---

## 2. Storage layout and compatibility

The contract uses two Soroban storage scopes (documented at
`src/autoshare_logic.rs:20-41`):

### Instance storage (string keys, `env.storage().instance()`)

Small, frequently-read values that share the contract instance's TTL
(`autoshare_logic.rs:85-94`):

| Key | Contents |
|---|---|
| `Admin` | Admin `Address` (set by `initialize_admin`, changed by `transfer_admin`/`accept_ownership`) |
| `IsPaused` | Pause flag |
| `UsageFee` | Usage fee (seeded to `10` on init) |
| `SuppTkns` | Supported token list (empty on init) |
| `PendOwner` | Pending owner during two-step ownership transfer |
| `DelivSeq` | Delivery idempotency sequence counter |

### Persistent storage (`env.storage().persistent()`, `DataKey` enum)

Durable per-entity state (`autoshare_logic.rs:43-77`):

- `AutoShare(BytesN<32>)` — full group record (members **embedded**)
- `AllGroups` — ordered `Vec<BytesN<32>>` of group ids
- `UserPaymentHistory(Address)`, `GroupPaymentHistory(BytesN<32>)`
- `ScheduledNotification(BytesN<32>)` — subscriptions with TTL/priority
- `AuditSeq`, `AuditLog` — immutable audit trail
- `NotificationRevokers(BytesN<32>)`, `NotificationLimits`,
  `RegisteredCategories` (seeded with the 4 default categories)
- `SchemaVersion`, `ArchivedNotification(BytesN<32>)` (version-stamped),
  `DeliveryIdempotency(BytesN<32>)`, `ChannelMetadata(BytesN<32>)`

Channel state uses a separate key enum in
`src/base/channel.rs:50` (`Channel`, `Subscription`, `ChannelSubscribers`,
`AllChannels`) in the same persistent scope. The template registry keeps its
own keys (`src/template_registry_logic.rs:28-30`) explicitly separate from
`DataKey` to avoid collisions. **No temporary storage is used.**

### Storage-compatibility rules

1. **Never reuse a `DataKey` variant with a different meaning or type.**
   Deserializing old bytes with a new type aborts the transaction.
2. **Prefer additive change:** add new variants or add fields inside a
   struct; keep old fields readable. The contract follows the "read
   existing keys unchanged, default new fields" philosophy spelled out in
   `CONTRACT_UPGRADE_GUIDE.md` §3.
3. **Renaming a variant changes its encoded discriminant** — treat it as a
   storage break requiring migration.
4. **In-code precedent:** `DataKey::GroupMembers` was removed (members now
   embedded in `AutoShareDetails`) and the pause flag moved from persistent
   storage (`DataKey::IsPaused`) into instance storage — both documented in
   the enum comments (`autoshare_logic.rs:49-58`) and pinned by
   `src/tests/storage_optimization_test.rs`. That change was safe because
   it was deployed fresh; re-reading old instances with the new code would
   not have worked.
5. **Instance TTL is not managed:** the contract never extends its own
   instance TTL, so a long-idle instance's storage can lapse. For
   production deployments, plan operational TTL extension or keep the
   instance warm — this is a known gap, not a supported upgrade path.

### Event compatibility

Events are part of the public ABI. Follow the five decisions codified in
`examples/event-compatibility/README.md`: add new indexed fields only as
**trailing topics**, extend the data map for structured fields, include an
explicit `payload_version`, never change the event name, and rely on
decoder fallbacks. Never remove fields, reorder topics, or change types.
The listener validates incoming versions (`SUPPORTED_EVENT_VERSIONS`) and
the `ContractVersionRegistry.diagnose()` classifies renames (e.g.
`payload_version → schema_version`) as breaking.

---

## 3. Pre-upgrade checks

Run through this checklist before deploying a new contract:

1. **Classify the change** (`CONTRACT_UPGRADE_GUIDE.md` §1): does it touch
   public API, storage shape, event schema, authorization, or deployment
   config? If more than one row changes, split into separate PRs.
2. **Build and test:** `cargo fmt --all && cargo test && stellar contract
   build` in `contract/contracts/hello-world/` (guide §4). Version tests
   live in `src/tests/version_test.rs`, `schema_version_test.rs`,
   `notification_version_test.rs`.
3. **Inspect the Wasm:** find the artifact under
   `target/wasm32v1-none/release/`, compute `sha256sum`, and run
   `stellar contract inspect --wasm <file>` (guide §5). Prefer the
   reproducible build (`scripts/reproducible-contract-build.sh`) so your
   artifact hashes match CI bit-for-bit.
4. **Read the live state you plan to migrate:** enumerate groups
   (`get_all_groups`), notifications, audit log, and current
   `get_schema_version()` on the old contract ID. Record everything you
   cannot afford to lose.
5. **Confirm administrative control:** know the current admin
   (`get_admin`) and pending owner (`get_pending_owner`). You will need the
   admin (or the deployer identity) to re-initialize the new instance.
6. **Coordinate off-chain versions:** if event schemas changed, update
   `SUPPORTED_EVENT_VERSIONS` / the `ContractVersionRegistry` and deploy
   the listener changes that can decode the new versions **before** the new
   contract goes live.
7. **Rehearse on testnet:** the Makefile provides `deploy-testnet` (Test SDF
   network) before any mainnet action (`deploy-mainnet`).
8. **Record the deployment:** the Makefile's `deploy` target writes
   `deployment-manifest.json` (contract id, wasm path, wasm sha256,
   network, timestamps). Keep old manifests — they are your rollback
   inventory.

---

## 4. State migration across a redeploy

Because state does not follow the code, you migrate it explicitly:

### 4.1 What migrates automatically vs. manually

- **Nothing migrates automatically.** Persistent and instance storage are
  attached to the contract *instance*, so a fresh deployment starts empty.
- **On-chain public data** (event history) stays queryable via the Stellar
  RPC/archives independent of contract ID.
- **Off-chain records** in the listener DB (`processed_events`,
  `scheduled_notifications`) reference the *old* `contract_address`; keep
  them and treat old-contract history as read-only.

### 4.2 Migration procedure

1. **Export** from the old contract using its view functions: group list
   (`get_all_groups`), individual groups/notifications/audit entries, and
   `get_schema_version()`. There is no bulk dump — script the reads.
2. **Replay** into the new contract using its public write functions
   (create groups, schedule notifications, re-register categories as
   needed). `initialize_admin` seeds the default fee, empty token list, and
   the four default categories automatically
   (`autoshare_logic.rs:330-350`).
3. **Re-establish administration:**
   - Simplest: call `initialize_admin(new_admin)` on the fresh instance
     (idempotent — only sets when unset).
   - For controlled handover, use the two-step ownership flow:
     `initiate_ownership_transfer(current_owner, new_owner)` →
     `accept_ownership(new_owner)` (mirrors OpenZeppelin's `Ownable2Step`,
     Issue #367), or `transfer_admin` for one-step admin swaps. Both emit
     `AdminTransferred` / `OwnershipTransferInitiated` / `OwnershipTransferred`.
4. **Restore configuration** that is not auto-seeded: supported tokens
   (`add_supported_token`), usage fee (`set_usage_fee`), notification
   limits (`configure_notification_limits`).
5. **Set the schema version** on the new instance with
   `set_schema_version(env, admin, v)` (admin-only; validated against the
   `MIN/MAX_SUPPORTED_SCHEMA_VERSION` range) so consumers can detect the
   schema generation.
6. **Re-point consumers:** update `CONTRACT_ADDRESSES`
   (JSON; the only startup-required listener var), dashboard config, and
   any integrator configs to the new contract ID.
7. **Verify:** call `version()`, `get_schema_version()`, `get_admin()` on
   the new ID; watch the listener ingest events from the new contract;
   confirm no gaps via the dashboard.

### 4.3 Rollback limitations — know them before you start

- **Rolling back code = redeploying the prior Wasm as a new contract.**
  There is no on-chain switch to revert. Keep the previous Wasm file and
  its SHA-256 (from `deployment-manifest.json`).
- **Writes made on the new contract do not flow back.** If you revert, you
  must replay those writes onto the prior version's redeployed instance —
  plan the replay script before, not after.
- **Authorization is not transferable across instances:** the new instance's
  admin is set at init; you cannot "graft" the old instance's admin.
- **Events are immutable history:** consumers must tolerate both old and
  new contract IDs during the transition window (dual-source ingestion or a
  cutover flag).
- **Mitigation levers that do exist:** `pause(admin)` /
  `unpause(admin)` to halt mutations during an incident; admin-gated
  withdrawal (`withdraw`); and revocation/extension entry points for
  individual notifications. `CONTRACT_UPGRADE_GUIDE.md` §8 details the
  per-failure-mode rollback recommendations (stop rollout, preserve hashes,
  redeploy prior verified Wasm, post-deploy regression handling).

---

## 5. Practical upgrade example

Scenario: add a new field to the scheduled-notification payload
(`CURRENT_NOTIFICATION_VERSION` 1 → 2), keeping read compatibility.

### 5.1 Contract change

```rust
// src/base/types.rs
pub const CURRENT_NOTIFICATION_VERSION: u32 = 2;  // was 1

// Extend the struct additively; keep field order and types stable.
pub struct ScheduledNotification {
    // ...existing fields unchanged...
    pub priority: NotificationPriority,   // already present
    // new field must default for v1 data replayed by migration tooling
}
```

Also bump `VERSION` in `lib.rs` if contract behavior changed, and register
the new generation in the schema-version range if applicable:

```rust
// src/autoshare_logic.rs
const MIN_SUPPORTED_SCHEMA_VERSION: u32 = 1;  // keep old payloads readable
const MAX_SUPPORTED_SCHEMA_VERSION: u32 = 2;
```

### 5.2 Listener change (deploy first)

```typescript
// listener/src/utils/event-utils.ts
export const CURRENT_EVENT_VERSION = 2;
export const SUPPORTED_EVENT_VERSIONS = new Set([1, 2]);  // keep 1 decodable
```

```typescript
// listener/src/schema/contract-version-registry.ts — register the new
// contract version's expected event schema and let checkSchemaCompatibility
// verify only additive changes.
const registry = getContractVersionRegistry();
registry.register(2, v2SchemaSnapshot);
```

Historical fixtures (`listener/src/test-fixtures/historical-events.ts`)
plus `event-schema-compatibility.test.ts` guard the "old events still
decode" invariant.

### 5.3 Build, verify, deploy

```bash
cd contract/contracts/hello-world
cargo fmt --all && cargo test && stellar contract build
sha256sum target/wasm32v1-none/release/hello_world.wasm
stellar contract inspect --wasm target/wasm32v1-none/release/hello_world.wasm

# Deploy fresh (never assume in-place replacement)
make deploy-testnet     # or: make deploy-mainnet with the required env
# -> records contract id + wasm sha256 in deployment-manifest.json
```

### 5.4 Initialize and migrate

```bash
NEW_ID="<C… new contract id>"

# 1. Admin on the new instance (requires the deployer's auth)
stellar contract invoke --id $NEW_ID --network testnet \
  -- initialize_admin --admin <ADMIN_ADDRESS>

# 2. Restore configuration not auto-seeded
stellar contract invoke --id $NEW_ID --network testnet \
  -- add_supported_token --admin <ADMIN_ADDRESS> --token <TOKEN_ADDRESS>
stellar contract invoke --id $NEW_ID --network testnet \
  -- set_usage_fee --admin <ADMIN_ADDRESS> --fee 10

# 3. Stamp the schema generation
stellar contract invoke --id $NEW_ID --network testnet \
  -- set_schema_version --admin <ADMIN_ADDRESS> --version 2

# 4. Sanity checks
stellar contract invoke --id $NEW_ID --network testnet -- version
stellar contract invoke --id $NEW_ID --network testnet -- get_schema_version
```

Then replay state: script reads of `get_all_groups` and notifications from
the old contract ID and re-create them on `$NEW_ID` via the public entry
points. Update `CONTRACT_ADDRESSES` in the listener environment, restart,
and verify ingestion.

### 5.5 Event-schema change? (complementary path)

If instead of a redeploy your change is purely an **event schema** change,
you may not need a new deployment at all — emit both shapes during the
migration window, exactly as the runnable example does
(`examples/event-compatibility/reference-contract/src/lib.rs`:
`create_notification_mixed` emits v1 and v2 of the same event name; the
listener decoder at `examples/event-compatibility/listener-decoder/` falls
back latest → v1-default → reject). This avoids state migration entirely
when only the wire format changes.

---

## 6. Checklist recap

**Before:**
- [ ] Change classified; single concern per upgrade
- [ ] `cargo test` green; version markers bumped consistently
- [ ] Wasm sha256 recorded (reproducible build)
- [ ] State inventory exported from the live instance
- [ ] Admin/ownership path confirmed
- [ ] Listener updated to decode new versions first
- [ ] Testnet rehearsal completed

**During:**
- [ ] Fresh deployment with manifest recorded
- [ ] `initialize_admin` + config restore + `set_schema_version`
- [ ] State replayed and spot-checked
- [ ] Consumers re-pointed at the new contract ID

**After:**
- [ ] `version()` / `get_schema_version()` / `get_admin()` verified
- [ ] Listener ingesting new-contract events without errors
- [ ] Old Wasm + manifest archived for rollback
- [ ] Rollback playbook (pause, redeploy prior Wasm, replay) written down
