use soroban_sdk::{contractevent, contracttype, Address, BytesN, String, Vec};

/// High-level notification category attached to every emitted event.
///
/// Off-chain consumers (listeners, indexers, dashboards) often only care about a
/// subset of the events the contract emits. Each event carries its category as a
/// trailing, indexed event topic so consumers can subscribe to  or filter out
/// whole categories without having to decode the event payload first.
///
/// # Backward compatibility
///
/// The category is published as the *last* topic of every event, after the event
/// name and any pre-existing topics. Existing listeners that read the event name
/// (the first topic) and the previously defined topics/data are unaffected: the
/// extra trailing topic is simply ignored by consumers that don't look for it.
#[contracttype]
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum NotificationCategory {
    /// Lifecycle changes to AutoShare groups: created, updated, activated,
    /// deactivated.
    Group = 0,
    /// Administrative / system actions: pause, unpause, admin transfer.
    Admin = 1,
    /// Movement of funds: withdrawals.
    Financial = 2,
    /// Scheduled notification operations: scheduling, expiry, cancellation.
    Notification = 3,
}

/// Severity level attached to every emitted event alongside its category.
///
/// Off-chain consumers (alerting, dashboards, paging) often route notifications
/// by priority rather than (or in addition to) category. Each event carries its
/// priority as a trailing, indexed event topic so consumers can subscribe to
/// or page on  high-priority notifications without decoding the payload.
///
/// # Backward compatibility
///
/// The priority is published as the *last* topic of every event, after the
/// event name, the previously defined topics, and the category. Existing
/// listeners that only read the event name (the first topic), the prior topics,
/// or the category will continue to work unchanged: the extra trailing topic is
/// simply ignored by consumers that don't look for it.
#[contracttype]
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum NotificationPriority {
    /// Informational: routine lifecycle events. No action required.
    Low = 0,
    /// Standard: day-to-day operational events worth tracking.
    Medium = 1,
    /// Elevated: events the operator should review promptly.
    High = 2,
    /// Urgent: security-relevant or funds-moving events that demand
    /// immediate attention (e.g. admin transfer, authorization failure).
    Critical = 3,
}

/// Emitted when a new AutoShare group is created.
#[contractevent(data_format = "single-value")]
#[derive(Clone)]
pub struct AutoshareCreated {
    #[topic]
    pub creator: Address,
    #[topic]
    pub category: NotificationCategory,
    #[topic]
    pub priority: NotificationPriority,
    pub id: BytesN<32>,
}

/// Emitted when a notification category is registered on-chain.
#[contractevent]
#[derive(Clone)]
pub struct CategoryRegistered {
    #[topic]
    pub admin: Address,
    #[topic]
    pub category: NotificationCategory,
    #[topic]
    pub priority: NotificationPriority,
}

/// Emitted when the contract is paused by the admin.
#[contractevent]
#[derive(Clone)]
pub struct ContractPaused {
    #[topic]
    pub admin: Address,
    #[topic]
    pub category: NotificationCategory,
    #[topic]
    pub priority: NotificationPriority,
}

/// Emitted when the contract is unpaused by the admin.
#[contractevent]
#[derive(Clone)]
pub struct ContractUnpaused {
    #[topic]
    pub admin: Address,
    #[topic]
    pub category: NotificationCategory,
    #[topic]
    pub priority: NotificationPriority,
}

/// Emitted when an AutoShare group's member list is updated.
#[contractevent(data_format = "single-value")]
#[derive(Clone)]
pub struct AutoshareUpdated {
    #[topic]
    pub updater: Address,
    #[topic]
    pub category: NotificationCategory,
    #[topic]
    pub priority: NotificationPriority,
    pub id: BytesN<32>,
}

/// Emitted when an AutoShare group is deactivated by its creator.
#[contractevent(data_format = "single-value")]
#[derive(Clone)]
pub struct GroupDeactivated {
    #[topic]
    pub creator: Address,
    #[topic]
    pub category: NotificationCategory,
    #[topic]
    pub priority: NotificationPriority,
    pub id: BytesN<32>,
}

/// Emitted when a deactivated AutoShare group is reactivated by its creator.
#[contractevent(data_format = "single-value")]
#[derive(Clone)]
pub struct GroupActivated {
    #[topic]
    pub creator: Address,
    #[topic]
    pub category: NotificationCategory,
    #[topic]
    pub priority: NotificationPriority,
    pub id: BytesN<32>,
}

