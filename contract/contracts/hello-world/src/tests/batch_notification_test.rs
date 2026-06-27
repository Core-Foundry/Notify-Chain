//! Tests for batch notification creation (AGENTS.md — Batch Notifications).
//!
//! Acceptance criteria verified here:
//! - Multiple notifications can be created in a single transaction.
//! - Invalid recipients / inputs are handled appropriately.
//! - A `BatchNotificationsCreated` summary event is emitted.
//! - Individual `NotificationScheduled` events are emitted for each notification.
//! - The contract is paused-aware.
//! - Edge cases: empty batch, mismatched lengths, duplicate ids, batch too large.

use crate::base::events::{NotificationCategory, NotificationPriority};
use crate::test_utils::setup_test_env;
use crate::AutoShareContractClient;

use soroban_sdk::testutils::{Address as _, Events, Ledger};
use soroban_sdk::{BytesN, Env, String, Symbol, TryFromVal, Val, Vec};

const ONE_HOUR: u64 = 3_600;

fn make_title(env: &Env) -> String {
    String::from_str(env, "Test Notification")
}

fn make_id(env: &Env, tag: u8) -> BytesN<32> {
    let mut bytes = [0u8; 32];
    bytes[0] = tag;
    BytesN::from_array(env, &bytes)
}

fn set_now(env: &Env, ts: u64) {
    env.ledger().set_timestamp(ts);
}

/// Count how many events named `event_name` were emitted.
fn count_events(env: &soroban_sdk::Env, event_name: &str) -> u32 {
    let target = Symbol::new(env, event_name);
    let mut n = 0u32;
    for (_addr, topics, _data) in env.events().all().iter() {
        if topics.is_empty() {
            continue;
        }
        let first = topics.get(0).unwrap();
        if let Ok(name) = Symbol::try_from_val(env, &first) {
            if name == target {
                n += 1;
            }
        }
    }
    n
}

/// Returns the topics of the most recently emitted event matching `event_name`.
fn topics_of(env: &soroban_sdk::Env, event_name: &str) -> Option<Vec<Val>> {
    let target = Symbol::new(env, event_name);
    let mut found: Option<Vec<Val>> = None;
    for (_addr, topics, _data) in env.events().all().iter() {
        if topics.is_empty() {
            continue;
        }
        let first = topics.get(0).unwrap();
        if let Ok(name) = Symbol::try_from_val(env, &first) {
            if name == target {
                found = Some(topics);
            }
        }
    }
    found
}

// ============================================================================
// Happy-path tests
// ============================================================================

#[test]
fn test_batch_creates_all_notifications() {
    let test_env = setup_test_env();
    let client = AutoShareContractClient::new(&test_env.env, &test_env.autoshare_contract);
    let creator = test_env.users.get(0).unwrap().clone();

    set_now(&test_env.env, 1_000);

    let mut ids: Vec<BytesN<32>> = Vec::new(&test_env.env);
    let mut ttls: Vec<u64> = Vec::new(&test_env.env);
    let mut titles: Vec<String> = Vec::new(&test_env.env);
    for i in 1u8..=5 {
        ids.push_back(make_id(&test_env.env, i));
        ttls.push_back(ONE_HOUR);
        titles.push_back(make_title(&test_env.env));
    }

    client.batch_schedule_notifications(&ids, &creator, &ttls, &titles);

    // Each notification must be stored and not yet expired.
    for i in 1u8..=5 {
        let id = make_id(&test_env.env, i);
        let stored = client.get_notification(&id);
        assert_eq!(stored.creator, creator);
        assert_eq!(stored.created_at, 1_000);
        assert_eq!(stored.expires_at, 1_000 + ONE_HOUR);
        assert!(!client.is_notification_expired(&id));
    }
}

#[test]
fn test_batch_emits_per_notification_events() {
    let test_env = setup_test_env();
    let client = AutoShareContractClient::new(&test_env.env, &test_env.autoshare_contract);
    let creator = test_env.users.get(0).unwrap().clone();

    let mut ids: Vec<BytesN<32>> = Vec::new(&test_env.env);
    let mut ttls: Vec<u64> = Vec::new(&test_env.env);
    let mut titles: Vec<String> = Vec::new(&test_env.env);
    for i in 10u8..=13 {
        ids.push_back(make_id(&test_env.env, i));
        ttls.push_back(ONE_HOUR);
        titles.push_back(make_title(&test_env.env));
    }

    client.batch_schedule_notifications(&ids, &creator, &ttls, &titles);

    // 4 individual NotificationScheduled events must have been emitted.
    assert_eq!(count_events(&test_env.env, "notification_scheduled"), 4);
}

