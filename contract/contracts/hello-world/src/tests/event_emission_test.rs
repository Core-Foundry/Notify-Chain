//! Dedicated event-emission verification suite (Issue #291).
//!
//! Unlike the per-feature test files (which mostly assert one topic/field at a
//! time), every assertion here compares the **entire** logged event tuple
//! (contract address, full topic list, full data payload) against the tuple
//! produced by constructing the expected event struct and calling its
//! macro-generated `topics()`/`data()` methods. That makes every assertion
//! sensitive to:
//! - a field being added, removed, renamed, or reordered,
//! - a field's type changing,
//! - a topic becoming data (or vice versa),
//! - the relative order of events emitted within a single transaction.
//!
//! Sections:
//! 1. Structural coverage — one positive test per event type, asserting the
//!    full event tuple.
//! 2. Ordering — transactions that emit multiple events, asserting the exact
//!    sequence.
//! 3. Negative cases — transactions that fail validation/authorization must
//!    not leave behind partial or unexpected events.

extern crate std;

use crate::base::events::{
    AdminTransferred, AuditAction, AuditRecordAppended, AutoshareCreated,
    AutoshareUpdated, BatchNotificationsCreated, BatchProcessingCompleted, CategoryRegistered,
    ContractPaused, ContractUnpaused, GroupActivated, GroupDeactivated, NotificationAccessed,
    NotificationCategory, NotificationExpired, NotificationExtended, NotificationLimitsConfigured,
    NotificationPriority, NotificationRevoked, NotificationScheduled,
    ScheduledNotificationCancelled, SchemaVersionSet, Withdrawal,
};
use crate::base::reputation::ReputationTier;
use crate::base::types::GroupMember;
use crate::test_utils::{create_test_group, mint_tokens, setup_test_env};
use crate::AutoShareContractClient;

use soroban_sdk::testutils::{Address as _, Events, Ledger};
use soroban_sdk::{Address, BytesN, Env, Event, String, Val, Vec};

fn nid(env: &Env, tag: u8) -> BytesN<32> {
    let mut bytes = [0u8; 32];
    bytes[0] = tag;
    BytesN::from_array(env, &bytes)
}

fn title(env: &Env) -> String {
    String::from_str(env, "Test notification")
}

/// Bare `Val` (the raw event `data` payload) doesn't implement `PartialEq` —
/// only soroban_sdk's typed wrappers (like `Vec<Val>`) do, via host-level
/// structural comparison. Wrapping the lone `data` value in a singleton
/// `Vec<Val>` lets us compare it (and therefore the *whole* logged event)
/// with a real equality check instead of manually picking apart fields.
///
/// Builds the comparable `(contract_address, topics, [data])` triple that
/// corresponds to what `env.events().all()` logs for `event`.
fn expected_event(env: &Env, contract_id: &Address, event: &impl Event) -> (Address, Vec<Val>, Vec<Val>) {
    (
        contract_id.clone(),
        event.topics(env),
        Vec::from_array(env, [event.data(env)]),
    )
}

/// Snapshots every event actually emitted so far, in the same comparable
/// shape produced by [`expected_event`].
fn actual_events(env: &Env) -> std::vec::Vec<(Address, Vec<Val>, Vec<Val>)> {
    env.events()
        .all()
        .iter()
        .map(|(addr, topics, data)| (addr, topics, Vec::from_array(env, [data])))
        .collect()
}

// ============================================================================
// 1. Structural coverage — one positive test per event type
// ============================================================================

#[test]
fn autoshare_created_structural() {
    let test_env = setup_test_env();
    let env = &test_env.env;
    let cid = &test_env.autoshare_contract;
    let client = AutoShareContractClient::new(env, cid);
    let creator = test_env.users.get(0).unwrap();
    let token = test_env.mock_tokens.get(0).unwrap();
    mint_tokens(env, &token, &creator, 1_000);

    let id = nid(env, 1);
    client.create(&id, &title(env), &creator, &1u32, &token);

    let expected = AutoshareCreated {
        creator: creator.clone(),
        category: NotificationCategory::Group,
        priority: NotificationPriority::Medium,
        id: id.clone(),
    };
    assert_eq!(actual_events(env), std::vec![expected_event(env, cid, &expected)]);
}

