//! Tests for notification channel subscriptions:
//! - subscriber count view
//! - batch subscribe (partial failure safety)
//! - channel creator storage / query

use crate::base::errors::Error;
use crate::test_utils::setup_test_env;
use crate::AutoShareContractClient;

use soroban_sdk::{BytesN, String, Vec};

fn make_id(env: &soroban_sdk::Env, tag: u8) -> BytesN<32> {
    let mut bytes = [0u8; 32];
    bytes[0] = tag;
    BytesN::from_array(env, &bytes)
}

fn make_name(env: &soroban_sdk::Env, label: &str) -> String {
    String::from_str(env, label)
}

// ============================================================================
// Task 3 — Channel creator information
// ============================================================================

#[test]
fn test_create_channel_stores_creator() {
    let test_env = setup_test_env();
    let client = AutoShareContractClient::new(&test_env.env, &test_env.autoshare_contract);
    let creator = test_env.users.get(0).unwrap().clone();
    let id = make_id(&test_env.env, 1);

    client.create_channel(&id, &make_name(&test_env.env, "alerts"), &creator);

    let channel = client.get_channel(&id);
    assert_eq!(channel.creator, creator);
    assert_eq!(channel.subscriber_count, 0);
    assert!(channel.is_active);
    assert_eq!(client.get_channel_creator(&id), creator);
}

#[test]
fn test_get_channel_creator_not_found() {
    let test_env = setup_test_env();
    let client = AutoShareContractClient::new(&test_env.env, &test_env.autoshare_contract);
    let id = make_id(&test_env.env, 99);

    let result = client.try_get_channel_creator(&id);
    assert_eq!(result, Err(Ok(Error::NotFound)));
}

// ============================================================================
// Task 1 — Subscription count view
// ============================================================================

#[test]
fn test_subscriber_count_updates_on_subscribe_and_unsubscribe() {
    let test_env = setup_test_env();
    let client = AutoShareContractClient::new(&test_env.env, &test_env.autoshare_contract);
    let creator = test_env.users.get(0).unwrap().clone();
    let user_a = test_env.users.get(1).unwrap().clone();
    let user_b = test_env.users.get(2).unwrap().clone();
    let id = make_id(&test_env.env, 2);

    client.create_channel(&id, &make_name(&test_env.env, "news"), &creator);
    assert_eq!(client.get_subscriber_count(&id), 0);

    client.subscribe(&id, &user_a);
    assert_eq!(client.get_subscriber_count(&id), 1);
    assert!(client.is_channel_subscriber(&id, &user_a));

    client.subscribe(&id, &user_b);
    assert_eq!(client.get_subscriber_count(&id), 2);

    client.unsubscribe(&id, &user_a);
    assert_eq!(client.get_subscriber_count(&id), 1);
    assert!(!client.is_channel_subscriber(&id, &user_a));
    assert!(client.is_channel_subscriber(&id, &user_b));
}

#[test]
fn test_duplicate_subscribe_rejected_count_unchanged() {
    let test_env = setup_test_env();
    let client = AutoShareContractClient::new(&test_env.env, &test_env.autoshare_contract);
    let creator = test_env.users.get(0).unwrap().clone();
    let user = test_env.users.get(1).unwrap().clone();
    let id = make_id(&test_env.env, 3);

    client.create_channel(&id, &make_name(&test_env.env, "dup"), &creator);
    client.subscribe(&id, &user);
    assert_eq!(client.get_subscriber_count(&id), 1);

    let result = client.try_subscribe(&id, &user);
    assert_eq!(result, Err(Ok(Error::AlreadyExists)));
    assert_eq!(client.get_subscriber_count(&id), 1);
}

// ============================================================================
// Task 2 — Batch subscription
// ============================================================================

#[test]
fn test_batch_subscribe_multiple_channels() {
    let test_env = setup_test_env();
    let client = AutoShareContractClient::new(&test_env.env, &test_env.autoshare_contract);
    let creator = test_env.users.get(0).unwrap().clone();
    let subscriber = test_env.users.get(1).unwrap().clone();

    let id_a = make_id(&test_env.env, 10);
    let id_b = make_id(&test_env.env, 11);
    let id_c = make_id(&test_env.env, 12);

    client.create_channel(&id_a, &make_name(&test_env.env, "a"), &creator);
    client.create_channel(&id_b, &make_name(&test_env.env, "b"), &creator);
    client.create_channel(&id_c, &make_name(&test_env.env, "c"), &creator);

    let mut ids = Vec::new(&test_env.env);
    ids.push_back(id_a.clone());
    ids.push_back(id_b.clone());
    ids.push_back(id_c.clone());

    let result = client.batch_subscribe(&ids, &subscriber);
    assert_eq!(result.succeeded, 3);
    assert_eq!(result.failed, 0);
    assert_eq!(client.get_subscriber_count(&id_a), 1);
    assert_eq!(client.get_subscriber_count(&id_b), 1);
    assert_eq!(client.get_subscriber_count(&id_c), 1);
}

#[test]
fn test_batch_subscribe_partial_failure_does_not_corrupt_state() {
    let test_env = setup_test_env();
    let client = AutoShareContractClient::new(&test_env.env, &test_env.autoshare_contract);
    let creator = test_env.users.get(0).unwrap().clone();
    let subscriber = test_env.users.get(1).unwrap().clone();

    let good = make_id(&test_env.env, 20);
    let missing = make_id(&test_env.env, 21);
    let already = make_id(&test_env.env, 22);

    client.create_channel(&good, &make_name(&test_env.env, "good"), &creator);
    client.create_channel(&already, &make_name(&test_env.env, "already"), &creator);
    client.subscribe(&already, &subscriber);

    let mut ids = Vec::new(&test_env.env);
    ids.push_back(good.clone());
    ids.push_back(missing.clone()); // not found
    ids.push_back(already.clone()); // already subscribed

    let result = client.batch_subscribe(&ids, &subscriber);
    assert_eq!(result.succeeded, 1);
    assert_eq!(result.failed, 2);

    // Successful subscription applied.
    assert_eq!(client.get_subscriber_count(&good), 1);
    assert!(client.is_channel_subscriber(&good, &subscriber));

    // Failed entries left prior state intact.
    assert_eq!(client.get_subscriber_count(&already), 1);
    let missing_count = client.try_get_subscriber_count(&missing);
    assert_eq!(missing_count, Err(Ok(Error::NotFound)));
}

#[test]
fn test_batch_subscribe_empty_rejected() {
    let test_env = setup_test_env();
    let client = AutoShareContractClient::new(&test_env.env, &test_env.autoshare_contract);
    let subscriber = test_env.users.get(0).unwrap().clone();
    let empty = Vec::new(&test_env.env);

    let result = client.try_batch_subscribe(&empty, &subscriber);
    assert_eq!(result, Err(Ok(Error::InvalidInput)));
}

#[test]
fn test_batch_subscribe_too_large_rejected() {
    let test_env = setup_test_env();
    let client = AutoShareContractClient::new(&test_env.env, &test_env.autoshare_contract);
    let subscriber = test_env.users.get(0).unwrap().clone();

    let mut ids = Vec::new(&test_env.env);
    for i in 0u8..51 {
        ids.push_back(make_id(&test_env.env, i.wrapping_add(1)));
    }

    let result = client.try_batch_subscribe(&ids, &subscriber);
    assert_eq!(result, Err(Ok(Error::BatchTooLarge)));
}
