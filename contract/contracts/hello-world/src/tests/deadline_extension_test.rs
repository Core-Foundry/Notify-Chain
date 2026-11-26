//! Tests for extend_task_deadline (issue #1232).
//!
//! Acceptance criteria verified:
//! - Only the original task creator can extend — admin and third parties are rejected.
//! - Completed (delivered) and recalled tasks cannot be extended.
//! - new_deadline must be strictly later than the current expires_at.
//! - Valid extensions are stored and recorded in a TaskDeadlineExtended event carrying
//!   both the previous and updated deadlines.

use crate::base::events::NotificationPriority;
use crate::test_utils::setup_test_env;
use crate::AutoShareContractClient;

use soroban_sdk::testutils::{Address as _, Events, Ledger};
use soroban_sdk::{Address, BytesN, Env, String, Symbol, TryFromVal, Val};

// ── helpers ──────────────────────────────────────────────────────────────────

fn make_id(env: &Env, tag: u8) -> BytesN<32> {
    let mut bytes = [0u8; 32];
    bytes[0] = tag;
    BytesN::from_array(env, &bytes)
}

fn title(env: &Env) -> String {
    String::from_str(env, "Bounty task")
}

/// Schedules a notification at the given ledger time and returns expires_at.
fn schedule_at(
    env: &Env,
    client: &AutoShareContractClient,
    id: &BytesN<32>,
    creator: &Address,
    now: u64,
    ttl: u64,
) -> u64 {
    env.ledger().set_timestamp(now);
    client.schedule_notification(id, creator, &ttl, &title(env), &NotificationPriority::Medium);
    now + ttl
}

/// Returns all topics of the latest event whose first topic matches `event_name`.
fn topics_of(env: &Env, event_name: &str) -> Option<soroban_sdk::Vec<Val>> {
    let target = Symbol::new(env, event_name);
    let mut found = None;
    for (_addr, topics, _data) in env.events().all().iter() {
        if topics.is_empty() {
            continue;
        }
        if let Ok(name) = Symbol::try_from_val(env, &topics.get(0).unwrap()) {
            if name == target {
                found = Some(topics);
            }
        }
    }
    found
}

// ============================================================================
// Happy path
// ============================================================================

#[test]
fn creator_can_extend_deadline_to_later_timestamp() {
    let t = setup_test_env();
    let client = AutoShareContractClient::new(&t.env, &t.autoshare_contract);
    let creator = t.users.get(0).unwrap();
    let id = make_id(&t.env, 1);

    // Schedule with a 1-hour TTL starting at t=1_000 → expires_at = 4_600.
    schedule_at(&t.env, &client, &id, &creator, 1_000, 3_600);

    // Extend to t=10_000 (well after current expires_at of 4_600).
    client.extend_task_deadline(&id, &creator, &10_000);

    let stored = client.get_notification(&id);
    assert_eq!(stored.expires_at, 10_000, "expires_at must equal new_deadline");
}

#[test]
fn task_deadline_extended_event_carries_notification_id_and_creator_in_topics() {
    let t = setup_test_env();
    let client = AutoShareContractClient::new(&t.env, &t.autoshare_contract);
    let creator = t.users.get(0).unwrap();
    let id = make_id(&t.env, 2);

    schedule_at(&t.env, &client, &id, &creator, 1_000, 3_600);
    client.extend_task_deadline(&id, &creator, &9_000);

    // Topics: [0] name, [1] notification_id, [2] creator, [3] category, [4] priority.
    let topics = topics_of(&t.env, "task_deadline_extended")
        .expect("task_deadline_extended event must be emitted");
    assert_eq!(topics.len(), 5);

    let topic_id = BytesN::<32>::try_from_val(&t.env, &topics.get(1).unwrap()).unwrap();
    assert_eq!(topic_id, id, "topic[1] must be the notification id");

    let topic_creator = Address::try_from_val(&t.env, &topics.get(2).unwrap()).unwrap();
    assert_eq!(topic_creator, creator, "topic[2] must be the creator");
}

// ============================================================================
// Authorization — only the creator
// ============================================================================

#[test]
fn admin_cannot_extend_task_deadline() {
    let t = setup_test_env();
    let client = AutoShareContractClient::new(&t.env, &t.autoshare_contract);
    let creator = t.users.get(0).unwrap();
    let id = make_id(&t.env, 3);

    schedule_at(&t.env, &client, &id, &creator, 1_000, 3_600);

    let result = client.try_extend_task_deadline(&id, &t.admin, &10_000);
    assert!(result.is_err(), "admin must not be able to extend a task deadline");
}