#[test]
fn category_registered_structural() {
    let test_env = setup_test_env();
    let env = &test_env.env;
    let cid = &test_env.autoshare_contract;
    let client = AutoShareContractClient::new(env, cid);

    client.register_category(&test_env.admin, &NotificationCategory::Financial);

    let expected = CategoryRegistered {
        admin: test_env.admin.clone(),
        category: NotificationCategory::Financial,
        priority: NotificationPriority::Medium,
    };
    assert_eq!(actual_events(env), std::vec![expected_event(env, cid, &expected)]);
}

#[test]
fn contract_paused_structural() {
    let test_env = setup_test_env();
    let env = &test_env.env;
    let cid = &test_env.autoshare_contract;
    let client = AutoShareContractClient::new(env, cid);

    client.pause(&test_env.admin);

    let expected = ContractPaused {
        admin: test_env.admin.clone(),
        category: NotificationCategory::Admin,
        priority: NotificationPriority::High,
    };
    assert_eq!(actual_events(env), std::vec![expected_event(env, cid, &expected)]);
}

#[test]
fn contract_unpaused_structural() {
    let test_env = setup_test_env();
    let env = &test_env.env;
    let cid = &test_env.autoshare_contract;
    let client = AutoShareContractClient::new(env, cid);

    client.pause(&test_env.admin);
    client.unpause(&test_env.admin);

    let expected = ContractUnpaused {
        admin: test_env.admin.clone(),
        category: NotificationCategory::Admin,
        priority: NotificationPriority::High,
    };
    assert_eq!(actual_events(env).last(), Some(&expected_event(env, cid, &expected)));
}

#[test]
fn autoshare_updated_structural() {
    let test_env = setup_test_env();
    let env = &test_env.env;
    let cid = &test_env.autoshare_contract;
    let client = AutoShareContractClient::new(env, cid);
    let creator = test_env.users.get(0).unwrap();
    let token = test_env.mock_tokens.get(0).unwrap();

    let id = create_test_group(env, cid, &creator, &Vec::new(env), 1, &token);

    let mut members = Vec::new(env);
    members.push_back(GroupMember {
        address: Address::generate(env),
        percentage: 100,
    });
    client.update_members(&id, &creator, &members);

    let expected = AutoshareUpdated {
        updater: creator.clone(),
        category: NotificationCategory::Group,
        priority: NotificationPriority::Medium,
        id: id.clone(),
    };
    assert_eq!(actual_events(env).last(), Some(&expected_event(env, cid, &expected)));
}

#[test]
fn group_deactivated_structural() {
    let test_env = setup_test_env();
    let env = &test_env.env;
    let cid = &test_env.autoshare_contract;
    let client = AutoShareContractClient::new(env, cid);
    let creator = test_env.users.get(0).unwrap();
    let token = test_env.mock_tokens.get(0).unwrap();

    let id = create_test_group(env, cid, &creator, &Vec::new(env), 1, &token);
    client.deactivate_group(&id, &creator);

    let expected = GroupDeactivated {
        creator: creator.clone(),
        category: NotificationCategory::Group,
        priority: NotificationPriority::Low,
        id: id.clone(),
    };
    assert_eq!(actual_events(env).last(), Some(&expected_event(env, cid, &expected)));
}

#[test]
fn group_activated_structural() {
    let test_env = setup_test_env();
    let env = &test_env.env;
    let cid = &test_env.autoshare_contract;
    let client = AutoShareContractClient::new(env, cid);
    let creator = test_env.users.get(0).unwrap();
    let token = test_env.mock_tokens.get(0).unwrap();

    let id = create_test_group(env, cid, &creator, &Vec::new(env), 1, &token);
    client.deactivate_group(&id, &creator);
    client.activate_group(&id, &creator);

    let expected = GroupActivated {
        creator: creator.clone(),
        category: NotificationCategory::Group,
        priority: NotificationPriority::Low,
        id: id.clone(),
    };
    assert_eq!(actual_events(env).last(), Some(&expected_event(env, cid, &expected)));
}

#[test]
fn admin_transferred_structural() {
    let test_env = setup_test_env();
    let env = &test_env.env;
    let cid = &test_env.autoshare_contract;
    let client = AutoShareContractClient::new(env, cid);
    let new_admin = Address::generate(env);

    client.transfer_admin(&test_env.admin, &new_admin);

    let expected = AdminTransferred {
        old_admin: test_env.admin.clone(),
        category: NotificationCategory::Admin,
        priority: NotificationPriority::Critical,
        new_admin: new_admin.clone(),
    };
    assert_eq!(actual_events(env), std::vec![expected_event(env, cid, &expected)]);
}