#[test]
fn test_batch_emits_summary_event() {
    let test_env = setup_test_env();
    let client = AutoShareContractClient::new(&test_env.env, &test_env.autoshare_contract);
    let creator = test_env.users.get(0).unwrap().clone();

    let mut ids: Vec<BytesN<32>> = Vec::new(&test_env.env);
    let mut ttls: Vec<u64> = Vec::new(&test_env.env);
    let mut titles: Vec<String> = Vec::new(&test_env.env);
    for i in 20u8..=22 {
        ids.push_back(make_id(&test_env.env, i));
        ttls.push_back(ONE_HOUR * 2);
        titles.push_back(make_title(&test_env.env));
    }

    client.batch_schedule_notifications(&ids, &creator, &ttls, &titles);

    // The summary event must exist.
    assert!(
        topics_of(&test_env.env, "batch_notifications_created").is_some(),
        "batch_notifications_created event must be emitted"
    );
}

#[test]
fn test_batch_summary_event_has_notification_category() {
    let test_env = setup_test_env();
    let client = AutoShareContractClient::new(&test_env.env, &test_env.autoshare_contract);
    let creator = test_env.users.get(0).unwrap().clone();

    let mut ids: Vec<BytesN<32>> = Vec::new(&test_env.env);
    let mut ttls: Vec<u64> = Vec::new(&test_env.env);
    let mut titles: Vec<String> = Vec::new(&test_env.env);
    for i in 30u8..=31 {
        ids.push_back(make_id(&test_env.env, i));
        ttls.push_back(ONE_HOUR);
        titles.push_back(make_title(&test_env.env));
    }

    client.batch_schedule_notifications(&ids, &creator, &ttls, &titles);

    let topics = topics_of(&test_env.env, "batch_notifications_created").unwrap();
    // topics: [0] name, [1] creator, [2] category, [3] priority
    assert_eq!(topics.len(), 4);

    let category =
        NotificationCategory::try_from_val(&test_env.env, &topics.get(2).unwrap()).unwrap();
    assert_eq!(category, NotificationCategory::Notification);

    let priority =
        NotificationPriority::try_from_val(&test_env.env, &topics.get(3).unwrap()).unwrap();
    assert_eq!(priority, NotificationPriority::Medium);
}

#[test]
fn test_batch_single_notification() {
    let test_env = setup_test_env();
    let client = AutoShareContractClient::new(&test_env.env, &test_env.autoshare_contract);
    let creator = test_env.users.get(0).unwrap().clone();

    let mut ids: Vec<BytesN<32>> = Vec::new(&test_env.env);
    let mut ttls: Vec<u64> = Vec::new(&test_env.env);
    let mut titles: Vec<String> = Vec::new(&test_env.env);
    ids.push_back(make_id(&test_env.env, 40));
    ttls.push_back(ONE_HOUR);
    titles.push_back(make_title(&test_env.env));

    // A batch of one is valid.
    client.batch_schedule_notifications(&ids, &creator, &ttls, &titles);

    assert!(client
        .try_get_notification(&make_id(&test_env.env, 40))
        .is_ok());
}

#[test]
fn test_batch_notifications_expire_correctly() {
    let test_env = setup_test_env();
    let client = AutoShareContractClient::new(&test_env.env, &test_env.autoshare_contract);
    let creator = test_env.users.get(0).unwrap().clone();

    set_now(&test_env.env, 500);

    let mut ids: Vec<BytesN<32>> = Vec::new(&test_env.env);
    let mut ttls: Vec<u64> = Vec::new(&test_env.env);
    let mut titles: Vec<String> = Vec::new(&test_env.env);
    for i in 50u8..=52 {
        ids.push_back(make_id(&test_env.env, i));
        ttls.push_back(ONE_HOUR);
        titles.push_back(make_title(&test_env.env));
    }

    client.batch_schedule_notifications(&ids, &creator, &ttls, &titles);

    // Not yet expired.
    set_now(&test_env.env, 500 + ONE_HOUR - 1);
    for i in 50u8..=52 {
        assert!(!client.is_notification_expired(&make_id(&test_env.env, i)));
    }

    // At deadline all are expired.
    set_now(&test_env.env, 500 + ONE_HOUR);
    for i in 50u8..=52 {
        assert!(client.is_notification_expired(&make_id(&test_env.env, i)));
    }
}

// ============================================================================
// Validation / rejection tests
// ============================================================================

