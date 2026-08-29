# AutoShare Contract API Reference

Complete reference for all entry points of the `AutoShareContract` Soroban smart contract.

**Source:** `contract/contracts/hello-world/src/lib.rs`  
**Network:** Stellar (Soroban). Swap `--network testnet` for `--network mainnet` in production.  
**Contract ID:** Set `CONTRACT_ID` to your deployed contract address.

---

## Table of Contents

1. [Data Types](#data-types)
2. [Error Codes](#error-codes)
3. [Admin Management](#admin-management)
4. [AutoShare Group Management](#autoshare-group-management)
5. [Token & Payment Configuration](#token--payment-configuration)
6. [Subscription & Usage](#subscription--usage)
7. [Scheduled Notifications](#scheduled-notifications)
8. [Notification Lifecycle Actions](#notification-lifecycle-actions)
9. [Batch Notifications](#batch-notifications)
10. [Recipient Preferences](#recipient-preferences)
11. [Audit Logging](#audit-logging)
12. [Sender Reputation](#sender-reputation)
13. [Notification Limits](#notification-limits)
14. [Schema Version](#schema-version)
15. [Access Logging](#access-logging)
16. [Contract Events](#contract-events)

---

## Data Types

### `AutoShareDetails`

```rust
{
  id: BytesN<32>,           // 32-byte group identifier
  name: String,             // Human-readable group name
  creator: Address,         // Creator wallet address
  priority: NotificationPriority,
  usage_count: u32,         // Remaining usages
  total_usages_paid: u32,   // Lifetime usages purchased
  members: Vec<GroupMember>,
  is_active: bool
}
```

### `GroupMember`

```rust
{ address: Address, percentage: u32 }  // percentages must sum to 100
```

### `ScheduledNotification`

```rust
{
  id: BytesN<32>,
  creator: Address,
  created_at: u64,           // Ledger timestamp (seconds)
  expires_at: u64,           // Expiry ledger timestamp (seconds)
  revoked_by: Option<Address>,
  revoked_at: Option<u64>,
  delivered: bool,
  delivered_at: Option<u64>,
  recalled_by: Option<Address>,
  recalled_at: Option<u64>,
  title: String
}
```

### `PaymentHistory`

```rust
{ user: Address, group_id: BytesN<32>, usages_purchased: u32, amount_paid: i128, timestamp: u64 }
```

### `AuditRecord`

```rust
{ seq: u64, notification_id: BytesN<32>, action: AuditAction, actor: Address, timestamp: u64 }
```

### `NotificationLimits`

```rust
{ max_payload_size: u32, max_expiration_seconds: u64, min_expiration_seconds: u64, max_batch_size: u32 }
```

### `RecipientPreferences`

```rust
{ recipient: Address, channels: Vec<ChannelPreference>, categories: Vec<CategoryPreference>, updated_at: u64 }
```

### Enums

**`NotificationCategory`** — `Group=0, Admin=1, Financial=2, Notification=3`

**`NotificationPriority`** — `Low=0, Medium=1, High=2, Critical=3`

**`DeliveryChannel`** — `Wallet, Email, InApp`

**`NotificationCategory` (preferences)** — `Payment, GroupMembership, GroupStatus, SystemAlerts, General`

**`AuditAction`** — `Created=0, DeliveryAttempt=1, DeliveryFailed=2, Acknowledged=3, Cancelled=4, Expired=5`

---

## Error Codes

| Code | Name                      | Description                                                    |
|------|---------------------------|----------------------------------------------------------------|
| 1    | InvalidInput              | Supplied parameter is invalid                                  |
| 2    | AlreadyExists             | Entity already exists                                          |
| 3    | NotFound                  | Entity not found in storage                                    |
| 4    | UnsupportedToken          | Payment token is not on the supported list                     |
| 5    | InsufficientPayment       | Provided payment is below the required amount                  |
| 6    | NoUsagesRemaining         | Group has exhausted all purchased usages                       |
| 7    | InvalidUsageCount         | Usage count is zero or otherwise invalid                       |
| 8    | Unauthorized              | Caller is not authorised for this action                       |
| 9    | InsufficientBalance       | Caller's token balance is too low                              |
| 10   | InvalidAmount             | Specified amount is invalid                                    |
| 11   | ContractPaused            | Action is rejected while the contract is paused                |
| 12   | AlreadyPaused             | Contract is already paused                                     |
| 13   | NotPaused                 | Contract is not paused                                         |
| 14   | InvalidTotalPercentage    | Member percentages do not sum to 100                           |
| 15   | EmptyMembers              | Member list is empty                                           |
| 16   | DuplicateMember           | Member list contains duplicate addresses                       |
| 17   | GroupInactive             | Target group is deactivated                                    |
| 18   | GroupAlreadyActive        | Group is already active                                        |
| 19   | GroupAlreadyInactive      | Group is already inactive                                      |
| 20   | InsufficientContractBalance | Contract balance is too low for the requested withdrawal     |
| 21   | NameTooLong               | Name string exceeds the maximum allowed length                 |
| 22   | TooManyMembers            | Member list exceeds the maximum allowed size                   |
| 23   | NotificationExpired       | Notification has already expired                               |
| 24   | InvalidExpirationDuration | Expiration duration is zero or would overflow the ledger clock |
| 25   | NotificationNotExpired    | Notification lifetime has not yet elapsed                      |
| 26   | BatchTooLarge             | Batch exceeds `max_batch_size` limit                           |
| 27   | NotificationRevoked       | Notification has been revoked                                  |
| 28   | NotAuthorizedToRevoke     | Caller is not authorised to revoke this notification           |
| 30   | NotificationDelivered     | Notification is already delivered and cannot be recalled       |

---

## Admin Management

### `version`

Returns the current contract version number.

**Parameters:** none  
**Returns:** `u32`

```bash
stellar contract invoke --id $CONTRACT_ID --network testnet -- version
```

---

### `initialize_admin`

Initialises the contract admin. Can only be called once. Subsequent calls are rejected.

**Parameters**

| Name  | Type    | Description            |
|-------|---------|------------------------|
| admin | Address | Initial admin address  |

```bash
stellar contract invoke --id $CONTRACT_ID --source admin-key --network testnet \
  -- initialize_admin --admin GADMIN...
```

---

### `pause` / `unpause`

Pauses or unpauses the contract. Only the current admin can call these. Most state-changing operations are rejected while the contract is paused.

**Parameters**

| Name  | Type    | Description                     |
|-------|---------|----------------------------------|
| admin | Address | Must match the stored admin address |

```bash
stellar contract invoke --id $CONTRACT_ID --source admin-key --network testnet -- pause --admin GADMIN...
stellar contract invoke --id $CONTRACT_ID --source admin-key --network testnet -- unpause --admin GADMIN...
```

**Errors:** `Unauthorized`, `AlreadyPaused` / `NotPaused`

---

### `get_paused_status`

Returns `true` if the contract is currently paused.

**Returns:** `bool`

```bash
stellar contract invoke --id $CONTRACT_ID --network testnet -- get_paused_status
```

---

### `get_admin`

Returns the current admin address.

**Returns:** `Address`

---

### `transfer_admin`

Transfers admin rights to a new address. Only the current admin can call this. Emits `AdminTransferred`.

**Parameters**

| Name          | Type    | Description              |
|---------------|---------|--------------------------|
| current_admin | Address | Existing admin (must auth) |
| new_admin     | Address | New admin address        |

**Errors:** `Unauthorized`

---

### `withdraw`

Withdraws tokens collected as usage fees. Only admin can call. Emits `Withdrawal`.

**Parameters**

| Name      | Type    | Description                   |
|-----------|---------|-------------------------------|
| admin     | Address | Must match stored admin       |
| token     | Address | Token contract to withdraw    |
| amount    | i128    | Amount to transfer            |
| recipient | Address | Destination address           |

**Errors:** `Unauthorized`, `InsufficientContractBalance`

---

### `get_contract_balance`

Returns the contract's current balance for a given token.

**Parameters**

| Name  | Type    |
|-------|---------|
| token | Address |

**Returns:** `i128`

---

### `register_category` / `get_registered_categories` / `is_category_registered`

Manages the on-chain notification category registry. Only admin can register categories.

**`register_category` parameters**

| Name     | Type                 |
|----------|----------------------|
| admin    | Address              |
| category | NotificationCategory |

---

## AutoShare Group Management

### `create`

Creates a new AutoShare group, stores it on-chain, and debits `usage_count × usage_fee` tokens from the creator's wallet. Emits `AutoshareCreated`.

**Parameters**

| Name          | Type        | Description                                  |
|---------------|-------------|----------------------------------------------|
| id            | BytesN<32>  | Unique 32-byte group identifier              |
| name          | String      | Human-readable group name (max 64 chars)     |
| creator       | Address     | Creator wallet address (must auth)           |
| usage_count   | u32         | Number of usages to pre-purchase (> 0)       |
| payment_token | Address     | Token contract used for payment              |

**Errors:** `AlreadyExists`, `UnsupportedToken`, `InvalidUsageCount`, `InsufficientBalance`, `ContractPaused`

**Stellar CLI**

```bash
stellar contract invoke --id $CONTRACT_ID --source creator-key --network testnet \
  -- create \
  --id 0000000000000000000000000000000000000000000000000000000000000001 \
  --name "Engineering Fund" \
  --creator GABC1234...XYZ \
  --usage_count 100 \
  --payment_token CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC
```

**TypeScript SDK**

```typescript
import { Contract, SorobanRpc, TransactionBuilder, Networks, BASE_FEE, nativeToScVal, xdr } from "@stellar/stellar-sdk";

const server = new SorobanRpc.Server("https://soroban-testnet.stellar.org");
const contract = new Contract(CONTRACT_ID);

const groupId = Buffer.alloc(32, 0);
groupId[31] = 1;

const tx = new TransactionBuilder(creatorAccount, { fee: BASE_FEE, networkPassphrase: Networks.TESTNET })
  .addOperation(contract.call(
    "create",
    xdr.ScVal.scvBytes(groupId),
    nativeToScVal("Engineering Fund"),
    nativeToScVal(creatorAddress, { type: "address" }),
    nativeToScVal(100, { type: "u32" }),
    nativeToScVal(tokenAddress, { type: "address" }),
  ))
  .setTimeout(30).build();
```

---

### `get`

Retrieves a group by ID.

**Parameters:** `id: BytesN<32>`  
**Returns:** `AutoShareDetails`  
**Errors:** `NotFound`

---

### `get_all_groups`

Returns all AutoShare groups stored on-chain.

**Returns:** `Vec<AutoShareDetails>`

---

### `get_groups_by_creator`

Returns all groups created by a specific address.

**Parameters:** `creator: Address`  
**Returns:** `Vec<AutoShareDetails>`

---

### `update_members`

Replaces the full member list for a group. Caller must be the group creator. All percentages must sum to exactly 100. Emits `AutoshareUpdated`.

**Parameters**

| Name        | Type               | Description                       |
|-------------|--------------------|------------------------------------|
| id          | BytesN<32>         | Group identifier                  |
| caller      | Address            | Must be group creator             |
| new_members | Vec<GroupMember>   | New member list (% must sum to 100) |

**Errors:** `NotFound`, `Unauthorized`, `InvalidTotalPercentage`, `EmptyMembers`, `DuplicateMember`, `TooManyMembers`

---

### `add_group_member`

Adds a single member to an existing group. Caller must be the group creator.

**Parameters**

| Name       | Type       | Description                     |
|------------|------------|---------------------------------|
| id         | BytesN<32> | Group identifier                |
| caller     | Address    | Must be group creator           |
| address    | Address    | New member address              |
| percentage | u32        | Member's share (%)              |

**Errors:** `NotFound`, `Unauthorized`, `DuplicateMember`, `TooManyMembers`

---

### `get_group_members`

Returns the current member list for a group.

**Parameters:** `id: BytesN<32>`  
**Returns:** `Vec<GroupMember>`

---

### `is_group_member`

Returns `true` if `address` is a member of the group.

**Parameters:** `id: BytesN<32>`, `address: Address`  
**Returns:** `bool`

---

### `deactivate_group` / `activate_group`

Deactivates or reactivates a group. Only the creator can call these. Emits `GroupDeactivated` / `GroupActivated`.

**Parameters**

| Name   | Type       | Description                   |
|--------|------------|-------------------------------|
| id     | BytesN<32> | Group identifier              |
| caller | Address    | Must be group creator         |

**Errors:** `NotFound`, `Unauthorized`, `GroupAlreadyInactive` / `GroupAlreadyActive`

```bash
# Deactivate
stellar contract invoke --id $CONTRACT_ID --source creator-key --network testnet \
  -- deactivate_group \
  --id 0000000000000000000000000000000000000000000000000000000000000001 \
  --caller GABC1234...XYZ

# Reactivate
stellar contract invoke --id $CONTRACT_ID --source creator-key --network testnet \
  -- activate_group \
  --id 0000000000000000000000000000000000000000000000000000000000000001 \
  --caller GABC1234...XYZ
```

---

### `is_group_active`

Returns `true` if the group is currently active.

**Parameters:** `id: BytesN<32>`  
**Returns:** `bool`

---

## Token & Payment Configuration

### `add_supported_token` / `remove_supported_token`

Adds or removes a token from the list of accepted payment tokens. Admin only.

**Parameters:** `token: Address`, `admin: Address`  
**Errors:** `Unauthorized`

---

### `get_supported_tokens`

Returns all supported payment token addresses.

**Returns:** `Vec<Address>`

---

### `is_token_supported`

Returns `true` if a token is on the supported list.

**Parameters:** `token: Address`  
**Returns:** `bool`

---

### `set_usage_fee`

Sets the per-usage fee charged when creating or topping up a group. Admin only.

**Parameters:** `fee: u32`, `admin: Address`  
**Errors:** `Unauthorized`

---

### `get_usage_fee`

Returns the current usage fee.

**Returns:** `u32`

---

## Subscription & Usage

### `topup_subscription`

Purchases additional usages for an existing group. Emits no dedicated event but appends a `PaymentHistory` record.

**Parameters**

| Name               | Type       | Description                          |
|--------------------|------------|--------------------------------------|
| id                 | BytesN<32> | Group identifier                     |
| additional_usages  | u32        | Number of usages to add (> 0)        |
| payment_token      | Address    | Token used for payment               |
| payer              | Address    | Address authorising the payment      |

**Errors:** `NotFound`, `GroupInactive`, `UnsupportedToken`, `InvalidUsageCount`, `InsufficientBalance`

```bash
stellar contract invoke --id $CONTRACT_ID --source payer-key --network testnet \
  -- topup_subscription \
  --id 0000000000000000000000000000000000000000000000000000000000000001 \
  --additional_usages 50 \
  --payment_token CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC \
  --payer GABC1234...XYZ
```

---

### `reduce_usage`

Decrements the group's remaining usage count by 1. Callable by any group member.

**Parameters:** `id: BytesN<32>`, `caller: Address`  
**Errors:** `NotFound`, `Unauthorized`, `NoUsagesRemaining`, `GroupInactive`

---

### `get_remaining_usages`

Returns remaining usages for a group.

**Parameters:** `id: BytesN<32>`  
**Returns:** `u32`

---

### `get_total_usages_paid`

Returns the total lifetime usages purchased for a group.

**Parameters:** `id: BytesN<32>`  
**Returns:** `u32`

---

### `get_user_payment_history`

Returns all payment records for a user across all groups.

**Parameters:** `user: Address`  
**Returns:** `Vec<PaymentHistory>`

---

### `get_group_payment_history`

Returns all payment records for a specific group.

**Parameters:** `id: BytesN<32>`  
**Returns:** `Vec<PaymentHistory>`

---

## Scheduled Notifications

### `schedule_notification`

Schedules a notification on-chain with a time-to-live. The notification becomes expired once the ledger timestamp reaches `created_at + ttl_seconds`. Emits `NotificationScheduled`.

**Parameters**

| Name            | Type       | Description                                           |
|-----------------|------------|-------------------------------------------------------|
| notification_id | BytesN<32> | Unique 32-byte notification identifier                |
| creator         | Address    | Creator address (must auth)                           |
| ttl_seconds     | u64        | Lifetime in seconds (must be within configured limits) |
| title           | String     | Notification title (validated metadata)               |

**Errors:** `AlreadyExists`, `InvalidExpirationDuration`, `ContractPaused`

```bash
stellar contract invoke --id $CONTRACT_ID --source creator-key --network testnet \
  -- schedule_notification \
  --notification_id 0000000000000000000000000000000000000000000000000000000000000002 \
  --creator GABC1234...XYZ \
  --ttl_seconds 3600 \
  --title "Task Completed"
```

**TypeScript SDK**

```typescript
const notifId = Buffer.alloc(32, 0);
notifId[31] = 2;

const tx = new TransactionBuilder(creatorAccount, { fee: BASE_FEE, networkPassphrase: Networks.TESTNET })
  .addOperation(contract.call(
    "schedule_notification",
    xdr.ScVal.scvBytes(notifId),
    nativeToScVal(creatorAddress, { type: "address" }),
    nativeToScVal(3600n, { type: "u64" }),
    nativeToScVal("Task Completed"),
  ))
  .setTimeout(30).build();
```

---

### `get_notification`

Returns the stored details for a scheduled notification.

**Parameters:** `notification_id: BytesN<32>`  
**Returns:** `ScheduledNotification`  
**Errors:** `NotFound`

---

### `is_notification_expired`

Returns `true` if the notification's lifetime has elapsed.

**Parameters:** `notification_id: BytesN<32>`  
**Returns:** `bool`

---

### `expire_notification`

Finalises expiry for a notification whose lifetime has elapsed. Callable by anyone. Emits `NotificationExpired`.

**Parameters:** `notification_id: BytesN<32>`  
**Errors:** `NotFound`, `NotificationNotExpired`, `NotificationRevoked`

---

## Notification Lifecycle Actions

### `revoke_notification`

Revokes a notification, preventing any further interaction. Only the creator or contract admin can call this. Emits `NotificationRevoked`.

**Parameters**

| Name            | Type       | Description                               |
|-----------------|------------|-------------------------------------------|
| notification_id | BytesN<32> | Target notification ID                    |
| caller          | Address    | Must be creator or admin                  |

**Errors:** `NotFound`, `NotAuthorizedToRevoke`, `AlreadyRevoked`, `NotificationExpired`

---

### `is_notification_revoked`

Returns `true` if the notification has been revoked.

**Parameters:** `notification_id: BytesN<32>`  
**Returns:** `bool`

---

### `cancel_notification`

Cancels a scheduled notification. Emits `ScheduledNotificationCancelled`.

**Parameters:** `notification_id: BytesN<32>`, `caller: Address`  
**Errors:** `NotFound`, `Unauthorized`, `ContractPaused`

---

### `recall_notification`

Recalls a notification before delivery confirmation. Only the creator or admin can recall. Emits `NotificationRecalled`.

**Parameters:** `notification_id: BytesN<32>`, `caller: Address`  
**Errors:** `NotFound`, `Unauthorized`, `NotificationDelivered`, `NotificationRevoked`, `NotificationExpired`

---

### `confirm_notification_delivery`

Marks a notification as delivered. Only the creator or admin can confirm. Emits `NotificationDelivered`.

**Parameters:** `notification_id: BytesN<32>`, `caller: Address`  
**Errors:** `NotFound`, `Unauthorized`, `NotificationRevoked`, `NotificationExpired`

---

### `extend_notification_expiry`

Extends the expiry of an active notification by `extension_seconds`. Only the creator or admin can extend. Emits `NotificationExtended`.

**Parameters**

| Name               | Type       | Description                        |
|--------------------|------------|------------------------------------|
| notification_id    | BytesN<32> | Target notification ID             |
| caller             | Address    | Must be creator or admin           |
| extension_seconds  | u64        | Seconds to add to current `expires_at` |

**Errors:** `NotFound`, `Unauthorized`, `NotificationRevoked`, `NotificationExpired`

---

### `acknowledge_notifications`

Batch-acknowledges multiple notifications in a single transaction. Emits `NotificationAcknowledged` for each.

**Parameters**

| Name             | Type             | Description                           |
|------------------|------------------|---------------------------------------|
| caller           | Address          | Acknowledging address (must auth)     |
| notification_ids | Vec<BytesN<32>>  | List of notification IDs to acknowledge |

**Errors:** `NotFound`, `Unauthorized` per notification

---

## Batch Notifications

### `batch_schedule_notifications`

Creates up to `max_batch_size` (default 50) notifications in a single transaction. All three vectors (`ids`, `ttl_seconds`, `titles`) must have the same length. Emits one `NotificationScheduled` event per notification, plus a single `BatchNotificationsCreated` summary event.

**Parameters**

| Name        | Type            | Description                                     |
|-------------|-----------------|--------------------------------------------------|
| ids         | Vec<BytesN<32>> | Unique IDs for each notification                |
| creator     | Address         | Creator address (must auth)                     |
| ttl_seconds | Vec<u64>        | TTL in seconds for each notification (parallel) |
| titles      | Vec<String>     | Titles for each notification (parallel)         |

**Errors:** `BatchTooLarge`, `AlreadyExists`, `InvalidExpirationDuration`, `ContractPaused`

```bash
# Example: create 2 notifications in one call
stellar contract invoke --id $CONTRACT_ID --source creator-key --network testnet \
  -- batch_schedule_notifications \
  --ids '["0000...0001","0000...0002"]' \
  --creator GABC1234...XYZ \
  --ttl_seconds '[3600,7200]' \
  --titles '["Notification A","Notification B"]'
```

---

### `emit_batch_completed`

Signals to off-chain listeners that a batch of notifications has finished processing. Emits `BatchProcessingCompleted`.

**Parameters:** `batch_id: BytesN<32>`, `processed_count: u32`

---

## Recipient Preferences

Preferences are stored per-recipient on-chain. All write methods require the caller to authenticate as `recipient`. Reads default to all-enabled if no preferences have been set.

### `get_preferences`

Returns the full preference set for a recipient.

**Parameters:** `recipient: Address`  
**Returns:** `RecipientPreferences`

```bash
stellar contract invoke --id $CONTRACT_ID --network testnet \
  -- get_preferences --recipient GABC1234...XYZ
```

---

### `set_preferences`

Atomically replaces all channel and category preferences.

**Parameters**

| Name       | Type                     | Description                        |
|------------|--------------------------|------------------------------------|
| recipient  | Address                  | Must auth                          |
| channels   | Vec<ChannelPreference>   | Full list of channel preferences   |
| categories | Vec<CategoryPreference>  | Full list of category preferences  |

**Example `channels` value:**
```json
[
  { "channel": "Wallet", "enabled": true },
  { "channel": "Email",  "enabled": false },
  { "channel": "InApp",  "enabled": true }
]
```

**Example `categories` value:**
```json
[
  { "category": "Payment",         "enabled": true },
  { "category": "GroupMembership", "enabled": true },
  { "category": "GroupStatus",     "enabled": false },
  { "category": "SystemAlerts",    "enabled": true },
  { "category": "General",         "enabled": true }
]
```

---

### `set_channel_preference`

Toggles a single delivery channel.

**Parameters:** `recipient: Address`, `channel: DeliveryChannel`, `enabled: bool`

```bash
stellar contract invoke --id $CONTRACT_ID --source recipient-key --network testnet \
  -- set_channel_preference \
  --recipient GABC1234...XYZ \
  --channel Email \
  --enabled false
```

---

### `set_category_preference`

Toggles a single notification category.

**Parameters:** `recipient: Address`, `category: NotificationCategory`, `enabled: bool`

---

### `reset_preferences`

Resets all preferences to the all-enabled defaults.

**Parameters:** `recipient: Address` (must auth)

---

### `is_channel_enabled`

Returns `true` if the given delivery channel is enabled for a recipient.

**Parameters:** `recipient: Address`, `channel: DeliveryChannel`  
**Returns:** `bool`

---

### `is_category_enabled`

Returns `true` if the given notification category is enabled for a recipient.

**Parameters:** `recipient: Address`, `category: NotificationCategory`  
**Returns:** `bool`

---

## Audit Logging

### `get_audit_log`

Returns the complete immutable audit log in append order.

**Returns:** `Vec<AuditRecord>`

---

### `get_notification_audit`

Returns all audit records for a specific notification.

**Parameters:** `notification_id: BytesN<32>`  
**Returns:** `Vec<AuditRecord>`

---

### `record_delivery_attempt`

Records a delivery attempt for a notification in the audit log. Emits `AuditRecordAppended`.

**Parameters:** `notification_id: BytesN<32>`, `actor: Address`

---

### `record_delivery_failure`

Records a delivery failure in the audit log. Emits `AuditRecordAppended`.

**Parameters:** `notification_id: BytesN<32>`, `actor: Address`

---

### `record_acknowledgment`

Records that the recipient acknowledged a notification. Emits `AuditRecordAppended`.

**Parameters:** `notification_id: BytesN<32>`, `actor: Address`

---

## Sender Reputation

Reputation scores range from 0 (lowest) to 100 (highest) and are updated automatically by delivery outcomes.

### Reputation Tiers

| Tier | Value | Name        |
|------|-------|-------------|
| 0    | —     | Unverified  |
| 1    | —     | Bronze      |
| 2    | —     | Silver      |
| 3    | —     | Gold        |
| 4    | —     | Platinum    |

---

### `record_delivery_success`

Records a successful delivery for a sender. Updates reputation score. Emits `ReputationUpdated`.

**Parameters:** `sender: Address`

---

### `record_delivery_failure`

Records a failed delivery for a sender. Decrements reputation score. Emits `ReputationUpdated`.

**Parameters:** `sender: Address`

---

### `get_sender_reputation_score`

Returns the reputation score (0–100) for a sender. Returns 50 if no history exists.

**Parameters:** `sender: Address`  
**Returns:** `i64`

---

### `get_sender_reputation`

Returns the full reputation record including counts and current score.

**Parameters:** `sender: Address`  
**Returns:** `SenderReputation`

---

### `get_sender_reputation_tier`

Returns the numeric reputation tier (0–4).

**Parameters:** `sender: Address`  
**Returns:** `u32`

---

## Notification Limits

### `configure_notification_limits`

Sets protocol-level limits on notification payloads and batch sizes. Admin only. Emits `NotificationLimitsConfigured`.

**Parameters**

| Name                   | Type | Description                                       |
|------------------------|------|---------------------------------------------------|
| admin                  | Address | Must be current admin                          |
| max_payload_size       | u32  | Maximum notification payload size in bytes        |
| max_expiration_seconds | u64  | Maximum allowed `ttl_seconds` value               |
| min_expiration_seconds | u64  | Minimum allowed `ttl_seconds` value               |
| max_batch_size         | u32  | Maximum notifications per `batch_schedule_notifications` call |

**Errors:** `Unauthorized`, `InvalidLimit`

```bash
stellar contract invoke --id $CONTRACT_ID --source admin-key --network testnet \
  -- configure_notification_limits \
  --admin GADMIN... \
  --max_payload_size 4096 \
  --max_expiration_seconds 2592000 \
  --min_expiration_seconds 60 \
  --max_batch_size 50
```

---

### `get_notification_limits`

Returns the current notification limits configuration.

**Returns:** `NotificationLimits`

---

## Schema Version

### `set_schema_version`

Sets the on-chain notification schema version. Admin only. Rejects versions outside the supported range. Emits `SchemaVersionSet`.

**Parameters:** `admin: Address`, `schema_version: u32`  
**Errors:** `Unauthorized`, `InvalidInput`

---

### `get_schema_version`

Returns the current schema version (0 if never set).

**Returns:** `u32`

---

### `is_version_supported`

Returns `true` if the given version is within the supported range.

**Parameters:** `version: u32`  
**Returns:** `bool`

---

## Access Logging

### `record_notification_access`

Emits a `NotificationAccessed` event whenever a protected notification record is read. Use this to build an immutable access trail for compliance.

**Parameters:** `notification_id: BytesN<32>`, `accessor: Address`

---

## Contract Events

Every event emitted by `AutoShareContract` carries `category: NotificationCategory` and `priority: NotificationPriority` as the last two indexed topics. Existing listeners that only read the event name are unaffected — the trailing topics are ignored if not consumed.

### Event Reference

| Event symbol                       | Additional topics                              | Data payload                              | Category     | Priority |
|------------------------------------|------------------------------------------------|-------------------------------------------|--------------|----------|
| `autoshare_created`                | `creator`                                      | `id: BytesN<32>`                          | Group (0)    | Low (0)  |
| `autoshare_updated`                | `updater`                                      | `id: BytesN<32>`                          | Group (0)    | Medium (1) |
| `group_deactivated`                | `creator`                                      | `id: BytesN<32>`                          | Group (0)    | Medium (1) |
| `group_activated`                  | `creator`                                      | `id: BytesN<32>`                          | Group (0)    | Medium (1) |
| `contract_paused`                  | `admin`                                        | —                                         | Admin (1)    | High (2)  |
| `contract_unpaused`                | `admin`                                        | —                                         | Admin (1)    | High (2)  |
| `admin_transferred`                | `old_admin`                                    | `new_admin: Address`                      | Admin (1)    | Critical (3) |
| `withdrawal`                       | `token`, `recipient`                           | `amount: i128`                            | Financial (2) | High (2) |
| `authorization_failure`            | `caller`                                       | `action: String`                          | Admin (1)    | Critical (3) |
| `category_registered`              | `admin`                                        | —                                         | Admin (1)    | Low (0)  |
| `notification_scheduled`           | `creator`                                      | `notification_id: BytesN<32>`             | Notification (3) | Low (0) |
| `notification_expired`             | `notification_id`                              | `expires_at: u64`                         | Notification (3) | Low (0) |
| `notification_revoked`             | `notification_id`, `revoked_by`                | — (derivable from ledger)                 | Notification (3) | Medium (1) |
| `scheduled_notification_cancelled` | `caller`                                      | `notification_id: BytesN<32>`             | Notification (3) | Medium (1) |
| `notification_delivered`           | `notification_id`, `delivered_by`              | `delivered_at: u64`                       | Notification (3) | Medium (1) |
| `notification_recalled`            | `notification_id`, `recalled_by`               | `recalled_at: u64`                        | Notification (3) | Medium (1) |
| `notification_extended`            | `notification_id`, `caller`                    | `new_expires_at: u64`                     | Notification (3) | Low (0)  |
| `notification_acknowledged`        | `notification_id`, `acknowledger`              | `timestamp: u64`                          | Notification (3) | Low (0)  |
| `notification_accessed`            | `notification_id`, `accessor`                  | `accessed_at: u64`                        | Notification (3) | Low (0)  |
| `batch_notifications_created`      | `creator`                                      | `count: u32`, `ids: Vec<BytesN<32>>`      | Notification (3) | Low (0)  |
| `batch_processing_completed`       | `batch_id`                                     | `processed_count: u32`                    | Notification (3) | Low (0)  |
| `audit_record_appended`            | `notification_id`, `action: AuditAction`       | `seq: u64`, `actor: Address`              | Notification (3) | Low (0)  |
| `reputation_updated`               | `sender`                                       | `new_score: i64`, `successful_count: u32`, `failed_count: u32` | Admin (1) | Low (0) |
| `reputation_tier_changed`          | `sender`                                       | `old_tier: u32`, `new_tier: u32`, `reputation_score: i64` | Admin (1) | Medium (1) |
| `notification_limits_configured`   | `admin`                                        | `max_payload_size`, `max_expiration_seconds`, `min_expiration_seconds`, `max_batch_size` | Admin (1) | Medium (1) |
| `schema_version_set`               | `admin`                                        | `schema_version: u32`, `previous_version: u32` | Admin (1) | Medium (1) |

### Parsing Events Off-Chain

```typescript
import { xdr, scValToNative } from "@stellar/stellar-sdk";

const CATEGORIES = ["Group", "Admin", "Financial", "Notification"];
const PRIORITIES = ["Low", "Medium", "High", "Critical"];

function parseSorobanEvent(rawEvent: any) {
  const topics = rawEvent.topic.map((t: string) => xdr.ScVal.fromXDR(t, "base64"));
  const data = scValToNative(xdr.ScVal.fromXDR(rawEvent.value, "base64"));

  const eventName = scValToNative(topics[0]).toString();

  // AutoShare events append category + priority as the last two topics
  let category: string | undefined;
  let priority: string | undefined;
  if (topics.length >= 3) {
    const rawCategory = scValToNative(topics[topics.length - 2]);
    const rawPriority = scValToNative(topics[topics.length - 1]);
    category = CATEGORIES[rawCategory];
    priority = PRIORITIES[rawPriority];
  }

  return { contractId: rawEvent.contractId, eventName, category, priority, data };
}
```

---

*For the complete listener REST API reference, see [../listener/API.md](../listener/API.md).*  
*For on-chain event catalog with full topic lists, see [../EVENT_CATALOG.md](../EVENT_CATALOG.md).*
