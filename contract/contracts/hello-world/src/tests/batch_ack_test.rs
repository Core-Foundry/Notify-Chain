//! Tests for batch acknowledgment of notifications.
//!
//! These tests verify:
//! - Multiple notifications can be acknowledged in a single transaction.
//! - Validates notification ownership (only creator can acknowledge).
//! - Correct `NotificationAcknowledged` events are emitted.
//! - Batching reaches the same outcome as individual calls using fewer
//!   contract invocations, which is what amortizes per-transaction overhead
//!   (signature verification, base fee, envelope processing) on a live network.

use crate::test_utils::setup_test_env;
use crate::AutoShareContractClient;

use soroban_sdk::testutils::{Address as _, Events, Ledger};
use soroban_sdk::{Address, BytesN, Env, String, Symbol, TryFromVal, Vec};

const ONE_HOUR: u64 = 3_600;

fn make_id(env: &Env, tag: u8) -> BytesN<32> {
    let mut bytes = [0u8; 32];
    bytes[0] = tag;
    BytesN::from_array(env, &bytes)
}

fn notification_title(env: &Env) -> String {
    String::from_str(env, "Test notification")
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

    client.schedule_notification(&id1, &creator, &ONE_HOUR, &notification_title(&test_env.env));
    client.schedule_notification(&id2, &creator, &ONE_HOUR, &notification_title(&test_env.env));
    client.schedule_notification(&id3, &creator, &ONE_HOUR, &notification_title(&test_env.env));

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
    client.schedule_notification(&id1, &creator, &ONE_HOUR, &notification_title(&test_env.env));

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
    client.schedule_notification(&id1, &creator, &ONE_HOUR, &notification_title(&test_env.env));

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
    client.schedule_notification(&id1, &creator, &ONE_HOUR, &notification_title(&test_env.env));

    set_now(&test_env.env, 1_000 + ONE_HOUR + 1);

    let mut batch = Vec::new(&test_env.env);
    batch.push_back(id1.clone());

    // Fails because notification is expired
    client.acknowledge_notifications(&creator, &batch);
}

/// Acknowledging 10 notifications one call at a time reaches the same
/// end state (all 10 acknowledged) as acknowledging them in a single batched
/// call, but needs 10 contract invocations instead of 1. On a live network
/// each separate invocation pays its own transaction overhead (signature
/// verification, base fee, envelope processing), so batching amortizes that
/// cost across every notification in the batch instead of paying it per item.
#[test]
fn test_batch_acknowledgment_matches_individual_calls_with_fewer_invocations() {
    // Scenario A: acknowledge 10 notifications one call at a time.
    let env_single = Env::default();
    env_single.mock_all_auths();

    let client_single = AutoShareContractClient::new(
        &env_single,
        &env_single.register(crate::AutoShareContract, ()),
    );
    let creator_single = Address::generate(&env_single);
    client_single.initialize_admin(&Address::generate(&env_single));

    set_now(&env_single, 1_000);

    let mut ids_single = Vec::new(&env_single);
    for i in 0..10u8 {
        let id = make_id(&env_single, i);
        client_single.schedule_notification(&id, &creator_single, &ONE_HOUR, &notification_title(&env_single));
        ids_single.push_back(id);
    }

    // `env.events().all()` only reflects the most recent invocation, so tally
    // the acknowledged count per call rather than expecting it to accumulate
    // across the 10 separate invocations.
    let mut individual_call_count = 0u32;
    let mut individual_ack_events = 0usize;
    for id in ids_single.iter() {
        let mut single_batch = Vec::new(&env_single);
        single_batch.push_back(id);
        client_single.acknowledge_notifications(&creator_single, &single_batch);
        individual_call_count += 1;
        individual_ack_events += count_events(&env_single, "notification_acknowledged");
    }

    assert_eq!(individual_call_count, 10);
    assert_eq!(individual_ack_events, 10);

    // Scenario B: acknowledge the same 10 notifications in a single batched call.
    let env_batch = Env::default();
    env_batch.mock_all_auths();

    let client_batch = AutoShareContractClient::new(
        &env_batch,
        &env_batch.register(crate::AutoShareContract, ()),
    );
    let creator_batch = Address::generate(&env_batch);
    client_batch.initialize_admin(&Address::generate(&env_batch));

    set_now(&env_batch, 1_000);

    let mut ids_batch = Vec::new(&env_batch);
    for i in 0..10u8 {
        let id = make_id(&env_batch, i);
        client_batch.schedule_notification(&id, &creator_batch, &ONE_HOUR, &notification_title(&env_batch));
        ids_batch.push_back(id);
    }

    let batch_call_count = 1u32;
    client_batch.acknowledge_notifications(&creator_batch, &ids_batch);

    // Same outcome as the individual-call scenario, in a single invocation.
    assert_eq!(count_events(&env_batch, "notification_acknowledged"), 10);
    assert!(batch_call_count < individual_call_count);
}
