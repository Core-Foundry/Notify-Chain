use crate::base::events::{AuditAction, NotificationPriority};
use soroban_sdk::{contracttype, Address, BytesN, String, Vec};

/// AutoShare group details.
///
/// # Field ordering (storage optimization — issue #371)
///
/// Fixed-width scalars are grouped together before the variable-length heap
/// fields to keep the XDR-encoded representation compact:
///
/// 1. Identity       — `id` (BytesN<32>, fixed 32 bytes)
/// 2. Ownership      — `creator` (Address)
/// 3. Priority       — `priority` (enum, small discriminant)
/// 4. Counters       — `usage_count`, `total_usages_paid` (u32 each, 4 bytes)
/// 5. Flag           — `is_active` (bool, 1 byte — packed next to u32 counters)
/// 6. Variable-len   — `name` (String), `members` (Vec)
///
/// Placing `is_active` adjacent to the u32 counter fields (rather than after
/// the variable-length `members` Vec) keeps all fixed-width fields together and
/// avoids a scattered layout in the XDR stream.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct AutoShareDetails {
    /// Unique group identifier.
    pub id: BytesN<32>,
    /// Address that created and administers this group.
    pub creator: Address,
    /// Default notification priority for events emitted by this group.
    pub priority: NotificationPriority,
    /// Remaining usage credits for this group.
    pub usage_count: u32,
    /// Cumulative usages purchased across all top-ups.
    pub total_usages_paid: u32,
    /// Whether the group is currently active (can receive usage).
    pub is_active: bool,
    /// Human-readable name of the group.
    pub name: String,
    /// Members and their payout percentages (must sum to 100 when non-empty).
    pub members: Vec<GroupMember>,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct GroupMember {
    pub address: Address,
    pub percentage: u32,
}

/// A notification stored on-chain with a bounded lifetime.
///
/// The notification is considered **expired** — and therefore invalid for any
/// further interaction — once the ledger timestamp reaches `expires_at`.
///
/// A notification can also be **revoked** before its expiration by an authorized
/// sender. Once revoked, the notification becomes inactive and cannot be
/// interacted with. Revoked notifications maintain their state for auditing
/// and transparency.
///
/// # Field ordering (storage optimization — issue #371)
///
/// Fixed-width fields are grouped before the optional heap-allocated fields:
///
/// 1. Identity    — `id` (BytesN<32>)
/// 2. Ownership   — `creator` (Address)
/// 3. Priority    — `priority` (enum, small discriminant)
/// 4. Timestamps  — `created_at`, `expires_at` (u64 each, adjacent)
/// 5. Revocation  — `revoked_at` (Option<u64>), `revoked_by` (Option<Address>)
///
/// Keeping both u64 timestamps adjacent avoids interleaving fixed and variable
/// fields in the XDR stream.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ScheduledNotification {
    /// Unique notification identifier.
    pub id: BytesN<32>,
    /// Address that scheduled this notification.
    pub creator: Address,
    /// Delivery priority assigned at scheduling time; determines processing order.
    pub priority: NotificationPriority,
    /// Ledger timestamp (seconds) at which the notification was scheduled.
    pub created_at: u64,
    /// Ledger timestamp (seconds) at or after which the notification is expired.
    pub expires_at: u64,
    /// Ledger timestamp (seconds) at which the notification was revoked, if revoked.
    pub revoked_at: Option<u64>,
    /// Whether the notification has been confirmed as delivered.
    pub delivered: bool,
    /// Ledger timestamp (seconds) at which delivery was confirmed, if any.
    pub delivered_at: Option<u64>,
    /// Address that recalled the notification, or None if not recalled.
    pub recalled_by: Option<Address>,
    /// Ledger timestamp (seconds) at which the notification was recalled, if recalled.
    pub recalled_at: Option<u64>,
    /// Notification title (required metadata for off-chain processing)
    pub title: String,
}

/// A single on-chain payment record.
///
/// # Field ordering (storage optimization — issue #371)
///
/// Fixed-width scalars are grouped together to avoid interleaving variable-
/// length and fixed-width fields in the XDR stream:
///
/// 1. Identity    — `user` (Address), `group_id` (BytesN<32>)
/// 2. Scalars     — `usages_purchased` (u32), `timestamp` (u64),
///                  `amount_paid` (i128) — ordered narrow → wide
///
/// Previously `amount_paid` (i128, 16 bytes) was sandwiched between the u32
/// and u64 fields.  Ordering narrow → wide keeps all numeric fields together
/// and is easier to reason about.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct PaymentHistory {
    /// Address of the user who made the payment.
    pub user: Address,
    /// Identifier of the group the payment was for.
    pub group_id: BytesN<32>,
    /// Number of usage credits purchased.
    pub usages_purchased: u32,
    /// Ledger timestamp (seconds) at which the payment was made.
    pub timestamp: u64,
    /// Total amount paid in the token's smallest unit.
    pub amount_paid: i128,
}

/// Immutable record of a single notification lifecycle event.
///
/// Records are appended to persistent storage in order of occurrence and can
/// never be modified or deleted after creation, satisfying the audit-log
/// immutability requirement.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct AuditRecord {
    /// Sequential, 1-based index assigned at append time. Provides a stable
    /// ordering handle for range queries.
    pub seq: u64,
    /// The notification identifier this record belongs to (all-zeros for
    /// contract-level actions such as pause/unpause).
    pub notification_id: BytesN<32>,
    /// Which lifecycle stage this record represents.
    pub action: AuditAction,
    /// Who triggered the action (caller or creator).
    pub actor: Address,
    /// Ledger timestamp (seconds) when the action occurred.
    pub timestamp: u64,
}

/// Protocol-level configurable limits for notifications.
/// Allows administrators to set boundaries on notification sizes,
/// expiration periods, and batch operation sizes.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct NotificationLimits {
    /// Maximum size in bytes for a notification payload
    pub max_payload_size: u32,
    /// Maximum number of seconds a notification can be scheduled to expire
    pub max_expiration_seconds: u64,
    /// Minimum number of seconds before a notification can expire
    pub min_expiration_seconds: u64,
    /// Maximum number of notifications in a batch operation
    pub max_batch_size: u32,
}
