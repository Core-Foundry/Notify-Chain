//! Tests for the on-chain audit logging system (AGENTS.md — Audit Logging).
//!
//! Acceptance criteria verified here:
//! - All lifecycle events are recorded (creation, delivery attempt, delivery
//!   failure, acknowledgment, cancellation, expiry).
//! - Audit records are searchable by notification id.
//! - Logs remain immutable after creation (records only grow, never shrink).
//! - An `AuditRecordAppended` event is emitted for every appended record.
//! - Records carry the correct `seq`, `action`, `actor`, and `timestamp`.

use crate::base::events::{AuditAction, NotificationCategory};
use crate::test_utils::setup_test_env;
use crate::AutoShareContractClient;

use soroban_sdk::testutils::{Address as _, Events, Ledger};
use soroban_sdk::{BytesN, Env, String, Symbol, TryFromVal, Val, Vec};

const ONE_HOUR: u64 = 3_600;

fn make_title(env: &Env) -> soroban_sdk::String {
    soroban_sdk::String::from_str(env, "Test Notification")
}

fn make_id(env: &Env, tag: u8) -> BytesN<32> {
    let mut bytes = [0u8; 32];
    bytes[0] = tag;
    BytesN::from_array(env, &bytes)
}

fn set_now(env: &Env, ts: u64) {
    env.ledger().set_timestamp(ts);
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
// Creation audit record
// ============================================================================

#[test]
fn test_schedule_notification_creates_audit_record() {
    let test_env = setup_test_env();
    let client = AutoShareContractClient::new(&test_env.env, &test_env.autoshare_contract);
    let creator = test_env.users.get(0).unwrap().clone();

    set_now(&test_env.env, 1_000);
    let id = make_id(&test_env.env, 1);
    client.schedule_notification(&id, &creator, &ONE_HOUR, &make_title(&test_env.env));

    let records = client.get_audit_log();
    assert_eq!(records.len(), 1);

    let r = records.get(0).unwrap();
    assert_eq!(r.seq, 1);
    assert_eq!(r.notification_id, id);
    assert_eq!(r.action, AuditAction::Created);
    assert_eq!(r.actor, creator);
    assert_eq!(r.timestamp, 1_000);
}

#[test]
fn test_schedule_notification_emits_audit_event() {
    let test_env = setup_test_env();
    let client = AutoShareContractClient::new(&test_env.env, &test_env.autoshare_contract);
    let creator = test_env.users.get(0).unwrap().clone();

    let id = make_id(&test_env.env, 2);
    client.schedule_notification(&id, &creator, &ONE_HOUR, &make_title(&test_env.env));

    let topics =
        topics_of(&test_env.env, "audit_record_appended").expect("audit event must be emitted");

    // topics: [0] name, [1] notification_id, [2] action, [3] category
    assert_eq!(topics.len(), 4);

    let topic_id = BytesN::<32>::try_from_val(&test_env.env, &topics.get(1).unwrap()).unwrap();
    assert_eq!(topic_id, id);

    let action = AuditAction::try_from_val(&test_env.env, &topics.get(2).unwrap()).unwrap();
    assert_eq!(action, AuditAction::Created);

    let category =
        NotificationCategory::try_from_val(&test_env.env, &topics.get(3).unwrap()).unwrap();
    assert_eq!(category, NotificationCategory::Notification);
}

// ============================================================================
// Delivery attempt / failure audit records
// ============================================================================

#[test]
fn test_delivery_attempt_recorded() {
    let test_env = setup_test_env();
    let client = AutoShareContractClient::new(&test_env.env, &test_env.autoshare_contract);
    let creator = test_env.users.get(0).unwrap().clone();
    let relay = test_env.users.get(1).unwrap().clone();

    let id = make_id(&test_env.env, 10);
    client.schedule_notification(&id, &creator, &ONE_HOUR, &make_title(&test_env.env));
    client.record_delivery_attempt(&id, &relay);

    let records = client.get_notification_audit(&id);
    assert_eq!(records.len(), 2);

    let attempt = records.get(1).unwrap();
    assert_eq!(attempt.action, AuditAction::DeliveryAttempt);
    assert_eq!(attempt.actor, relay);
}

#[test]
fn test_delivery_failure_recorded() {
    let test_env = setup_test_env();
    let client = AutoShareContractClient::new(&test_env.env, &test_env.autoshare_contract);
    let creator = test_env.users.get(0).unwrap().clone();
    let relay = test_env.users.get(1).unwrap().clone();

    let id = make_id(&test_env.env, 11);
    client.schedule_notification(&id, &creator, &ONE_HOUR, &make_title(&test_env.env));
    client.record_delivery_attempt(&id, &relay);
    client.record_delivery_failure(&id, &relay);

    let records = client.get_notification_audit(&id);
    assert_eq!(records.len(), 3);

    let failure = records.get(2).unwrap();
    assert_eq!(failure.action, AuditAction::DeliveryFailed);
    assert_eq!(failure.actor, relay);
}

// ============================================================================
// Acknowledgment audit record
// ============================================================================

#[test]
fn test_acknowledgment_recorded() {
    let test_env = setup_test_env();
    let client = AutoShareContractClient::new(&test_env.env, &test_env.autoshare_contract);
    let creator = test_env.users.get(0).unwrap().clone();
    let recipient = test_env.users.get(2).unwrap().clone();

    let id = make_id(&test_env.env, 20);
    client.schedule_notification(&id, &creator, &ONE_HOUR, &make_title(&test_env.env));
    client.record_acknowledgment(&id, &recipient);

    let records = client.get_notification_audit(&id);
    assert_eq!(records.len(), 2);

    let ack = records.get(1).unwrap();
    assert_eq!(ack.action, AuditAction::Acknowledged);
    assert_eq!(ack.actor, recipient);
}

// ============================================================================
// Cancellation audit record
// ============================================================================

#[test]
fn test_cancel_notification_creates_audit_record() {
    let test_env = setup_test_env();
    let client = AutoShareContractClient::new(&test_env.env, &test_env.autoshare_contract);
    let creator = test_env.users.get(0).unwrap().clone();

    let id = make_id(&test_env.env, 30);
    client.schedule_notification(&id, &creator, &ONE_HOUR, &make_title(&test_env.env));
    client.cancel_notification(&id, &creator);

    let records = client.get_notification_audit(&id);
    assert_eq!(records.len(), 2);

    let cancel_record = records.get(1).unwrap();
    assert_eq!(cancel_record.action, AuditAction::Cancelled);
    assert_eq!(cancel_record.actor, creator);
}

// ============================================================================
// Expiry audit record
// ============================================================================

#[test]
fn test_expire_notification_creates_audit_record() {
    let test_env = setup_test_env();
    let client = AutoShareContractClient::new(&test_env.env, &test_env.autoshare_contract);
    let creator = test_env.users.get(0).unwrap().clone();

    set_now(&test_env.env, 2_000);
    let id = make_id(&test_env.env, 40);
    client.schedule_notification(&id, &creator, &ONE_HOUR, &make_title(&test_env.env));

    set_now(&test_env.env, 2_000 + ONE_HOUR);
    client.expire_notification(&id);

    let records = client.get_notification_audit(&id);
    assert_eq!(records.len(), 2);

    let expiry_record = records.get(1).unwrap();
    assert_eq!(expiry_record.action, AuditAction::Expired);
}

// ============================================================================
// Full lifecycle: created → delivery attempt → failure → acknowledged → cancelled
// ============================================================================

#[test]
fn test_full_lifecycle_audit_trail() {
    let test_env = setup_test_env();
    let client = AutoShareContractClient::new(&test_env.env, &test_env.autoshare_contract);
    let creator = test_env.users.get(0).unwrap().clone();
    let relay = test_env.users.get(1).unwrap().clone();
    let recipient = test_env.users.get(2).unwrap().clone();

    set_now(&test_env.env, 500);
    let id = make_id(&test_env.env, 50);

    client.schedule_notification(&id, &creator, &ONE_HOUR, &make_title(&test_env.env));
    client.record_delivery_attempt(&id, &relay);
    client.record_delivery_failure(&id, &relay);
    client.record_delivery_attempt(&id, &relay);
    client.record_acknowledgment(&id, &recipient);
    client.cancel_notification(&id, &creator);

    let records = client.get_notification_audit(&id);
    assert_eq!(records.len(), 6);

    let expected_actions = [
        AuditAction::Created,
        AuditAction::DeliveryAttempt,
        AuditAction::DeliveryFailed,
        AuditAction::DeliveryAttempt,
        AuditAction::Acknowledged,
        AuditAction::Cancelled,
    ];

    for (i, expected) in expected_actions.iter().enumerate() {
        let r = records.get(i as u32).unwrap();
        assert_eq!(
            &r.action, expected,
            "record[{i}] action mismatch: expected {expected:?}, got {:?}",
            r.action
        );
    }
}

// ============================================================================
// Sequence numbers are monotonically increasing
// ============================================================================

#[test]
fn test_audit_sequence_numbers_increment() {
    let test_env = setup_test_env();
    let client = AutoShareContractClient::new(&test_env.env, &test_env.autoshare_contract);
    let creator = test_env.users.get(0).unwrap().clone();
    let relay = test_env.users.get(1).unwrap().clone();

    let id1 = make_id(&test_env.env, 60);
    let id2 = make_id(&test_env.env, 61);

    client.schedule_notification(&id1, &creator, &ONE_HOUR, &make_title(&test_env.env));
    client.schedule_notification(&id2, &creator, &ONE_HOUR, &make_title(&test_env.env));
    client.record_delivery_attempt(&id1, &relay);

    let log = client.get_audit_log();
    assert_eq!(log.len(), 3);

    // Sequence numbers must be strictly increasing.
    for i in 1..log.len() {
        let prev = log.get(i - 1).unwrap().seq;
        let curr = log.get(i).unwrap().seq;
        assert!(
            curr > prev,
            "seq[{i}]={curr} must be greater than seq[{}]={prev}",
            i - 1
        );
    }

    // First seq is 1.
    assert_eq!(log.get(0).unwrap().seq, 1);
}

// ============================================================================
// Immutability: log only grows, records never change
// ============================================================================

#[test]
fn test_audit_log_immutability() {
    let test_env = setup_test_env();
    let client = AutoShareContractClient::new(&test_env.env, &test_env.autoshare_contract);
    let creator = test_env.users.get(0).unwrap().clone();

    let id = make_id(&test_env.env, 70);
    client.schedule_notification(&id, &creator, &ONE_HOUR, &make_title(&test_env.env));

    // Snapshot after first write.
    let snapshot_seq = client.get_audit_log().get(0).unwrap().seq;
    let snapshot_action = client.get_audit_log().get(0).unwrap().action;

    // Add more records.
    client.record_delivery_attempt(&id, &creator);

    // First record must be unchanged.
    let first = client.get_audit_log().get(0).unwrap();
    assert_eq!(first.seq, snapshot_seq, "seq must not change");
    assert_eq!(first.action, snapshot_action, "action must not change");

    // Log must have grown.
    assert_eq!(client.get_audit_log().len(), 2);
}

// ============================================================================
// Searchability: get_audit_records_for_notification filters correctly
// ============================================================================

#[test]
fn test_audit_records_filtered_by_notification_id() {
    let test_env = setup_test_env();
    let client = AutoShareContractClient::new(&test_env.env, &test_env.autoshare_contract);
    let creator = test_env.users.get(0).unwrap().clone();

    let id_a = make_id(&test_env.env, 80);
    let id_b = make_id(&test_env.env, 81);

    client.schedule_notification(&id_a, &creator, &ONE_HOUR, &make_title(&test_env.env));
    client.schedule_notification(&id_b, &creator, &ONE_HOUR, &make_title(&test_env.env));
    client.record_delivery_attempt(&id_a, &creator);
    client.record_delivery_attempt(&id_b, &creator);
    client.record_acknowledgment(&id_b, &creator);

    let full_log = client.get_audit_log();
    assert_eq!(full_log.len(), 5);

    // id_a: Created + DeliveryAttempt = 2 records.
    let records_a = client.get_notification_audit(&id_a);
    assert_eq!(records_a.len(), 2);
    assert!(records_a.iter().all(|r| r.notification_id == id_a));

    // id_b: Created + DeliveryAttempt + Acknowledged = 3 records.
    let records_b = client.get_notification_audit(&id_b);
    assert_eq!(records_b.len(), 3);
    assert!(records_b.iter().all(|r| r.notification_id == id_b));
}

#[test]
fn test_audit_records_for_unknown_notification_returns_empty() {
    let test_env = setup_test_env();
    let client = AutoShareContractClient::new(&test_env.env, &test_env.autoshare_contract);

    let unknown_id = make_id(&test_env.env, 90);
    let records = client.get_notification_audit(&unknown_id);
    assert_eq!(records.len(), 0);
}

// ============================================================================
// Pause guard on mutable audit helpers
// ============================================================================

#[test]
fn test_delivery_attempt_blocked_when_paused() {
    let test_env = setup_test_env();
    let client = AutoShareContractClient::new(&test_env.env, &test_env.autoshare_contract);
    let creator = test_env.users.get(0).unwrap().clone();
    let relay = test_env.users.get(1).unwrap().clone();

    let id = make_id(&test_env.env, 100);
    client.schedule_notification(&id, &creator, &ONE_HOUR, &make_title(&test_env.env));
    client.pause(&test_env.admin);

    let result = client.try_record_delivery_attempt(&id, &relay);
    assert!(
        result.is_err(),
        "delivery attempt must be blocked when paused"
    );
}

#[test]
fn test_delivery_failure_blocked_when_paused() {
    let test_env = setup_test_env();
    let client = AutoShareContractClient::new(&test_env.env, &test_env.autoshare_contract);
    let creator = test_env.users.get(0).unwrap().clone();
    let relay = test_env.users.get(1).unwrap().clone();

    let id = make_id(&test_env.env, 101);
    client.schedule_notification(&id, &creator, &ONE_HOUR, &make_title(&test_env.env));
    client.pause(&test_env.admin);

    let result = client.try_record_delivery_failure(&id, &relay);
    assert!(
        result.is_err(),
        "delivery failure must be blocked when paused"
    );
}

#[test]
fn test_acknowledgment_blocked_when_paused() {
    let test_env = setup_test_env();
    let client = AutoShareContractClient::new(&test_env.env, &test_env.autoshare_contract);
    let creator = test_env.users.get(0).unwrap().clone();
    let recipient = test_env.users.get(2).unwrap().clone();

    let id = make_id(&test_env.env, 102);
    client.schedule_notification(&id, &creator, &ONE_HOUR, &make_title(&test_env.env));
    client.pause(&test_env.admin);

    let result = client.try_record_acknowledgment(&id, &recipient);
    assert!(
        result.is_err(),
        "acknowledgment must be blocked when paused"
    );
}

// ============================================================================
// Batch notifications also produce audit records
// ============================================================================

#[test]
fn test_batch_schedule_creates_audit_records() {
    let test_env = setup_test_env();
    let client = AutoShareContractClient::new(&test_env.env, &test_env.autoshare_contract);
    let creator = test_env.users.get(0).unwrap().clone();

    let mut ids: Vec<BytesN<32>> = Vec::new(&test_env.env);
    let mut ttls: Vec<u64> = Vec::new(&test_env.env);
    let mut titles: Vec<String> = Vec::new(&test_env.env);
    for i in 110u8..=114 {
        ids.push_back(make_id(&test_env.env, i));
        ttls.push_back(ONE_HOUR);
        titles.push_back(make_title(&test_env.env));
    }

    client.batch_schedule_notifications(&ids, &creator, &ttls, &titles);

    // 5 audit records — one Created per notification.
    let log = client.get_audit_log();
    assert_eq!(log.len(), 5);

    for r in log.iter() {
        assert_eq!(r.action, AuditAction::Created);
    }
}