/// Emitted when the admin rights of the contract are transferred.
#[contractevent(data_format = "single-value")]
#[derive(Clone)]
pub struct AdminTransferred {
    #[topic]
    pub old_admin: Address,
    #[topic]
    pub category: NotificationCategory,
    #[topic]
    pub priority: NotificationPriority,
    pub new_admin: Address,
}

/// Emitted when the admin withdraws collected usage fees from the contract.
#[contractevent(data_format = "single-value")]
#[derive(Clone)]
pub struct Withdrawal {
    #[topic]
    pub token: Address,
    #[topic]
    pub recipient: Address,
    #[topic]
    pub category: NotificationCategory,
    #[topic]
    pub priority: NotificationPriority,
    pub amount: i128,
}

/// Emitted when an authorization failure is detected by the contract.
#[contractevent(data_format = "single-value")]
#[derive(Clone)]
pub struct AuthorizationFailure {
    #[topic]
    pub caller: Address,
    #[topic]
    pub category: NotificationCategory,
    #[topic]
    pub priority: NotificationPriority,
    pub action: String,
}

/// Emitted when a scheduled notification is cancelled.
///
/// The `notification_id` field carries the unique identifier of the notification
/// that was cancelled, allowing off-chain consumers to correlate the on-chain
/// event back to the corresponding scheduled notification record.
#[contractevent(data_format = "single-value")]
#[derive(Clone)]
pub struct ScheduledNotificationCancelled {
    #[topic]
    pub caller: Address,
    #[topic]
    pub category: NotificationCategory,
    #[topic]
    pub priority: NotificationPriority,
    pub notification_id: BytesN<32>,
}

/// Emitted when a notification is scheduled on-chain with a bounded lifetime.
///
/// Off-chain consumers can use this to track the notification's existence and
/// know when to expect an accompanying [`NotificationExpired`] event.
#[contractevent(data_format = "single-value")]
#[derive(Clone)]
pub struct NotificationScheduled {
    #[topic]
    pub creator: Address,
    #[topic]
    pub category: NotificationCategory,
    #[topic]
    pub priority: NotificationPriority,
    pub notification_id: BytesN<32>,
}

/// Emitted when a scheduled notification's lifetime elapses and it is expired.
///
/// The `notification_id` is published as an indexed topic so consumers can
/// subscribe to the expiry of a specific notification; the `expires_at`
/// timestamp at which it became invalid is carried as the event data.
#[contractevent(data_format = "single-value")]
#[derive(Clone)]
pub struct NotificationExpired {
    #[topic]
    pub notification_id: BytesN<32>,
    #[topic]
    pub category: NotificationCategory,
    #[topic]
    pub priority: NotificationPriority,
    pub expires_at: u64,
}

// ============================================================================
// Audit Logging
// ============================================================================

/// Discriminator for each stage in the notification lifecycle that the audit
/// log tracks.  Values are fixed-width integers so they serialise compactly on
/// chain and can be matched exactly by off-chain indexers.
#[contracttype]
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum AuditAction {
    /// A notification was created (scheduled on-chain).
    Created = 0,
    /// A delivery attempt was made for a notification.
    DeliveryAttempt = 1,
    /// A delivery attempt failed.
    DeliveryFailed = 2,
    /// The recipient acknowledged the notification.
    Acknowledged = 3,
    /// The notification was cancelled before expiry.
    Cancelled = 4,
    /// The notification expired naturally.
    Expired = 5,
}

/// Emitted when a new audit record is appended to the on-chain log.
///
/// Off-chain indexers should key off `(notification_id, action)` to track the
/// full lifecycle of each notification.
#[contractevent]
#[derive(Clone)]
pub struct AuditRecordAppended {
    #[topic]
    pub notification_id: BytesN<32>,
    #[topic]
    pub action: AuditAction,
    #[topic]
    pub category: NotificationCategory,
    pub seq: u64,
    pub actor: Address,
    // GAS: Removed `timestamp` — derivable from ledger metadata
}

/// Emitted when a batch of notifications is created in a single transaction.
///
/// Each per-notification event is still emitted individually; this summary
/// event additionally carries the count so consumers can verify completeness.
#[contractevent]
#[derive(Clone)]
pub struct BatchNotificationsCreated {
    #[topic]
    pub creator: Address,
    #[topic]
    pub category: NotificationCategory,
    #[topic]
    pub priority: NotificationPriority,
    pub count: u32,
    pub ids: Vec<BytesN<32>>,
}

