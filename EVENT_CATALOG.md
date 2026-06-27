# Smart Contract Event Catalog

This document serves as a centralized reference for all on-chain events emitted by the NotifyChain smart contracts. 

NotifyChain leverages these on-chain events to feed the off-chain listener, index events in SQLite, trigger real-time notifications (e.g. to Discord), and display logs on the frontend operator dashboard.

---

## 1. Core Design & Routing Concepts

NotifyChain contracts use a structured event design that allows off-chain services to quickly categorize and filter events without needing to parse the full event payload first.

### 1.1 Notification Category
Every event emitted by the [AutoShareContract](file:///workspaces/Notify-Chain/contract/contracts/hello-world/src/lib.rs#L22) carries a `NotificationCategory` as one of its indexed topics. This allows listeners to filter for whole categories of events.

The enum is defined in [events.rs](file:///workspaces/Notify-Chain/contract/contracts/hello-world/src/base/events.rs#L18):

| Variant | Value (U32) | Description |
| :--- | :--- | :--- |
| `Group` | `0` | AutoShare group lifecycle changes (creation, updates, active state toggles). |
| `Admin` | `1` | Administrative actions (pause/unpause, transferring admin, auth failures). |
| `Financial` | `2` | Movement of funds (withdrawing usage fees). |
| `Notification` | `3` | Scheduled notification operations (creation, expiration, cancellation, revocation). |

### 1.2 Notification Priority
Every event emitted by `AutoShareContract` also carries a `NotificationPriority` topic to help downstream routers filter or trigger alerts based on severity.

The enum is defined in [events.rs](file:///workspaces/Notify-Chain/contract/contracts/hello-world/src/base/events.rs#L46):

| Variant | Value (U32) | Description |
| :--- | :--- | :--- |
| `Low` | `0` | Informational: routine operations. No operator action required. |
| `Medium` | `1` | Standard: day-to-day operational events worth tracking. |
| `High` | `2` | Elevated: events operators should review promptly. |
| `Critical` | `3` | Urgent: security-relevant or funds-moving events demanding immediate attention (e.g., admin transfer). |

### 1.3 Backward Compatibility
To prevent breaking changes in downstream indexers, category and priority topics are appended as the **last two topics** of every event. Older indexers that only read the event name and primary identifiers will naturally ignore these trailing topics.

---

## 2. AutoShare Contract Events

These events are defined in [base/events.rs](file:///workspaces/Notify-Chain/contract/contracts/hello-world/src/base/events.rs) within the AutoShare contract.

In Soroban, CamelCase struct names compile to snake_case symbols by default (e.g., `AutoshareCreated` is emitted on-chain with the first topic `Symbol("autoshare_created")`).

---

### 2.1 `autoshare_created`
Emitted when a new AutoShare group is created.

- **Trigger Method**: [create](file:///workspaces/Notify-Chain/contract/contracts/hello-world/src/lib.rs#L63)
- **Topics**:
  1. `Symbol("autoshare_created")`
  2. `creator: Address` (Indexed creator of the group)
  3. `category: NotificationCategory` (Always `Group` / `0`)
  4. `priority: NotificationPriority` (Typically `Low` / `0`)
- **Data (Payload)**: `id: BytesN<32>` (The 32-byte group identifier)

---

### 2.2 `autoshare_updated`
Emitted when the members list of an AutoShare group is updated.

- **Trigger Method**: [update_members](file:///workspaces/Notify-Chain/contract/contracts/hello-world/src/lib.rs#L77)
- **Topics**:
  1. `Symbol("autoshare_updated")`
  2. `updater: Address` (Address that updated the members)
  3. `category: NotificationCategory` (Always `Group` / `0`)
  4. `priority: NotificationPriority` (Typically `Medium` / `1`)
- **Data (Payload)**: `id: BytesN<32>` (The group identifier)

---

### 2.3 `group_deactivated`
Emitted when an AutoShare group is deactivated by its creator.

- **Trigger Method**: [deactivate_group](file:///workspaces/Notify-Chain/contract/contracts/hello-world/src/lib.rs#L123)
- **Topics**:
  1. `Symbol("group_deactivated")`
  2. `creator: Address` (Creator performing deactivation)
  3. `category: NotificationCategory` (Always `Group` / `0`)
  4. `priority: NotificationPriority` (Typically `Medium` / `1`)
- **Data (Payload)**: `id: BytesN<32>` (The group identifier)

---

### 2.4 `group_activated`
Emitted when a deactivated group is reactivated.

- **Trigger Method**: [activate_group](file:///workspaces/Notify-Chain/contract/contracts/hello-world/src/lib.rs#L128)
- **Topics**:
  1. `Symbol("group_activated")`
  2. `creator: Address` (Creator performing reactivation)
  3. `category: NotificationCategory` (Always `Group` / `0`)
  4. `priority: NotificationPriority` (Typically `Medium` / `1`)
- **Data (Payload)**: `id: BytesN<32>` (The group identifier)

---

### 2.5 `contract_paused`
Emitted when the contract is paused by the administrator.

- **Trigger Method**: [pause](file:///workspaces/Notify-Chain/contract/contracts/hello-world/src/lib.rs#L43)
- **Topics**:
  1. `Symbol("contract_paused")`
  2. `category: NotificationCategory` (Always `Admin` / `1`)
  3. `priority: NotificationPriority` (Always `High` / `2`)
- **Data (Payload)**: None

---

### 2.6 `contract_unpaused`
Emitted when the contract is unpaused by the administrator.

- **Trigger Method**: [unpause](file:///workspaces/Notify-Chain/contract/contracts/hello-world/src/lib.rs#L48)
- **Topics**:
  1. `Symbol("contract_unpaused")`
  2. `category: NotificationCategory` (Always `Admin` / `1`)
  3. `priority: NotificationPriority` (Always `High` / `2`)
- **Data (Payload)**: None

---

### 2.7 `admin_transferred`
Emitted when admin privileges are transferred to a new account.

- **Trigger Method**: [transfer_admin](file:///workspaces/Notify-Chain/contract/contracts/hello-world/src/lib.rs#L143)
- **Topics**:
  1. `Symbol("admin_transferred")`
  2. `old_admin: Address` (Old admin address)
  3. `category: NotificationCategory` (Always `Admin` / `1`)
  4. `priority: NotificationPriority` (Always `Critical` / `3`)
- **Data (Payload)**: `new_admin: Address` (The new admin address)

---

### 2.8 `withdrawal`
Emitted when the admin withdraws collected usage fees from the contract.

- **Trigger Method**: [withdraw](file:///workspaces/Notify-Chain/contract/contracts/hello-world/src/lib.rs#L148)
- **Topics**:
  1. `Symbol("withdrawal")`
  2. `token: Address` (Token withdrawn)
  3. `recipient: Address` (Recipient address)
  4. `category: NotificationCategory` (Always `Financial` / `2`)
  5. `priority: NotificationPriority` (Always `High` / `2`)
- **Data (Payload)**: `amount: i128` (Amount withdrawn)

---

### 2.9 `authorization_failure`
Emitted when an unauthorized operation attempt is detected on-chain.

- **Topics**:
  1. `Symbol("authorization_failure")`
  2. `caller: Address` (The caller who failed authentication)
  3. `category: NotificationCategory` (Always `Admin` / `1`)
  4. `priority: NotificationPriority` (Always `Critical` / `3`)
- **Data (Payload)**: `action: String` (The action attempted)

---

### 2.10 `scheduled_notification_cancelled`
Emitted when a scheduled notification is cancelled on-chain.

- **Trigger Method**: [cancel_notification](file:///workspaces/Notify-Chain/contract/contracts/hello-world/src/lib.rs#L253)
- **Topics**:
  1. `Symbol("scheduled_notification_cancelled")`
  2. `caller: Address` (The user who triggered cancellation)
  3. `category: NotificationCategory` (Always `Notification` / `3`)
  4. `priority: NotificationPriority` (Always `Medium` / `1`)
- **Data (Payload)**: `notification_id: BytesN<32>` (ID of the cancelled notification)

---

### 2.11 `notification_scheduled`
Emitted when a notification is scheduled on-chain with a bounded lifetime.

- **Trigger Method**: [schedule_notification](file:///workspaces/Notify-Chain/contract/contracts/hello-world/src/lib.rs#L265)
- **Topics**:
  1. `Symbol("notification_scheduled")`
  2. `creator: Address` (The creator of the notification)
  3. `category: NotificationCategory` (Always `Notification` / `3`)
  4. `priority: NotificationPriority` (Always `Low` / `0`)
- **Data (Payload)**: `notification_id: BytesN<32>` (The 32-byte notification identifier)

---

### 2.12 `notification_expired`
Emitted when a scheduled notification's lifetime elapses, marking it expired.

- **Trigger Method**: [expire_notification](file:///workspaces/Notify-Chain/contract/contracts/hello-world/src/lib.rs#L289)
- **Topics**:
  1. `Symbol("notification_expired")`
  2. `notification_id: BytesN<32>` (ID of the expired notification)
  3. `category: NotificationCategory` (Always `Notification` / `3`)
  4. `priority: NotificationPriority` (Always `Low` / `0`)
- **Data (Payload)**: `expires_at: u64` (Unix timestamp when it expired)

---

### 2.13 `notification_revoked`
Emitted when a scheduled notification is revoked by its creator or admin.

- **Trigger Method**: [revoke_notification](file:///workspaces/Notify-Chain/contract/contracts/hello-world/src/lib.rs#L297)
- **Topics**:
  1. `Symbol("notification_revoked")`
  2. `notification_id: BytesN<32>` (ID of the revoked notification)
  3. `revoked_by: Address` (User who performed revocation)
  4. `category: NotificationCategory` (Always `Notification` / `3`)
  5. `priority: NotificationPriority` (Always `Medium` / `1`)
- **Data (Payload)**: `revoked_at: u64` (Unix timestamp when it was revoked)

---

## 3. TaskBounty Contract Events

These events are defined in [events.rs](file:///workspaces/Notify-Chain/Documents/Task%20Bounty/src/events.rs) within the TaskBounty contract. They do not use the category/priority helper wrapper but emit multi-topic symbols directly.

---

### 3.1 `task_created`
Emitted when a new task is created and reward tokens are escrowed in the contract.

- **Trigger Method**: [create_task](file:///workspaces/Notify-Chain/Documents/Task%20Bounty/src/lib.rs#L58)
- **Topics**:
  1. `Symbol("task")`
  2. `Symbol("created")`
- **Data (Payload)**:
  - `id: u64` (ID of the task)
  - `poster: Address` (Creator of the task)
  - `title: String` (Title of the task)
  - `reward: i128` (Reward amount escrowed)
  - `deadline: u64` (Unix timestamp for completion deadline)

---

### 3.2 `work_submitted`
Emitted when a contributor submits work for a task.

- **Trigger Method**: [submit_work](file:///workspaces/Notify-Chain/Documents/Task%20Bounty/src/lib.rs#L92)
- **Topics**:
  1. `Symbol("work")`
  2. `Symbol("submit")`
- **Data (Payload)**:
  - `task_id: u64`
  - `submission_id: u64` (Unique submission index)
  - `contributor: Address`
  - `work_url: String` (Link to work deliverables - IPFS/Github/etc.)

---

### 3.3 `submission_approved`
Emitted when the poster approves a work submission, releasing escrowed rewards.

- **Trigger Method**: [approve_submission](file:///workspaces/Notify-Chain/Documents/Task%20Bounty/src/lib.rs#L110)
- **Topics**:
  1. `Symbol("sub")`
  2. `Symbol("approved")`
- **Data (Payload)**:
  - `task_id: u64`
  - `submission_id: u64`
  - `contributor: Address` (Receiving party of the reward)
  - `reward: i128` (Amount transferred)

---

### 3.4 `submission_rejected`
Emitted when the poster rejects a submission.

- **Trigger Method**: [reject_submission](file:///workspaces/Notify-Chain/Documents/Task%20Bounty/src/lib.rs#L128)
- **Topics**:
  1. `Symbol("sub")`
  2. `Symbol("rejected")`
- **Data (Payload)**:
  - `task_id: u64`
  - `submission_id: u64`
  - `contributor: Address`

---

### 3.5 `task_cancelled`
Emitted when a task is cancelled and funds are refunded to the poster.

- **Trigger Method**: [cancel_task](file:///workspaces/Notify-Chain/Documents/Task%20Bounty/src/lib.rs#L145)
- **Topics**:
  1. `Symbol("task")`
  2. `Symbol("cancel")`
- **Data (Payload)**:
  - `task_id: u64`
  - `poster: Address` (Refunded account)

---

### 3.6 `dispute_raised`
Emitted when a poster or contributor raises a dispute over a work submission.

- **Trigger Method**: [raise_dispute](file:///workspaces/Notify-Chain/Documents/Task%20Bounty/src/lib.rs#L158)
- **Topics**:
  1. `Symbol("dispute")`
  2. `Symbol("raised")`
- **Data (Payload)**:
  - `task_id: u64`
  - `submission_id: u64`
  - `raiser: Address` (Party raising the dispute)
  - `reason: String` (Text description of the dispute reason)

---

## 4. Off-Chain Event Subscription & Parsing Example

Off-chain clients (like the listener) read raw event logs from the Stellar RPC and map them back to application objects. Below is a TypeScript example demonstrating how to read and categorize events using the Stellar SDK.

```typescript
import { xdr, Address, scValToNative } from '@stellar/stellar-sdk';

interface DecodedEvent {
  contractId: string;
  eventName: string;
  category?: string;
  priority?: string;
  data: any;
}

// Map value indices back to human-readable strings
const CATEGORIES = ['Group', 'Admin', 'Financial', 'Notification'];
const PRIORITIES = ['Low', 'Medium', 'High', 'Critical'];

function parseSorobanEvent(rawEvent: any): DecodedEvent {
  const topics = rawEvent.topic.map((t: string) => xdr.ScVal.fromXDR(t, 'base64'));
  const dataScVal = xdr.ScVal.fromXDR(rawEvent.value, 'base64');
  
  // Topic 0 is always the event name (symbol)
  const eventName = scValToNative(topics[0]).toString();
  
  const decoded: DecodedEvent = {
    contractId: rawEvent.contractId,
    eventName,
    data: scValToNative(dataScVal)
  };

  // If the contract is AutoShare, parse category and priority appended at the end
  if (topics.length >= 4) {
    const rawCategory = scValToNative(topics[topics.length - 2]);
    const rawPriority = scValToNative(topics[topics.length - 1]);
    
    decoded.category = CATEGORIES[rawCategory] || `Unknown (${rawCategory})`;
    decoded.priority = PRIORITIES[rawPriority] || `Unknown (${rawPriority})`;
  }

  return decoded;
}
```
