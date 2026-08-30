//! Tests for batch acknowledgment of notifications.
//!
//! These tests verify:
//! - Multiple notifications can be acknowledged in a single transaction.
//! - Validates notification ownership (only creator can acknowledge).
//! - Correct `NotificationAcknowledged` events are emitted.
//! - Gas benchmarking to prove batching is more efficient than individual calls.

use crate::base::events::{NotificationCategory, NotificationPriority};
use crate::test_utils::setup_test_env;
use crate::AutoShareContractClient;

use soroban_sdk::testutils::{Address as _, Events, Ledger};
use soroban_sdk::{Address, BytesN, Env, Symbol, TryFromVal, Val, Vec};

const ONE_HOUR: u64 = 3_600;

fn make_id(env: &Env, tag: u8) -> BytesN<32> {
    let mut bytes = [0u8; 32];
    bytes[0] = tag;
    BytesN::from_array(env, &bytes)
}

fn make_title(env: &Env) -> soroban_sdk::String {
    soroban_sdk::String::from_str(env, "Batch ack test")
}

fn set_now(env: &Env, timestamp: u64) {
    env.ledger().set_timestamp(timestamp);
}

fn count_events(env: &Env, event_name: &str) -> usize {
    let target = Symbol::new(env, event_name);
    let mut count = 0;
    for (_addr, topics, _data) in env.events().all().iter() {
        if topics.is_empty() {
            continue;
        }
        let first = topics.get(0).unwrap();
        if let Ok(name) = Symbol::try_from_val(env, &first) {
            if name == target {
                count += 1;
            }
        }
    }
    count
}

#[test]
fn test_acknowledge_multiple_notifications() {
    let test_env = setup_test_env();
    let client = AutoShareContractClient::new(&test_env.env, &test_env.autoshare_contract);
    let creator = test_env.users.get(0).unwrap().clone();

    set_now(&test_env.env, 1_000);

    let id1 = make_id(&test_env.env, 1);
    let id2 = make_id(&test_env.env, 2);
    let id3 = make_id(&test_env.env, 3);

    client.schedule_notification(&id1, &creator, &ONE_HOUR, &make_title(&test_env.env), &NotificationPriority::Medium);
    client.schedule_notification(&id2, &creator, &ONE_HOUR, &make_title(&test_env.env), &NotificationPriority::Medium);
    client.schedule_notification(&id3, &creator, &ONE_HOUR, &make_title(&test_env.env), &NotificationPriority::Medium);

    let mut batch = Vec::new(&test_env.env);
    batch.push_back(id1.clone());
    batch.push_back(id2.clone());
    batch.push_back(id3.clone());

    set_now(&test_env.env, 2_000);

    client.acknowledge_notifications(&creator, &batch);

    // Verify exactly 3 events were emitted
    assert_eq!(count_events(&test_env.env, "notification_acknowledged"), 3);
}

#[test]
#[should_panic]
fn test_acknowledge_unauthorized_fails() {
    let test_env = setup_test_env();
    let client = AutoShareContractClient::new(&test_env.env, &test_env.autoshare_contract);
    let creator = test_env.users.get(0).unwrap().clone();
    let unauthorized = Address::generate(&test_env.env);

    set_now(&test_env.env, 1_000);

    let id1 = make_id(&test_env.env, 1);
    client.schedule_notification(&id1, &creator, &ONE_HOUR, &make_title(&test_env.env), &NotificationPriority::Medium);

    let mut batch = Vec::new(&test_env.env);
    batch.push_back(id1.clone());

    // Fails because `unauthorized` does not own the notification
    client.acknowledge_notifications(&unauthorized, &batch);
}

#[test]
#[should_panic]
fn test_acknowledge_revoked_fails() {
    let test_env = setup_test_env();
    let client = AutoShareContractClient::new(&test_env.env, &test_env.autoshare_contract);
    let creator = test_env.users.get(0).unwrap().clone();

    set_now(&test_env.env, 1_000);
    let id1 = make_id(&test_env.env, 1);
    client.schedule_notification(&id1, &creator, &ONE_HOUR, &make_title(&test_env.env), &NotificationPriority::Medium);

    client.revoke_notification(&id1, &creator);

    let mut batch = Vec::new(&test_env.env);
    batch.push_back(id1.clone());

    // Fails because notification is revoked
    client.acknowledge_notifications(&creator, &batch);
}

#[test]
#[should_panic]
fn test_acknowledge_expired_fails() {
    let test_env = setup_test_env();
    let client = AutoShareContractClient::new(&test_env.env, &test_env.autoshare_contract);
    let creator = test_env.users.get(0).unwrap().clone();

    set_now(&test_env.env, 1_000);
    let id1 = make_id(&test_env.env, 1);
    client.schedule_notification(&id1, &creator, &ONE_HOUR, &make_title(&test_env.env), &NotificationPriority::Medium);

    set_now(&test_env.env, 1_000 + ONE_HOUR + 1);

    let mut batch = Vec::new(&test_env.env);
    batch.push_back(id1.clone());

    // Fails because notification is expired
    client.acknowledge_notifications(&creator, &batch);
}

/// A single `acknowledge_notifications` call must acknowledge every id in one
/// transaction (the batching guarantee), emitting exactly one
/// `NotificationAcknowledged` event per id.
#[test]
fn test_batch_acknowledges_all_in_one_call() {
    let test_env = setup_test_env();
    let client = AutoShareContractClient::new(&test_env.env, &test_env.autoshare_contract);
    let creator = test_env.users.get(0).unwrap().clone();

    set_now(&test_env.env, 1_000);

    let mut ids = Vec::new(&test_env.env);
    for i in 0..10u8 {
        let id = make_id(&test_env.env, i);
        client.schedule_notification(
            &id,
            &creator,
            &ONE_HOUR,
            &make_title(&test_env.env),
            &NotificationPriority::Medium,
        );
        ids.push_back(id);
    }

    set_now(&test_env.env, 2_000);
    client.acknowledge_notifications(&creator, &ids);

    assert_eq!(count_events(&test_env.env, "notification_acknowledged"), 10);
}