/// Emitted when a scheduled notification is revoked by an authorized sender.
///
/// The `notification_id` is published as an indexed topic so consumers can
/// subscribe to the revocation of a specific notification; the `revoked_by`
/// address indicates who initiated the revocation. The timestamp when the
/// revocation occurred is derivable from ledger metadata.
#[contractevent(data_format = "single-value")]
#[derive(Clone)]
pub struct NotificationRevoked {
    #[topic]
    pub notification_id: BytesN<32>,
    #[topic]
    pub revoked_by: Address,
    #[topic]
    pub category: NotificationCategory,
    #[topic]
    pub priority: NotificationPriority,
    // GAS: Removed `revoked_at` — derivable from ledger metadata
}

/// Emitted when an off-chain batch of notifications finishes processing.
#[contractevent(data_format = "single-value")]
#[derive(Clone)]
pub struct BatchProcessingCompleted {
    #[topic]
    pub batch_id: BytesN<32>,
    #[topic]
    pub category: NotificationCategory,
    #[topic]
    pub priority: NotificationPriority,
    pub processed_count: u32,
}

/// Emitted when a scheduled notification's expiry period is extended by an authorized sender.
#[contractevent(data_format = "single-value")]
#[derive(Clone)]
pub struct NotificationExtended {
    #[topic]
    pub notification_id: BytesN<32>,
    #[topic]
    pub caller: Address,
    #[topic]
    pub category: NotificationCategory,
    #[topic]
    pub priority: NotificationPriority,
    pub new_expires_at: u64,
}

/// Emitted when a sender's reputation score is updated.
/// Triggered by successful or failed notification delivery.
#[contractevent]
#[derive(Clone)]
pub struct ReputationUpdated {
    #[topic]
    pub sender: Address,
    #[topic]
    pub category: NotificationCategory,
    #[topic]
    pub priority: NotificationPriority,
    pub new_score: i64,
    pub successful_count: u32,
    pub failed_count: u32,
}

/// Emitted when protocol-level notification limits are configured or updated.
#[contractevent]
#[derive(Clone)]
pub struct NotificationLimitsConfigured {
    #[topic]
    pub admin: Address,
    #[topic]
    pub category: NotificationCategory,
    #[topic]
    pub priority: NotificationPriority,
    pub max_payload_size: u32,
    pub max_expiration_seconds: u64,
    pub min_expiration_seconds: u64,
    pub max_batch_size: u32,
}

/// Emitted when a sender's reputation tier changes (e.g., from Bronze to Silver).
#[contractevent]
#[derive(Clone)]
pub struct ReputationTierChanged {
    #[topic]
    pub sender: Address,
    #[topic]
    pub category: NotificationCategory,
    #[topic]
    pub priority: NotificationPriority,
    pub old_tier: u32,
    pub new_tier: u32,
    pub reputation_score: i64,
}

// ============================================================================
// Schema Version Tracking  (Issue #309)
// ============================================================================

/// Emitted when the on-chain notification schema version is set or upgraded.
///
/// Off-chain consumers should read `schema_version` from every event to gate
/// their parsing logic. Unsupported versions must be rejected at the listener
/// layer so incompatible payloads never reach downstream consumers.
#[contractevent]
#[derive(Clone)]
pub struct SchemaVersionSet {
    #[topic]
    pub admin: Address,
    #[topic]
    pub category: NotificationCategory,
    #[topic]
    pub priority: NotificationPriority,
    /// New schema version number.
    pub schema_version: u32,
    /// Previous schema version (0 when first set).
    pub previous_version: u32,
}

// ============================================================================
// Access Logging  (Issue #312)
// ============================================================================

/// Emitted whenever a protected notification record is accessed.
///
/// Off-chain indexers should key off `(notification_id, accessor)` to build an
/// immutable access trail. The `accessed_at` timestamp is provided for ordering
/// and compliance reporting.
#[contractevent]
#[derive(Clone)]
pub struct NotificationAccessed {
    #[topic]
    pub notification_id: BytesN<32>,
    #[topic]
    pub accessor: Address,
    #[topic]
    pub category: NotificationCategory,
    /// Ledger timestamp (seconds) when the access occurred.
    pub accessed_at: u64,
}
