//! Tests for issue #375 – Emit Event on Subscription Cancellation.
//!
//! Acceptance criteria verified here:
//! 1. Cancelling an active subscription emits a `subscription_cancelled` event.
//! 2. The emitted event contains subscriber information (group_id + subscriber
//!    as indexed topics, cancelled_at as payload data).
//! 3. Edge cases: non-member cannot cancel, already-inactive group is rejected,
//!    paused contract blocks cancellation, member (non-creator) can cancel.

use crate::base::events::{NotificationCategory, NotificationPriority};
use crate::test_utils::{create_test_group, setup_test_env};
use crate::AutoShareContractClient;

use soroban_sdk::testutils::Events;
use soroban_sdk::{Address, BytesN, Symbol, TryFromVal, Val, Vec};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/// Returns the topics of the most recent event whose first topic matches
/// `event_name`, or `None` if no such event was emitted.
fn topics_of(env: &soroban_sdk::Env, event_name: &str) -> Option<Vec<Val>> {
    let target = Symbol::new(env, event_name);
    let mut found: Option<Vec<Val>> = None;
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

/// Returns the raw event data `Val` for the most recent event matching
/// `event_name`, or `None` if not found.
fn data_of(env: &soroban_sdk::Env, event_name: &str) -> Option<Val> {
    let target = Symbol::new(env, event_name);
    let mut found: Option<Val> = None;
    for (_addr, topics, data) in env.events().all().iter() {
        if topics.is_empty() {
            continue;
        }
        if let Ok(name) = Symbol::try_from_val(env, &topics.get(0).unwrap()) {
            if name == target {
                found = Some(data);
            }
        }
    }
    found
}

// ---------------------------------------------------------------------------
// AC-1: Cancellation emits a `subscription_cancelled` event
// ---------------------------------------------------------------------------

#[test]
fn test_cancel_subscription_emits_event() {
    let test_env = setup_test_env();
    let client = AutoShareContractClient::new(&test_env.env, &test_env.autoshare_contract);
    let creator = test_env.users.get(0).unwrap().clone();
    let token = test_env.mock_tokens.get(0).unwrap().clone();

    let id = create_test_group(
        &test_env.env,
        &test_env.autoshare_contract,
        &creator,
        &Vec::new(&test_env.env),
        1,
        &token,
    );

    client.cancel_subscription(&id, &creator);

    assert!(
        topics_of(&test_env.env, "subscription_cancelled").is_some(),
        "expected a subscription_cancelled event to be emitted"
    );
}

// ---------------------------------------------------------------------------
// AC-2: Event contains subscriber information
// ---------------------------------------------------------------------------

#[test]
fn test_cancel_subscription_event_topic_shape() {
    let test_env = setup_test_env();
    let client = AutoShareContractClient::new(&test_env.env, &test_env.autoshare_contract);
    let creator = test_env.users.get(0).unwrap().clone();
    let token = test_env.mock_tokens.get(0).unwrap().clone();

    let id = create_test_group(
        &test_env.env,
        &test_env.autoshare_contract,
        &creator,
        &Vec::new(&test_env.env),
        1,
        &token,
    );

    client.cancel_subscription(&id, &creator);

    let topics = topics_of(&test_env.env, "subscription_cancelled")
        .expect("subscription_cancelled event must be emitted");

    // Expected shape: [event_name, group_id, subscriber, category, priority]
    assert_eq!(topics.len(), 5, "expected 5 topics on subscription_cancelled");

    // Topic[0]: event name symbol
    let name = Symbol::try_from_val(&test_env.env, &topics.get(0).unwrap()).unwrap();
    assert_eq!(name, Symbol::new(&test_env.env, "subscription_cancelled"));

    // Topic[1]: group_id
    let emitted_id =
        BytesN::<32>::try_from_val(&test_env.env, &topics.get(1).unwrap()).unwrap();
    assert_eq!(emitted_id, id);

    // Topic[2]: subscriber address
    let emitted_subscriber =
        Address::try_from_val(&test_env.env, &topics.get(2).unwrap()).unwrap();
    assert_eq!(emitted_subscriber, creator);

    // Topic[3]: category == Group
    let category =
        NotificationCategory::try_from_val(&test_env.env, &topics.get(3).unwrap()).unwrap();
    assert_eq!(category, NotificationCategory::Group);

    // Topic[4]: priority == Medium
    let priority =
        NotificationPriority::try_from_val(&test_env.env, &topics.get(4).unwrap()).unwrap();
    assert_eq!(priority, NotificationPriority::Medium);
}

#[test]
fn test_cancel_subscription_event_data_contains_cancelled_at() {
    let test_env = setup_test_env();
    let client = AutoShareContractClient::new(&test_env.env, &test_env.autoshare_contract);
    let creator = test_env.users.get(0).unwrap().clone();
    let token = test_env.mock_tokens.get(0).unwrap().clone();

    let id = create_test_group(
        &test_env.env,
        &test_env.autoshare_contract,
        &creator,
        &Vec::new(&test_env.env),
        1,
        &token,
    );

    client.cancel_subscription(&id, &creator);

    let raw_data = data_of(&test_env.env, "subscription_cancelled")
        .expect("subscription_cancelled event must be emitted");

    // Data is the `cancelled_at` u64 timestamp.
    let cancelled_at = u64::try_from_val(&test_env.env, &raw_data).unwrap();
    // Ledger timestamp in tests defaults to 0; just assert it decodes without panic.
    let _ = cancelled_at;
}

// ---------------------------------------------------------------------------
// AC-2 (extended): Group is deactivated after cancellation
// ---------------------------------------------------------------------------

#[test]
fn test_cancel_subscription_deactivates_group() {
    let test_env = setup_test_env();
    let client = AutoShareContractClient::new(&test_env.env, &test_env.autoshare_contract);
    let creator = test_env.users.get(0).unwrap().clone();
    let token = test_env.mock_tokens.get(0).unwrap().clone();

    let id = create_test_group(
        &test_env.env,
        &test_env.autoshare_contract,
        &creator,
        &Vec::new(&test_env.env),
        5,
        &token,
    );

    assert!(client.is_group_active(&id), "group must be active before cancel");

    client.cancel_subscription(&id, &creator);

    assert!(
        !client.is_group_active(&id),
        "group must be inactive after cancel"
    );
    assert_eq!(
        client.get_remaining_usages(&id),
        0,
        "remaining usages must be zeroed after cancel"
    );
}

// ---------------------------------------------------------------------------
// Edge case: non-member / non-creator cannot cancel
// ---------------------------------------------------------------------------

#[test]
#[should_panic]
fn test_cancel_subscription_rejects_non_member() {
    let test_env = setup_test_env();
    let client = AutoShareContractClient::new(&test_env.env, &test_env.autoshare_contract);
    let creator = test_env.users.get(0).unwrap().clone();
    let outsider = test_env.users.get(1).unwrap().clone();
    let token = test_env.mock_tokens.get(0).unwrap().clone();

    let id = create_test_group(
        &test_env.env,
        &test_env.autoshare_contract,
        &creator,
        &Vec::new(&test_env.env),
        1,
        &token,
    );

    // outsider is neither creator nor member – must panic (Unauthorized)
    client.cancel_subscription(&id, &outsider);
}

// ---------------------------------------------------------------------------
// Edge case: already-inactive group is rejected
// ---------------------------------------------------------------------------

#[test]
#[should_panic]
fn test_cancel_subscription_rejects_already_inactive_group() {
    let test_env = setup_test_env();
    let client = AutoShareContractClient::new(&test_env.env, &test_env.autoshare_contract);
    let creator = test_env.users.get(0).unwrap().clone();
    let token = test_env.mock_tokens.get(0).unwrap().clone();

    let id = create_test_group(
        &test_env.env,
        &test_env.autoshare_contract,
        &creator,
        &Vec::new(&test_env.env),
        1,
        &token,
    );

    client.cancel_subscription(&id, &creator);
    // Second cancellation on an already-inactive group must panic (GroupInactive)
    client.cancel_subscription(&id, &creator);
}

// ---------------------------------------------------------------------------
// Edge case: paused contract blocks cancellation
// ---------------------------------------------------------------------------

#[test]
#[should_panic]
fn test_cancel_subscription_blocked_when_paused() {
    let test_env = setup_test_env();
    let client = AutoShareContractClient::new(&test_env.env, &test_env.autoshare_contract);
    let creator = test_env.users.get(0).unwrap().clone();
    let token = test_env.mock_tokens.get(0).unwrap().clone();

    let id = create_test_group(
        &test_env.env,
        &test_env.autoshare_contract,
        &creator,
        &Vec::new(&test_env.env),
        1,
        &token,
    );

    client.pause(&test_env.admin);
    // Cancellation while paused must panic (ContractPaused)
    client.cancel_subscription(&id, &creator);
}

// ---------------------------------------------------------------------------
// Edge case: group member (non-creator) can cancel
// ---------------------------------------------------------------------------

#[test]
fn test_cancel_subscription_by_member() {
    use crate::base::types::GroupMember;

    let test_env = setup_test_env();
    let client = AutoShareContractClient::new(&test_env.env, &test_env.autoshare_contract);
    let creator = test_env.users.get(0).unwrap().clone();
    let member_addr = test_env.users.get(1).unwrap().clone();
    let token = test_env.mock_tokens.get(0).unwrap().clone();

    let id = create_test_group(
        &test_env.env,
        &test_env.autoshare_contract,
        &creator,
        &Vec::new(&test_env.env),
        1,
        &token,
    );

    // Add member_addr to the group so they are authorised to cancel.
    let mut members = Vec::new(&test_env.env);
    members.push_back(GroupMember {
        address: member_addr.clone(),
        percentage: 100,
    });
    client.update_members(&id, &creator, &members);

    // Member cancels the subscription.
    client.cancel_subscription(&id, &member_addr);

    assert!(
        topics_of(&test_env.env, "subscription_cancelled").is_some(),
        "subscription_cancelled event must be emitted when a member cancels"
    );

    // Subscriber topic must reflect member_addr, not creator.
    let topics = topics_of(&test_env.env, "subscription_cancelled").unwrap();
    let emitted_subscriber =
        Address::try_from_val(&test_env.env, &topics.get(2).unwrap()).unwrap();
    assert_eq!(emitted_subscriber, member_addr);
}

// ---------------------------------------------------------------------------
// Edge case: unknown group id returns NotFound (panics)
// ---------------------------------------------------------------------------

#[test]
#[should_panic]
fn test_cancel_subscription_unknown_group_panics() {
    let test_env = setup_test_env();
    let client = AutoShareContractClient::new(&test_env.env, &test_env.autoshare_contract);
    let caller = test_env.users.get(0).unwrap().clone();

    let mut id_bytes = [0u8; 32];
    id_bytes[0] = 0xff;
    let unknown_id = BytesN::from_array(&test_env.env, &id_bytes);

    // Must panic (NotFound) since the group was never created.
    client.cancel_subscription(&unknown_id, &caller);
}