#[test]
fn withdrawal_structural() {
    let test_env = setup_test_env();
    let env = &test_env.env;
    let cid = &test_env.autoshare_contract;
    let client = AutoShareContractClient::new(env, cid);
    let creator = test_env.users.get(0).unwrap();
    let token = test_env.mock_tokens.get(0).unwrap();
    let recipient = Address::generate(env);

    // 5 usages * 10 fee = 50 tokens land in the contract.
    create_test_group(env, cid, &creator, &Vec::new(env), 5, &token);

    client.withdraw(&test_env.admin, &token, &20i128, &recipient);

    let expected = Withdrawal {
        token: token.clone(),
        recipient: recipient.clone(),
        category: NotificationCategory::Financial,
        priority: NotificationPriority::High,
        amount: 20i128,
    };
    assert_eq!(actual_events(env).last(), Some(&expected_event(env, cid, &expected)));
}

#[test]
fn notification_scheduled_structural() {
    let test_env = setup_test_env();
    let env = &test_env.env;
    let cid = &test_env.autoshare_contract;
    let client = AutoShareContractClient::new(env, cid);
    let creator = test_env.users.get(0).unwrap();
    let id = nid(env, 9);

    client.schedule_notification(&id, &creator, &3_600u64, &title(env));

    let expected = NotificationScheduled {
        creator: creator.clone(),
        category: NotificationCategory::Notification,
        priority: NotificationPriority::Medium,
        notification_id: id.clone(),
    };
    assert_eq!(actual_events(env).last(), Some(&expected_event(env, cid, &expected)));
}

#[test]
fn notification_expired_structural() {
    let test_env = setup_test_env();
    let env = &test_env.env;
    let cid = &test_env.autoshare_contract;
    let client = AutoShareContractClient::new(env, cid);
    let creator = test_env.users.get(0).unwrap();
    let id = nid(env, 10);

    env.ledger().set_timestamp(1_000);
    client.schedule_notification(&id, &creator, &10u64, &title(env));
    env.ledger().set_timestamp(1_011);
    client.expire_notification(&id);

    let expected = NotificationExpired {
        notification_id: id.clone(),
        category: NotificationCategory::Notification,
        priority: NotificationPriority::Medium,
        expires_at: 1_010,
    };
    assert_eq!(actual_events(env).last(), Some(&expected_event(env, cid, &expected)));
}

#[test]
fn scheduled_notification_cancelled_structural() {
    let test_env = setup_test_env();
    let env = &test_env.env;
    let cid = &test_env.autoshare_contract;
    let client = AutoShareContractClient::new(env, cid);
    let creator = test_env.users.get(0).unwrap();
    let id = nid(env, 11);

    client.schedule_notification(&id, &creator, &3_600u64, &title(env));
    client.cancel_notification(&id, &creator);

    let expected = ScheduledNotificationCancelled {
        caller: creator.clone(),
        category: NotificationCategory::Notification,
        priority: NotificationPriority::Low,
        notification_id: id.clone(),
    };
    assert_eq!(actual_events(env).last(), Some(&expected_event(env, cid, &expected)));
}

#[test]
fn audit_record_appended_structural() {
    let test_env = setup_test_env();
    let env = &test_env.env;
    let cid = &test_env.autoshare_contract;
    let client = AutoShareContractClient::new(env, cid);
    let creator = test_env.users.get(0).unwrap();
    let relay = Address::generate(env);
    let id = nid(env, 12);

    client.schedule_notification(&id, &creator, &3_600u64, &title(env));
    client.record_delivery_attempt(&id, &relay);

    let expected = AuditRecordAppended {
        notification_id: id.clone(),
        action: AuditAction::DeliveryAttempt,
        category: NotificationCategory::Notification,
        seq: 2,
        actor: relay.clone(),
    };
    assert_eq!(actual_events(env).last(), Some(&expected_event(env, cid, &expected)));
}

#[test]
fn notification_revoked_structural() {
    let test_env = setup_test_env();
    let env = &test_env.env;
    let cid = &test_env.autoshare_contract;
    let client = AutoShareContractClient::new(env, cid);
    let creator = test_env.users.get(0).unwrap();
    let id = nid(env, 13);

    client.schedule_notification(&id, &creator, &3_600u64, &title(env));
    client.revoke_notification(&id, &creator);

    let expected = NotificationRevoked {
        notification_id: id.clone(),
        revoked_by: creator.clone(),
        category: NotificationCategory::Notification,
        priority: NotificationPriority::High,
    };
    assert_eq!(actual_events(env).last(), Some(&expected_event(env, cid, &expected)));
}

