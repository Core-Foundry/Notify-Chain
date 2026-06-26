use crate::base::events::NotificationPriority;
use soroban_sdk::{contracttype, Address, BytesN, String, Vec};

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct AutoShareDetails {
    pub id: BytesN<32>,
    pub name: String,
    pub creator: Address,
    pub priority: NotificationPriority,
    pub usage_count: u32,
    pub total_usages_paid: u32,
    pub members: Vec<GroupMember>,
    pub is_active: bool,
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
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ScheduledNotification {
    pub id: BytesN<32>,
    pub creator: Address,
    /// Ledger timestamp (seconds) at which the notification was scheduled.
    pub created_at: u64,
    /// Ledger timestamp (seconds) at or after which the notification is expired.
    pub expires_at: u64,
    /// Address that revoked the notification, or None if not revoked.
    pub revoked_by: Option<Address>,
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

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct PaymentHistory {
    pub user: Address,
    pub group_id: BytesN<32>,
    pub usages_purchased: u32,
    pub amount_paid: i128,
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