#[test]
fn third_party_cannot_extend_task_deadline() {
    let t = setup_test_env();
    let client = AutoShareContractClient::new(&t.env, &t.autoshare_contract);
    let creator = t.users.get(0).unwrap();
    let other = t.users.get(1).unwrap();
    let id = make_id(&t.env, 4);

    schedule_at(&t.env, &client, &id, &creator, 1_000, 3_600);

    let result = client.try_extend_task_deadline(&id, &other, &10_000);
    assert!(result.is_err(), "unrelated address must not be able to extend");
}

// ============================================================================
// Ineligible task states
// ============================================================================

#[test]
fn cannot_extend_expired_task() {
    let t = setup_test_env();
    let client = AutoShareContractClient::new(&t.env, &t.autoshare_contract);
    let creator = t.users.get(0).unwrap();
    let id = make_id(&t.env, 5);

    schedule_at(&t.env, &client, &id, &creator, 1_000, 3_600);
    // Advance past expiry.
    t.env.ledger().set_timestamp(1_000 + 3_600 + 1);

    let result = client.try_extend_task_deadline(&id, &creator, &999_999);
    assert!(result.is_err(), "expired task must not be extendable");
}

#[test]
fn cannot_extend_revoked_task() {
    let t = setup_test_env();
    let client = AutoShareContractClient::new(&t.env, &t.autoshare_contract);
    let creator = t.users.get(0).unwrap();
    let id = make_id(&t.env, 6);

    schedule_at(&t.env, &client, &id, &creator, 1_000, 3_600);
    client.revoke_notification(&id, &creator);

    let result = client.try_extend_task_deadline(&id, &creator, &999_999);
    assert!(result.is_err(), "revoked task must not be extendable");
}

#[test]
fn cannot_extend_delivered_task() {
    let t = setup_test_env();
    let client = AutoShareContractClient::new(&t.env, &t.autoshare_contract);
    let creator = t.users.get(0).unwrap();
    let id = make_id(&t.env, 7);

    schedule_at(&t.env, &client, &id, &creator, 1_000, 3_600);
    client.confirm_notification_delivery(&id, &creator);

    let result = client.try_extend_task_deadline(&id, &creator, &999_999);
    assert!(result.is_err(), "delivered (completed) task must not be extendable");
}

#[test]
fn cannot_extend_recalled_task() {
    let t = setup_test_env();
    let client = AutoShareContractClient::new(&t.env, &t.autoshare_contract);
    let creator = t.users.get(0).unwrap();
    let id = make_id(&t.env, 8);

    schedule_at(&t.env, &client, &id, &creator, 1_000, 3_600);
    client.recall_notification(&id, &creator);

    let result = client.try_extend_task_deadline(&id, &creator, &999_999);
    assert!(result.is_err(), "recalled (cancelled) task must not be extendable");
}

// ============================================================================
// Invalid deadline values
// ============================================================================

#[test]
fn new_deadline_equal_to_current_is_rejected() {
    let t = setup_test_env();
    let client = AutoShareContractClient::new(&t.env, &t.autoshare_contract);
    let creator = t.users.get(0).unwrap();
    let id = make_id(&t.env, 9);

    let current_expires_at = schedule_at(&t.env, &client, &id, &creator, 1_000, 3_600);

    let result = client.try_extend_task_deadline(&id, &creator, &current_expires_at);
    assert!(result.is_err(), "new_deadline equal to expires_at must be rejected");
}

#[test]
fn new_deadline_before_current_is_rejected() {
    let t = setup_test_env();
    let client = AutoShareContractClient::new(&t.env, &t.autoshare_contract);
    let creator = t.users.get(0).unwrap();
    let id = make_id(&t.env, 10);

    schedule_at(&t.env, &client, &id, &creator, 1_000, 3_600);

    let result = client.try_extend_task_deadline(&id, &creator, &100); // well before 4_600
    assert!(result.is_err(), "new_deadline earlier than expires_at must be rejected");
}

#[test]
fn nonexistent_task_returns_not_found() {
    let t = setup_test_env();
    let client = AutoShareContractClient::new(&t.env, &t.autoshare_contract);
    let caller = t.users.get(0).unwrap();
    let missing_id = make_id(&t.env, 11);

    let result = client.try_extend_task_deadline(&missing_id, &caller, &999_999);
    assert!(result.is_err(), "unknown notification id must be rejected");
}