#[test]
fn batch_processing_completed_structural() {
    let test_env = setup_test_env();
    let env = &test_env.env;
    let cid = &test_env.autoshare_contract;
    let client = AutoShareContractClient::new(env, cid);
    let batch_id = nid(env, 14);

    client.emit_batch_completed(&batch_id, &7u32);

    let expected = BatchProcessingCompleted {
        batch_id: batch_id.clone(),
        category: NotificationCategory::Notification,
        priority: NotificationPriority::Medium,
        processed_count: 7,
    };
    assert_eq!(actual_events(env), std::vec![expected_event(env, cid, &expected)]);
}

#[test]
fn notification_extended_structural() {
    let test_env = setup_test_env();
    let env = &test_env.env;
    let cid = &test_env.autoshare_contract;
    let client = AutoShareContractClient::new(env, cid);
    let creator = test_env.users.get(0).unwrap();
    let id = nid(env, 15);

    env.ledger().set_timestamp(1_000);
    client.schedule_notification(&id, &creator, &3_600u64, &title(env));
    client.extend_notification_expiry(&id, &creator, &600u64);

    let expected = NotificationExtended {
        notification_id: id.clone(),
        caller: creator.clone(),
        category: NotificationCategory::Notification,
        priority: NotificationPriority::Medium,
        new_expires_at: 1_000 + 3_600 + 600,
    };
    assert_eq!(actual_events(env).last(), Some(&expected_event(env, cid, &expected)));
}

#[test]
fn notification_limits_configured_structural() {
    let test_env = setup_test_env();
    let env = &test_env.env;
    let cid = &test_env.autoshare_contract;
    let client = AutoShareContractClient::new(env, cid);

    client.configure_notification_limits(&test_env.admin, &1_024u32, &86_400u64, &60u64, &25u32);

    let expected = NotificationLimitsConfigured {
        admin: test_env.admin.clone(),
        category: NotificationCategory::Admin,
        priority: NotificationPriority::Medium,
        max_payload_size: 1_024,
        max_expiration_seconds: 86_400,
        min_expiration_seconds: 60,
        max_batch_size: 25,
    };
    assert_eq!(actual_events(env), std::vec![expected_event(env, cid, &expected)]);
}

#[test]
fn schema_version_set_structural() {
    let test_env = setup_test_env();
    let env = &test_env.env;
    let cid = &test_env.autoshare_contract;
    let client = AutoShareContractClient::new(env, cid);

    client.set_schema_version(&test_env.admin, &1u32);

    let expected = SchemaVersionSet {
        admin: test_env.admin.clone(),
        category: NotificationCategory::Admin,
        priority: NotificationPriority::Medium,
        schema_version: 1,
        previous_version: 0,
    };
    assert_eq!(actual_events(env), std::vec![expected_event(env, cid, &expected)]);
}

#[test]
fn notification_accessed_structural() {
    let test_env = setup_test_env();
    let env = &test_env.env;
    let cid = &test_env.autoshare_contract;
    let client = AutoShareContractClient::new(env, cid);
    let creator = test_env.users.get(0).unwrap();
    let accessor = Address::generate(env);
    let id = nid(env, 16);

    env.ledger().set_timestamp(2_000);
    client.schedule_notification(&id, &creator, &3_600u64, &title(env));
    client.record_notification_access(&id, &accessor);

    let expected = NotificationAccessed {
        notification_id: id.clone(),
        accessor: accessor.clone(),
        category: NotificationCategory::Notification,
        accessed_at: 2_000,
    };
    assert_eq!(actual_events(env).last(), Some(&expected_event(env, cid, &expected)));
}

