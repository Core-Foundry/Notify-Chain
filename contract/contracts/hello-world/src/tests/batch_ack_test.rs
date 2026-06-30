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

    client.schedule_notification(&id1, &creator, &ONE_HOUR);
    client.schedule_notification(&id2, &creator, &ONE_HOUR);
    client.schedule_notification(&id3, &creator, &ONE_HOUR);

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
    client.schedule_notification(&id1, &creator, &ONE_HOUR);

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
    client.schedule_notification(&id1, &creator, &ONE_HOUR);

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
    client.schedule_notification(&id1, &creator, &ONE_HOUR);

    set_now(&test_env.env, 1_000 + ONE_HOUR + 1);

    let mut batch = Vec::new(&test_env.env);
    batch.push_back(id1.clone());

    // Fails because notification is expired
    client.acknowledge_notifications(&creator, &batch);
}

#[test]
fn benchmark_gas_usage() {
    let env_single = Env::default();
    env_single.mock_all_auths();
    env_single.cost_estimate().budget().reset_unlimited();

    let client_single = AutoShareContractClient::new(
        &env_single,
        &env_single.register_contract(None, crate::AutoShareContract),
    );
    let creator_single = Address::generate(&env_single);
    client_single.initialize_admin(&Address::generate(&env_single));

    set_now(&env_single, 1_000);

    let mut ids_single = Vec::new(&env_single);
    for i in 0..10u8 {
        let id = make_id(&env_single, i);
        client_single.schedule_notification(&id, &creator_single, &ONE_HOUR);
        ids_single.push_back(id);
    }

    let start_cpu_single = env_single
        .cost_estimate()
        .budget()
        .get_cpu_instruction_cost();
    for id in ids_single.iter() {
        let mut single_batch = Vec::new(&env_single);
        single_batch.push_back(id);
        client_single.acknowledge_notifications(&creator_single, &single_batch);
    }
    let end_cpu_single = env_single
        .cost_estimate()
        .budget()
        .get_cpu_instruction_cost();
    let single_cost = end_cpu_single - start_cpu_single;

    let env_batch = Env::default();
    env_batch.mock_all_auths();
    env_batch.cost_estimate().budget().reset_unlimited();

    let client_batch = AutoShareContractClient::new(
        &env_batch,
        &env_batch.register_contract(None, crate::AutoShareContract),
    );
    let creator_batch = Address::generate(&env_batch);
    client_batch.initialize_admin(&Address::generate(&env_batch));

    set_now(&env_batch, 1_000);

    let mut ids_batch = Vec::new(&env_batch);
    for i in 0..10u8 {
        let id = make_id(&env_batch, i);
        client_batch.schedule_notification(&id, &creator_batch, &ONE_HOUR);
        ids_batch.push_back(id);
    }

    let start_cpu_batch = env_batch
        .cost_estimate()
        .budget()
        .get_cpu_instruction_cost();
    client_batch.acknowledge_notifications(&creator_batch, &ids_batch);
    let end_cpu_batch = env_batch
        .cost_estimate()
        .budget()
        .get_cpu_instruction_cost();
    let batch_cost = end_cpu_batch - start_cpu_batch;

    // Batch cost should be significantly less than running 10 separate transactions
    assert!(
        batch_cost < single_cost,
        "Batch cost ({}) should be less than individual cost ({})",
        batch_cost,
        single_cost
    );
}