#[test]
fn test_batch_empty_ids_rejected() {
    let test_env = setup_test_env();
    let client = AutoShareContractClient::new(&test_env.env, &test_env.autoshare_contract);
    let creator = test_env.users.get(0).unwrap().clone();

    let ids: Vec<BytesN<32>> = Vec::new(&test_env.env);
    let ttls: Vec<u64> = Vec::new(&test_env.env);
    let titles: Vec<String> = Vec::new(&test_env.env);

    let result = client.try_batch_schedule_notifications(&ids, &creator, &ttls, &titles);
    assert!(result.is_err(), "empty batch must be rejected");
}

#[test]
fn test_batch_mismatched_lengths_rejected() {
    let test_env = setup_test_env();
    let client = AutoShareContractClient::new(&test_env.env, &test_env.autoshare_contract);
    let creator = test_env.users.get(0).unwrap().clone();

    let mut ids: Vec<BytesN<32>> = Vec::new(&test_env.env);
    let mut ttls: Vec<u64> = Vec::new(&test_env.env);
    let mut titles: Vec<String> = Vec::new(&test_env.env);
    ids.push_back(make_id(&test_env.env, 60));
    ids.push_back(make_id(&test_env.env, 61));
    ttls.push_back(ONE_HOUR); // Only 1 ttl for 2 ids.
    titles.push_back(make_title(&test_env.env));

    let result = client.try_batch_schedule_notifications(&ids, &creator, &ttls, &titles);
    assert!(result.is_err(), "mismatched lengths must be rejected");
}

#[test]
fn test_batch_zero_ttl_rejected() {
    let test_env = setup_test_env();
    let client = AutoShareContractClient::new(&test_env.env, &test_env.autoshare_contract);
    let creator = test_env.users.get(0).unwrap().clone();

    let mut ids: Vec<BytesN<32>> = Vec::new(&test_env.env);
    let mut ttls: Vec<u64> = Vec::new(&test_env.env);
    let mut titles: Vec<String> = Vec::new(&test_env.env);
    ids.push_back(make_id(&test_env.env, 70));
    ttls.push_back(0); // Zero TTL is invalid.
    titles.push_back(make_title(&test_env.env));

    let result = client.try_batch_schedule_notifications(&ids, &creator, &ttls, &titles);
    assert!(result.is_err(), "zero TTL in batch must be rejected");
}

#[test]
fn test_batch_duplicate_id_rejected() {
    let test_env = setup_test_env();
    let client = AutoShareContractClient::new(&test_env.env, &test_env.autoshare_contract);
    let creator = test_env.users.get(0).unwrap().clone();

    let dup_id = make_id(&test_env.env, 80);

    let mut ids: Vec<BytesN<32>> = Vec::new(&test_env.env);
    let mut ttls: Vec<u64> = Vec::new(&test_env.env);
    let mut titles: Vec<String> = Vec::new(&test_env.env);
    ids.push_back(dup_id.clone());
    ids.push_back(dup_id.clone()); // Duplicate.
    ttls.push_back(ONE_HOUR);
    ttls.push_back(ONE_HOUR);
    titles.push_back(make_title(&test_env.env));
    titles.push_back(make_title(&test_env.env));

    let result = client.try_batch_schedule_notifications(&ids, &creator, &ttls, &titles);
    assert!(result.is_err(), "duplicate ids in batch must be rejected");
}

#[test]
fn test_batch_id_already_scheduled_rejected() {
    let test_env = setup_test_env();
    let client = AutoShareContractClient::new(&test_env.env, &test_env.autoshare_contract);
    let creator = test_env.users.get(0).unwrap().clone();

    let id = make_id(&test_env.env, 90);

    // Schedule the id individually first.
    client.schedule_notification(&id, &creator, &ONE_HOUR, &make_title(&test_env.env));

    // Now try to include it in a batch — must be rejected (AlreadyExists).
    let mut ids: Vec<BytesN<32>> = Vec::new(&test_env.env);
    let mut ttls: Vec<u64> = Vec::new(&test_env.env);
    let mut titles: Vec<String> = Vec::new(&test_env.env);
    ids.push_back(id);
    ttls.push_back(ONE_HOUR);
    titles.push_back(make_title(&test_env.env));

    let result = client.try_batch_schedule_notifications(&ids, &creator, &ttls, &titles);
    assert!(
        result.is_err(),
        "batch must be rejected when an id is already scheduled"
    );
}