#[test]
fn reputation_updated_and_tier_changed_structural() {
    let test_env = setup_test_env();
    let env = &test_env.env;
    let cid = &test_env.autoshare_contract;
    let client = AutoShareContractClient::new(env, cid);
    let sender = Address::generate(env);

    // A brand-new sender starts at the initial score (50 → Bronze). One
    // successful delivery pushes the score to 75 → Silver, so this single
    // call exercises both ReputationUpdated *and* ReputationTierChanged
    // (and proves the update is logged before the tier change). Note: the
    // events are checked *before* any further client calls — each
    // invocation's event log is independent, so a later read-only call
    // would otherwise make this call's events disappear from view.
    client.record_delivery_success(&sender);

    use crate::base::events::{ReputationTierChanged, ReputationUpdated};
    let expected_update = ReputationUpdated {
        sender: sender.clone(),
        category: NotificationCategory::Notification,
        priority: NotificationPriority::Medium,
        new_score: 75,
        successful_count: 1,
        failed_count: 0,
    };
    let expected_tier = ReputationTierChanged {
        sender: sender.clone(),
        category: NotificationCategory::Notification,
        priority: NotificationPriority::High,
        old_tier: ReputationTier::Bronze as u32,
        new_tier: ReputationTier::Silver as u32,
        reputation_score: 75,
    };
    assert_eq!(
        actual_events(env),
        std::vec![
            expected_event(env, cid, &expected_update),
            expected_event(env, cid, &expected_tier),
        ]
    );

    let rep = client.get_sender_reputation(&sender);
    assert_eq!(rep.reputation_score, 75);
    assert_eq!(client.get_sender_reputation_tier(&sender), ReputationTier::Silver as u32);
}

// ============================================================================
// 2. Ordering — multi-event transactions
// ============================================================================

/// `batch_schedule_notifications` must emit one `NotificationScheduled` per
/// notification id, strictly in input order, followed by exactly one
/// `BatchNotificationsCreated` summary event — never interleaved or reordered.
#[test]
fn batch_schedule_emits_events_in_order() {
    let test_env = setup_test_env();
    let env = &test_env.env;
    let cid = &test_env.autoshare_contract;
    let client = AutoShareContractClient::new(env, cid);
    let creator = test_env.users.get(0).unwrap();

    let mut ids = Vec::new(env);
    let mut ttls = Vec::new(env);
    let mut titles = Vec::new(env);
    for tag in [20u8, 21, 22] {
        ids.push_back(nid(env, tag));
        ttls.push_back(3_600u64);
        titles.push_back(title(env));
    }

    client.batch_schedule_notifications(&ids, &creator, &ttls, &titles);

    let mut expected: std::vec::Vec<_> = std::vec::Vec::new();
    for (i, id) in ids.iter().enumerate() {
        let audit = AuditRecordAppended {
            notification_id: id.clone(),
            action: AuditAction::Created,
            category: NotificationCategory::Notification,
            seq: (i + 1) as u64,
            actor: creator.clone(),
        };
        expected.push(expected_event(env, cid, &audit));

        let scheduled = NotificationScheduled {
            creator: creator.clone(),
            category: NotificationCategory::Notification,
            priority: NotificationPriority::Medium,
            notification_id: id.clone(),
        };
        expected.push(expected_event(env, cid, &scheduled));
    }
    let summary = BatchNotificationsCreated {
        creator: creator.clone(),
        category: NotificationCategory::Notification,
        priority: NotificationPriority::Medium,
        count: 3,
        ids: ids.clone(),
    };
    expected.push(expected_event(env, cid, &summary));

    assert_eq!(actual_events(env), expected);
}

/// `schedule_notification` appends an audit record *before* announcing the
/// notification — both events come from the same invocation, so their
/// relative order is exactly what off-chain consumers will see.
#[test]
fn schedule_notification_emits_audit_then_scheduled_in_order() {
    let test_env = setup_test_env();
    let env = &test_env.env;
    let cid = &test_env.autoshare_contract;
    let client = AutoShareContractClient::new(env, cid);
    let creator = test_env.users.get(0).unwrap();
    let id = nid(env, 23);

    client.schedule_notification(&id, &creator, &3_600u64, &title(env));

    let scheduled_audit = AuditRecordAppended {
        notification_id: id.clone(),
        action: AuditAction::Created,
        category: NotificationCategory::Notification,
        seq: 1,
        actor: creator.clone(),
    };
    let scheduled = NotificationScheduled {
        creator: creator.clone(),
        category: NotificationCategory::Notification,
        priority: NotificationPriority::Medium,
        notification_id: id.clone(),
    };

    let expected = std::vec![
        expected_event(env, cid, &scheduled_audit),
        expected_event(env, cid, &scheduled),
    ];
    assert_eq!(actual_events(env), expected);
}

// ============================================================================
// 3. Negative cases — failed transactions must not emit (partial) events
// ============================================================================

