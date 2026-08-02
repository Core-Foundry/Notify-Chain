# NotifyChain Event Payload Examples

This document provides realistic sample payloads for every event emitted by the NotifyChain smart contracts (issue #428). Each example shows decoded `topics` and `data` fields as they would appear after an off-chain listener parses the raw XDR from the Stellar RPC. Use these examples to validate your listener's parsing logic, write integration tests, or understand the event structure before implementing a consumer.

For the authoritative field-level specification (types, indexing, shared enums), see [CONTRACT_EVENT_REFERENCE.md](CONTRACT_EVENT_REFERENCE.md).

---

## Table of Contents

1. [AutoShare Contract Events](#autoshare-contract-events)
   - [AutoshareCreated](#autosharecreated)
   - [AutoshareUpdated](#autoshareupdated)
   - [GroupDeactivated](#groupdeactivated)
   - [GroupActivated](#groupactivated)
   - [ContractPaused](#contractpaused)
   - [ContractUnpaused](#contractunpaused)
   - [AdminTransferred](#admintransferred)
   - [Withdrawal](#withdrawal)
   - [AuthorizationFailure](#authorizationfailure)
   - [CategoryRegistered](#categoryregistered)
2. [Notification Lifecycle Events](#notification-lifecycle-events)
   - [NotificationScheduled](#notificationscheduled)
   - [NotificationExpired](#notificationexpired)
   - [ScheduledNotificationCancelled](#schedulednotificationcancelled)
   - [NotificationRevoked](#notificationrevoked)
   - [NotificationExtended](#notificationextended)
   - [BatchNotificationsCreated](#batchnotificationscreated)
   - [BatchProcessingCompleted](#batchprocessingcompleted)
3. [Audit Log Events](#audit-log-events)
   - [AuditRecordAppended](#auditrecordappended)
4. [Access Log Events](#access-log-events)
   - [NotificationAccessed](#notificationaccessed)
5. [Schema Version Events](#schema-version-events)
   - [SchemaVersionSet](#schemaversionset)
6. [Reputation Events](#reputation-events)
   - [ReputationUpdated](#reputationupdated)
   - [ReputationTierChanged](#reputationtierchanged)
   - [NotificationLimitsConfigured](#notificationlimitsconfigured)
7. [TaskBounty Contract Events](#taskbounty-contract-events)
   - [TaskCreated](#taskcreated)
   - [WorkSubmitted](#worksubmitted)
   - [SubmissionApproved](#submissionapproved)
   - [SubmissionRejected](#submissionrejected)
   - [TaskCancelled](#taskcancelled)
   - [DisputeRaised](#disputeraised)

---

## AutoShare Contract Events

Topics layout for AutoShare events: `[event_name, primary_key(s)..., category (u32), priority (u32)]`. Data carries the remaining fields.

### AutoshareCreated

Fires when a new AutoShare group is successfully created on-chain.

```json
{
  "topics": ["AutoshareCreated", "GBVZR3XKFV6KCXOQQKTQJVQPXJRP3KZMZBXHTF4XLVKXMFKZPZXDTUA", 0, 0],
  "data": {
    "id": "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2"
  }
}
```

### AutoshareUpdated

Fires when the member list or configuration of an existing group is modified.

```json
{
  "topics": ["AutoshareUpdated", "GBVZR3XKFV6KCXOQQKTQJVQPXJRP3KZMZBXHTF4XLVKXMFKZPZXDTUA", 0, 0],
  "data": {
    "id": "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2"
  }
}
```

### GroupDeactivated

Fires when a group creator deactivates their group, preventing further payments.

```json
{
  "topics": ["GroupDeactivated", "GBVZR3XKFV6KCXOQQKTQJVQPXJRP3KZMZBXHTF4XLVKXMFKZPZXDTUA", 0, 0],
  "data": {
    "id": "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2"
  }
}
```

### GroupActivated

Fires when a previously deactivated group is reactivated by its creator.

```json
{
  "topics": ["GroupActivated", "GBVZR3XKFV6KCXOQQKTQJVQPXJRP3KZMZBXHTF4XLVKXMFKZPZXDTUA", 0, 0],
  "data": {
    "id": "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2"
  }
}
```

### ContractPaused

Fires when the admin pauses the contract, halting all mutating calls.

```json
{
  "topics": ["ContractPaused", "GDKZXR2MHKPZAJQXOYHKWJNRPEZKMGKGLLXGFMRQVEFWLXOHZN7XQPLA", 1, 2],
  "data": {}
}
```

### ContractUnpaused

Fires when the admin resumes the contract after a pause.

```json
{
  "topics": ["ContractUnpaused", "GDKZXR2MHKPZAJQXOYHKWJNRPEZKMGKGLLXGFMRQVEFWLXOHZN7XQPLA", 1, 1],
  "data": {}
}
```

### AdminTransferred

Fires when admin rights are transferred to a new address — treat as a security-critical event.

```json
{
  "topics": ["AdminTransferred", "GDKZXR2MHKPZAJQXOYHKWJNRPEZKMGKGLLXGFMRQVEFWLXOHZN7XQPLA", 1, 3],
  "data": {
    "new_admin": "GCEZWKCA5VLDNRLN3RPRJMRZOX3Z6G5CHCGZGPXVTRLEF3P6ENXQMFBW"
  }
}
```

### Withdrawal

Fires when the admin withdraws collected usage fees from the contract to a recipient address.

```json
{
  "topics": [
    "Withdrawal",
    "CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC",
    "GDKZXR2MHKPZAJQXOYHKWJNRPEZKMGKGLLXGFMRQVEFWLXOHZN7XQPLA",
    2,
    3
  ],
  "data": {
    "amount": 500000000
  }
}
```

### AuthorizationFailure

Fires when an address attempts to call a restricted function it is not authorized to invoke.

```json
{
  "topics": ["AuthorizationFailure", "GBPWMTN7MVWZ7QNXBFLYXPJTMSSVZ5TLCMYYMHXN3AQA7EDZZFXGQ5YR", 1, 3],
  "data": {
    "action": "transfer_admin"
  }
}
```

### CategoryRegistered

Fires when the admin registers a new notification category on-chain.

```json
{
  "topics": ["CategoryRegistered", "GDKZXR2MHKPZAJQXOYHKWJNRPEZKMGKGLLXGFMRQVEFWLXOHZN7XQPLA", 3, 0],
  "data": {}
}
```

---

## Notification Lifecycle Events

### NotificationScheduled

Fires when a new notification is scheduled on-chain with a bounded lifetime.

```json
{
  "topics": ["NotificationScheduled", "GBVZR3XKFV6KCXOQQKTQJVQPXJRP3KZMZBXHTF4XLVKXMFKZPZXDTUA", 3, 0],
  "data": {
    "notification_id": "f7e6d5c4b3a2f7e6d5c4b3a2f7e6d5c4b3a2f7e6d5c4b3a2f7e6d5c4b3a2f7e6"
  }
}
```

### NotificationExpired

Fires when a scheduled notification's TTL elapses without being acknowledged or cancelled.

```json
{
  "topics": [
    "NotificationExpired",
    "f7e6d5c4b3a2f7e6d5c4b3a2f7e6d5c4b3a2f7e6d5c4b3a2f7e6d5c4b3a2f7e6",
    3,
    0
  ],
  "data": {
    "expires_at": 1753920000
  }
}
```

### ScheduledNotificationCancelled

Fires when a scheduled notification is explicitly cancelled before it expires.

```json
{
  "topics": [
    "ScheduledNotificationCancelled",
    "GBVZR3XKFV6KCXOQQKTQJVQPXJRP3KZMZBXHTF4XLVKXMFKZPZXDTUA",
    3,
    1
  ],
  "data": {
    "notification_id": "f7e6d5c4b3a2f7e6d5c4b3a2f7e6d5c4b3a2f7e6d5c4b3a2f7e6d5c4b3a2f7e6"
  }
}
```

### NotificationRevoked

Fires when an authorized sender revokes a notification, making it inaccessible to recipients.

```json
{
  "topics": [
    "NotificationRevoked",
    "f7e6d5c4b3a2f7e6d5c4b3a2f7e6d5c4b3a2f7e6d5c4b3a2f7e6d5c4b3a2f7e6",
    "GBVZR3XKFV6KCXOQQKTQJVQPXJRP3KZMZBXHTF4XLVKXMFKZPZXDTUA",
    3,
    2
  ],
  "data": {
    "revoked_at": 1753916400
  }
}
```

### NotificationExtended

Fires when an authorized caller pushes the expiry deadline of an existing notification further out.

```json
{
  "topics": [
    "NotificationExtended",
    "f7e6d5c4b3a2f7e6d5c4b3a2f7e6d5c4b3a2f7e6d5c4b3a2f7e6d5c4b3a2f7e6",
    "GBVZR3XKFV6KCXOQQKTQJVQPXJRP3KZMZBXHTF4XLVKXMFKZPZXDTUA",
    3,
    0
  ],
  "data": {
    "new_expires_at": 1754006800
  }
}
```

### BatchNotificationsCreated

Fires once per batch transaction after all individual notifications in the batch have been scheduled.

```json
{
  "topics": ["BatchNotificationsCreated", "GBVZR3XKFV6KCXOQQKTQJVQPXJRP3KZMZBXHTF4XLVKXMFKZPZXDTUA", 3, 0],
  "data": {
    "count": 3,
    "ids": [
      "1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b",
      "2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c",
      "3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d"
    ]
  }
}
```

### BatchProcessingCompleted

Fires when an off-chain batch job finishes processing all notifications in a given batch.

```json
{
  "topics": [
    "BatchProcessingCompleted",
    "9f8e7d6c5b4a9f8e7d6c5b4a9f8e7d6c5b4a9f8e7d6c5b4a9f8e7d6c5b4a9f8e"
  ],
  "data": {
    "processed_count": 3
  }
}
```

---

## Audit Log Events

### AuditRecordAppended

Fires whenever a lifecycle action (creation, delivery attempt, acknowledgment, etc.) is recorded for a notification.

```json
{
  "topics": [
    "AuditRecordAppended",
    "f7e6d5c4b3a2f7e6d5c4b3a2f7e6d5c4b3a2f7e6d5c4b3a2f7e6d5c4b3a2f7e6",
    1,
    3
  ],
  "data": {
    "seq": 12,
    "actor": "GBVZR3XKFV6KCXOQQKTQJVQPXJRP3KZMZBXHTF4XLVKXMFKZPZXDTUA",
    "timestamp": 1753900000
  }
}
```

> `action` value `1` = `DeliveryAttempt`. See the `AuditAction` enum in [CONTRACT_EVENT_REFERENCE.md](CONTRACT_EVENT_REFERENCE.md) for all values.

---

## Access Log Events

### NotificationAccessed

Fires whenever a protected notification record is read by an authorized address, providing an on-chain access trail for compliance.

```json
{
  "topics": [
    "NotificationAccessed",
    "f7e6d5c4b3a2f7e6d5c4b3a2f7e6d5c4b3a2f7e6d5c4b3a2f7e6d5c4b3a2f7e6",
    "GCEZWKCA5VLDNRLN3RPRJMRZOX3Z6G5CHCGZGPXVTRLEF3P6ENXQMFBW",
    3
  ],
  "data": {
    "accessed_at": 1753901800
  }
}
```

---

## Schema Version Events

### SchemaVersionSet

Fires when the admin sets or upgrades the on-chain notification schema version; off-chain consumers should use this to gate their parsing logic.

```json
{
  "topics": ["SchemaVersionSet", "GDKZXR2MHKPZAJQXOYHKWJNRPEZKMGKGLLXGFMRQVEFWLXOHZN7XQPLA", 1, 1],
  "data": {
    "schema_version": 2,
    "previous_version": 1
  }
}
```

---

## Reputation Events

### ReputationUpdated

Fires when a sender's reputation score is recalculated following a delivery outcome.

```json
{
  "topics": ["ReputationUpdated", "GBVZR3XKFV6KCXOQQKTQJVQPXJRP3KZMZBXHTF4XLVKXMFKZPZXDTUA"],
  "data": {
    "new_score": 842,
    "successful_count": 217,
    "failed_count": 5
  }
}
```

### ReputationTierChanged

Fires when a sender's cumulative delivery record causes them to move between reputation tiers.

```json
{
  "topics": [
    "ReputationTierChanged",
    "GBVZR3XKFV6KCXOQQKTQJVQPXJRP3KZMZBXHTF4XLVKXMFKZPZXDTUA",
    3,
    0
  ],
  "data": {
    "old_tier": 1,
    "new_tier": 2,
    "reputation_score": 842
  }
}
```

> Tier values: `0`=Unverified, `1`=Bronze, `2`=Silver, `3`=Gold, `4`=Platinum.

### NotificationLimitsConfigured

Fires when the admin updates protocol-level caps on payload size, TTL bounds, and batch size.

```json
{
  "topics": [
    "NotificationLimitsConfigured",
    "GDKZXR2MHKPZAJQXOYHKWJNRPEZKMGKGLLXGFMRQVEFWLXOHZN7XQPLA",
    1,
    1
  ],
  "data": {
    "max_payload_size": 8192,
    "max_expiration_seconds": 2592000,
    "min_expiration_seconds": 300,
    "max_batch_size": 50
  }
}
```

---

## TaskBounty Contract Events

TaskBounty events use a two-symbol topic tuple `[verb, noun]` and carry all business fields in `data`. There are no `NotificationCategory` or `NotificationPriority` trailing topics.

### TaskCreated

Fires when a poster creates a new bounty task and the reward is escrowed by the contract.

```json
{
  "topics": ["task", "created"],
  "data": {
    "task_id": 101,
    "poster": "GBPWMTN7MVWZ7QNXBFLYXPJTMSSVZ5TLCMYYMHXN3AQA7EDZZFXGQ5YR",
    "title": "Build a REST API wrapper for the events endpoint",
    "reward": 250000000,
    "deadline": 1754092800
  }
}
```

### WorkSubmitted

Fires when a contributor submits a work URL for review against an open task.

```json
{
  "topics": ["work", "submit"],
  "data": {
    "task_id": 101,
    "submission_id": 7,
    "contributor": "GCEZWKCA5VLDNRLN3RPRJMRZOX3Z6G5CHCGZGPXVTRLEF3P6ENXQMFBW",
    "work_url": "https://github.com/contributor/notify-chain-api-wrapper/pull/3"
  }
}
```

### SubmissionApproved

Fires when the task poster approves a submission and the escrowed reward is transferred to the contributor.

```json
{
  "topics": ["sub", "approved"],
  "data": {
    "task_id": 101,
    "submission_id": 7,
    "contributor": "GCEZWKCA5VLDNRLN3RPRJMRZOX3Z6G5CHCGZGPXVTRLEF3P6ENXQMFBW",
    "reward": 250000000
  }
}
```

### SubmissionRejected

Fires when the task poster rejects a submission without transferring the reward.

```json
{
  "topics": ["sub", "rejected"],
  "data": {
    "task_id": 101,
    "submission_id": 7,
    "contributor": "GCEZWKCA5VLDNRLN3RPRJMRZOX3Z6G5CHCGZGPXVTRLEF3P6ENXQMFBW"
  }
}
```

### TaskCancelled

Fires when a poster cancels a task before any submission has been approved, returning the escrowed reward.

```json
{
  "topics": ["task", "cancel"],
  "data": {
    "task_id": 101,
    "poster": "GBPWMTN7MVWZ7QNXBFLYXPJTMSSVZ5TLCMYYMHXN3AQA7EDZZFXGQ5YR"
  }
}
```

### DisputeRaised

Fires when a contributor or poster raises a formal dispute against a submission outcome.

```json
{
  "topics": ["dispute", "raised"],
  "data": {
    "task_id": 101,
    "submission_id": 7,
    "raiser": "GCEZWKCA5VLDNRLN3RPRJMRZOX3Z6G5CHCGZGPXVTRLEF3P6ENXQMFBW",
    "reason": "Work was delivered in full but rejection was not accompanied by any feedback."
  }
}
```