#[test]
fn test_batch_all_or_nothing_on_validation_failure() {
    // If any entry in the batch fails validation, none should be persisted.
    let test_env = setup_test_env();
    let client = AutoShareContractClient::new(&test_env.env, &test_env.autoshare_contract);
    let creator = test_env.users.get(0).unwrap().clone();

    let good_id = make_id(&test_env.env, 100);
    let bad_id = make_id(&test_env.env, 101);

    // Pre-schedule the bad id so it will collide.
    client.schedule_notification(&bad_id, &creator, &ONE_HOUR, &make_title(&test_env.env));

    let mut ids: Vec<BytesN<32>> = Vec::new(&test_env.env);
    let mut ttls: Vec<u64> = Vec::new(&test_env.env);
    let mut titles: Vec<String> = Vec::new(&test_env.env);
    ids.push_back(good_id.clone());
    ids.push_back(bad_id.clone()); // Will cause AlreadyExists.
    ttls.push_back(ONE_HOUR);
    ttls.push_back(ONE_HOUR);
    titles.push_back(make_title(&test_env.env));
    titles.push_back(make_title(&test_env.env));

    let result = client.try_batch_schedule_notifications(&ids, &creator, &ttls, &titles);
    assert!(result.is_err(), "batch must fail");

    // The good_id must NOT have been persisted (all-or-nothing).
    assert!(
        client.try_get_notification(&good_id).is_err(),
        "good_id must not be stored when batch is rejected"
    );
}

#[test]
fn test_batch_exceeding_max_size_rejected() {
    let test_env = setup_test_env();
    let client = AutoShareContractClient::new(&test_env.env, &test_env.autoshare_contract);
    let creator = test_env.users.get(0).unwrap().clone();

    // MAX_BATCH_SIZE is 50; try 51.
    let mut ids: Vec<BytesN<32>> = Vec::new(&test_env.env);
    let mut ttls: Vec<u64> = Vec::new(&test_env.env);
    let mut titles: Vec<String> = Vec::new(&test_env.env);
    for i in 0u8..51 {
        let mut bytes = [0u8; 32];
        bytes[0] = i;
        bytes[1] = 200; // Namespace to avoid collision with other tests.
        ids.push_back(BytesN::from_array(&test_env.env, &bytes));
        ttls.push_back(ONE_HOUR);
        titles.push_back(make_title(&test_env.env));
    }

    let result = client.try_batch_schedule_notifications(&ids, &creator, &ttls, &titles);
    assert!(result.is_err(), "batch exceeding max size must be rejected");
}

#[test]
fn test_batch_exactly_max_size_accepted() {
    let test_env = setup_test_env();
    let client = AutoShareContractClient::new(&test_env.env, &test_env.autoshare_contract);
    let creator = test_env.users.get(0).unwrap().clone();

    // MAX_BATCH_SIZE is 50 — exactly 50 entries must succeed.
    let mut ids: Vec<BytesN<32>> = Vec::new(&test_env.env);
    let mut ttls: Vec<u64> = Vec::new(&test_env.env);
    let mut titles: Vec<String> = Vec::new(&test_env.env);
    for i in 0u8..50 {
        let mut bytes = [0u8; 32];
        bytes[0] = i;
        bytes[1] = 201; // Namespace to avoid collision with other tests.
        ids.push_back(BytesN::from_array(&test_env.env, &bytes));
        ttls.push_back(ONE_HOUR);
        titles.push_back(make_title(&test_env.env));
    }

    // Must not panic.
    client.batch_schedule_notifications(&ids, &creator, &ttls, &titles);

    // Summary event must be present.
    assert!(
        topics_of(&test_env.env, "batch_notifications_created").is_some(),
        "summary event must be emitted for max-size batch"
    );
}

// ============================================================================
// Pause guard
// ============================================================================

#[test]
fn test_batch_blocked_when_contract_paused() {
    let test_env = setup_test_env();
    let client = AutoShareContractClient::new(&test_env.env, &test_env.autoshare_contract);
    let creator = test_env.users.get(0).unwrap().clone();

    client.pause(&test_env.admin);

    let mut ids: Vec<BytesN<32>> = Vec::new(&test_env.env);
    let mut ttls: Vec<u64> = Vec::new(&test_env.env);
    let mut titles: Vec<String> = Vec::new(&test_env.env);
    ids.push_back(make_id(&test_env.env, 110));
    ttls.push_back(ONE_HOUR);
    titles.push_back(make_title(&test_env.env));

    let result = client.try_batch_schedule_notifications(&ids, &creator, &ttls, &titles);
    assert!(
        result.is_err(),
        "batch must be rejected while contract is paused"
    );
}