#[test]
fn create_with_zero_usage_emits_no_event() {
    let test_env = setup_test_env();
    let env = &test_env.env;
    let client = AutoShareContractClient::new(env, &test_env.autoshare_contract);
    let creator = test_env.users.get(0).unwrap();
    let token = test_env.mock_tokens.get(0).unwrap();

    let result = client.try_create(&nid(env, 30), &title(env), &creator, &0u32, &token);
    assert!(result.is_err());
    assert!(env.events().all().is_empty());
}

// Note: the test `Env`'s event log (`env.events().all()`) is scoped to the
// *most recent* top-level contract invocation, mirroring real ledger
// semantics where a failed/reverted call's events never commit and a fresh
// call starts from a clean slate. So "no event on failure" is asserted as
// `is_empty()` right after the failing call, not as "unchanged from before".

#[test]
fn update_members_bad_percentages_emits_no_event() {
    let test_env = setup_test_env();
    let env = &test_env.env;
    let cid = &test_env.autoshare_contract;
    let client = AutoShareContractClient::new(env, cid);
    let creator = test_env.users.get(0).unwrap();
    let token = test_env.mock_tokens.get(0).unwrap();

    let id = create_test_group(env, cid, &creator, &Vec::new(env), 1, &token);

    let mut members = Vec::new(env);
    members.push_back(GroupMember {
        address: Address::generate(env),
        percentage: 40, // doesn't sum to 100
    });
    let result = client.try_update_members(&id, &creator, &members);
    assert!(result.is_err());
    assert!(env.events().all().is_empty());
}

#[test]
fn pause_while_already_paused_emits_no_event() {
    let test_env = setup_test_env();
    let env = &test_env.env;
    let client = AutoShareContractClient::new(env, &test_env.autoshare_contract);

    client.pause(&test_env.admin);

    let result = client.try_pause(&test_env.admin);
    assert!(result.is_err());
    assert!(env.events().all().is_empty());
}

#[test]
fn schedule_notification_zero_ttl_emits_no_event() {
    let test_env = setup_test_env();
    let env = &test_env.env;
    let client = AutoShareContractClient::new(env, &test_env.autoshare_contract);
    let creator = test_env.users.get(0).unwrap();

    let result = client.try_schedule_notification(&nid(env, 31), &creator, &0u64, &title(env));
    assert!(result.is_err());
    assert!(env.events().all().is_empty());
}

#[test]
fn register_category_twice_emits_no_event_on_second_call() {
    let test_env = setup_test_env();
    let env = &test_env.env;
    let client = AutoShareContractClient::new(env, &test_env.autoshare_contract);

    client.register_category(&test_env.admin, &NotificationCategory::Group);

    let result = client.try_register_category(&test_env.admin, &NotificationCategory::Group);
    assert!(result.is_err());
    assert!(env.events().all().is_empty());
}

/// `transfer_admin` calls `publish_authorization_failure` *before* returning
/// `Error::Unauthorized` — but every contract entry point in `lib.rs` calls
/// `.unwrap()` on that `Result`, turning the `Err` into a panic. A panicking
/// invocation reverts the whole transaction, including any events it
/// published before the panic point. So `AuthorizationFailure` (like any
/// event emitted on a path that ends in an error) is never actually
/// observable through the public contract interface as currently wired —
/// this test locks in that behavior so a future refactor that changes it
/// (e.g. switching to non-panicking entry points) gets caught.
#[test]
fn unauthorized_transfer_admin_reverts_with_no_observable_event() {
    let test_env = setup_test_env();
    let env = &test_env.env;
    let client = AutoShareContractClient::new(env, &test_env.autoshare_contract);
    let impostor = Address::generate(env);
    let new_admin = Address::generate(env);

    let result = client.try_transfer_admin(&impostor, &new_admin);
    assert!(result.is_err());
    assert!(env.events().all().is_empty());

    // The admin must be unchanged — confirming AdminTransferred never fired.
    assert_eq!(client.get_admin(), test_env.admin);
}

#[test]
fn withdraw_exceeding_balance_emits_no_event() {
    let test_env = setup_test_env();
    let env = &test_env.env;
    let cid = &test_env.autoshare_contract;
    let client = AutoShareContractClient::new(env, cid);
    let creator = test_env.users.get(0).unwrap();
    let token = test_env.mock_tokens.get(0).unwrap();
    let recipient = Address::generate(env);

    create_test_group(env, cid, &creator, &Vec::new(env), 1, &token); // 10 tokens in contract

    let result = client.try_withdraw(&test_env.admin, &token, &1_000_000i128, &recipient);
    assert!(result.is_err());
    assert!(env.events().all().is_empty());
}
