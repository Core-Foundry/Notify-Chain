//! Edge-case and failure-scenario coverage (issue #403).
//!
//! These tests deliberately drive the contract into its rejection paths and
//! boundary conditions — double admin init, self-transfers, paused-state
//! toggles, over-budget withdrawals, malformed batches, operations on
//! revoked/expired/unknown notifications, and unauthorized callers — so a
//! regression in any guard clause is caught immediately.

use crate::base::events::NotificationPriority;
use crate::test_utils::{create_test_group, setup_test_env};
use crate::AutoShareContractClient;

use soroban_sdk::testutils::{Address as _, Ledger};
use soroban_sdk::{Address, BytesN, Env, String, Vec};

const ONE_HOUR: u64 = 3_600;
/// Keep in sync with `MAX_NOTIFICATION_LIFETIME_SECONDS` in `autoshare_logic.rs`.
const MAX_LIFETIME: u64 = 30 * 24 * 60 * 60;

fn make_id(env: &Env, tag: u8) -> BytesN<32> {
    let mut bytes = [0u8; 32];
    bytes[0] = tag;
    bytes[1] = 0xED; // namespace: edge-case tests
    BytesN::from_array(env, &bytes)
}

fn title(env: &Env) -> String {
    String::from_str(env, "Edge case notification")
}

// ============================================================================
// Admin lifecycle
// ============================================================================

/// `initialize_admin` is single-shot: a second call must not replace the admin.
#[test]
fn test_initialize_admin_is_idempotent() {
    let test_env = setup_test_env();
    let client = AutoShareContractClient::new(&test_env.env, &test_env.autoshare_contract);

    let usurper = Address::generate(&test_env.env);
    client.initialize_admin(&usurper);

    assert_eq!(client.get_admin(), test_env.admin);
}

#[test]
#[should_panic]
fn test_transfer_admin_to_self_rejected() {
    let test_env = setup_test_env();
    let client = AutoShareContractClient::new(&test_env.env, &test_env.autoshare_contract);

    client.transfer_admin(&test_env.admin, &test_env.admin);
}

#[test]
#[should_panic]
fn test_transfer_admin_by_non_admin_rejected() {
    let test_env = setup_test_env();
    let client = AutoShareContractClient::new(&test_env.env, &test_env.autoshare_contract);

    let attacker = test_env.users.get(0).unwrap();
    let target = test_env.users.get(1).unwrap();
    client.transfer_admin(&attacker, &target);
}

// ============================================================================
// Pause / unpause toggles
// ============================================================================

#[test]
#[should_panic]
fn test_pause_when_already_paused_rejected() {
    let test_env = setup_test_env();
    let client = AutoShareContractClient::new(&test_env.env, &test_env.autoshare_contract);

    client.pause(&test_env.admin);
    client.pause(&test_env.admin); // AlreadyPaused
}

#[test]
#[should_panic]
fn test_unpause_when_not_paused_rejected() {
    let test_env = setup_test_env();
    let client = AutoShareContractClient::new(&test_env.env, &test_env.autoshare_contract);

    client.unpause(&test_env.admin); // NotPaused
}

#[test]
fn test_pause_unpause_round_trip_clears_flag() {
    let test_env = setup_test_env();
    let client = AutoShareContractClient::new(&test_env.env, &test_env.autoshare_contract);

    assert!(!client.get_paused_status());
    client.pause(&test_env.admin);
    assert!(client.get_paused_status());
    client.unpause(&test_env.admin);
    assert!(!client.get_paused_status());
}

#[test]
#[should_panic]
fn test_pause_by_non_admin_rejected() {
    let test_env = setup_test_env();
    let client = AutoShareContractClient::new(&test_env.env, &test_env.autoshare_contract);

    let stranger = test_env.users.get(2).unwrap();
    client.pause(&stranger);
}

// ============================================================================
// Supported-token management
// ============================================================================

#[test]
#[should_panic]
fn test_add_supported_token_twice_rejected() {
    let test_env = setup_test_env();
    let client = AutoShareContractClient::new(&test_env.env, &test_env.autoshare_contract);

    let token = test_env.mock_tokens.get(0).unwrap();
    // Already added by `setup_test_env`.
    client.add_supported_token(&token, &test_env.admin);
}

#[test]
#[should_panic]
fn test_add_supported_token_by_non_admin_rejected() {
    let test_env = setup_test_env();
    let client = AutoShareContractClient::new(&test_env.env, &test_env.autoshare_contract);

    let rogue_token = Address::generate(&test_env.env);
    let attacker = test_env.users.get(0).unwrap();
    client.add_supported_token(&rogue_token, &attacker);
}

// ============================================================================
// Group creation edge cases
// ============================================================================

#[test]
#[should_panic]
fn test_create_group_zero_usage_rejected() {
    let test_env = setup_test_env();
    let client = AutoShareContractClient::new(&test_env.env, &test_env.autoshare_contract);

    let creator = test_env.users.get(0).unwrap();
    let token = test_env.mock_tokens.get(0).unwrap();
    client.create(
        &make_id(&test_env.env, 1),
        &String::from_str(&test_env.env, "zero usages"),
        &creator,
        &0u32,
        &token,
    );
}

#[test]
#[should_panic]
fn test_create_group_duplicate_id_rejected() {
    let test_env = setup_test_env();
    let token = test_env.mock_tokens.get(0).unwrap().clone();
    let creator = test_env.users.get(0).unwrap().clone();

    // First creation succeeds (id derived from `usages`).
    let _ = create_test_group(
        &test_env.env,
        &test_env.autoshare_contract,
        &creator,
        &Vec::new(&test_env.env),
        7,
        &token,
    );
    // Re-creating with the same derived id must be rejected.
    let _ = create_test_group(
        &test_env.env,
        &test_env.autoshare_contract,
        &creator,
        &Vec::new(&test_env.env),
        7,
        &token,
    );
}

#[test]
#[should_panic]
fn test_create_group_unsupported_token_rejected() {
    let test_env = setup_test_env();
    let client = AutoShareContractClient::new(&test_env.env, &test_env.autoshare_contract);

    let creator = test_env.users.get(0).unwrap();
    let bogus_token = Address::generate(&test_env.env);
    client.create(
        &make_id(&test_env.env, 2),
        &String::from_str(&test_env.env, "bad token"),
        &creator,
        &1u32,
        &bogus_token,
    );
}

// ============================================================================
// Withdrawals
// ============================================================================

#[test]
#[should_panic]
fn test_withdraw_more_than_contract_balance_rejected() {
    let test_env = setup_test_env();
    let client = AutoShareContractClient::new(&test_env.env, &test_env.autoshare_contract);
    let token = test_env.mock_tokens.get(0).unwrap().clone();
    let creator = test_env.users.get(0).unwrap().clone();

    let _ = create_test_group(
        &test_env.env,
        &test_env.autoshare_contract,
        &creator,
        &Vec::new(&test_env.env),
        3,
        &token,
    );

    let balance = client.get_contract_balance(&token);
    client.withdraw(&test_env.admin, &token, &(balance + 1), &test_env.admin);
}

#[test]
#[should_panic]
fn test_withdraw_zero_amount_rejected() {
    let test_env = setup_test_env();
    let client = AutoShareContractClient::new(&test_env.env, &test_env.autoshare_contract);
    let token = test_env.mock_tokens.get(0).unwrap();

    client.withdraw(&test_env.admin, &token, &0i128, &test_env.admin);
}

#[test]
#[should_panic]
fn test_withdraw_by_non_admin_rejected() {
    let test_env = setup_test_env();
    let client = AutoShareContractClient::new(&test_env.env, &test_env.autoshare_contract);
    let token = test_env.mock_tokens.get(0).unwrap();
    let attacker = test_env.users.get(1).unwrap();

    client.withdraw(&attacker, &token, &1i128, &attacker);
}

// ============================================================================
// Subscription top-up / cancellation
// ============================================================================

#[test]
#[should_panic]
fn test_topup_zero_usages_rejected() {
    let test_env = setup_test_env();
    let client = AutoShareContractClient::new(&test_env.env, &test_env.autoshare_contract);
    let token = test_env.mock_tokens.get(0).unwrap().clone();
    let creator = test_env.users.get(0).unwrap().clone();

    let id = create_test_group(
        &test_env.env,
        &test_env.autoshare_contract,
        &creator,
        &Vec::new(&test_env.env),
        4,
        &token,
    );

    client.topup_subscription(&id, &0u32, &token, &creator);
}

#[test]
#[should_panic]
fn test_topup_on_deactivated_group_rejected() {
    let test_env = setup_test_env();
    let client = AutoShareContractClient::new(&test_env.env, &test_env.autoshare_contract);
    let token = test_env.mock_tokens.get(0).unwrap().clone();
    let creator = test_env.users.get(0).unwrap().clone();

    let id = create_test_group(
        &test_env.env,
        &test_env.autoshare_contract,
        &creator,
        &Vec::new(&test_env.env),
        5,
        &token,
    );

    client.deactivate_group(&id, &creator);
    client.topup_subscription(&id, &1u32, &token, &creator);
}

#[test]
#[should_panic]
fn test_cancel_subscription_by_stranger_rejected() {
    let test_env = setup_test_env();
    let client = AutoShareContractClient::new(&test_env.env, &test_env.autoshare_contract);
    let token = test_env.mock_tokens.get(0).unwrap().clone();
    let creator = test_env.users.get(0).unwrap().clone();
    let stranger = test_env.users.get(2).unwrap().clone();

    let id = create_test_group(
        &test_env.env,
        &test_env.autoshare_contract,
        &creator,
        &Vec::new(&test_env.env),
        6,
        &token,
    );

    client.cancel_subscription(&id, &stranger);
}

// ============================================================================
// Usage consumption
// ============================================================================

#[test]
#[should_panic]
fn test_reduce_usage_by_non_creator_rejected() {
    let test_env = setup_test_env();
    let client = AutoShareContractClient::new(&test_env.env, &test_env.autoshare_contract);
    let token = test_env.mock_tokens.get(0).unwrap().clone();
    let creator = test_env.users.get(0).unwrap().clone();
    let outsider = test_env.users.get(1).unwrap().clone();

    let id = create_test_group(
        &test_env.env,
        &test_env.autoshare_contract,
        &creator,
        &Vec::new(&test_env.env),
        8,
        &token,
    );

    client.reduce_usage(&id, &outsider);
}

#[test]
fn test_reduce_usage_drains_then_rejects() {
    let test_env = setup_test_env();
    let client = AutoShareContractClient::new(&test_env.env, &test_env.autoshare_contract);
    let token = test_env.mock_tokens.get(0).unwrap().clone();
    let creator = test_env.users.get(0).unwrap().clone();

    let id = create_test_group(
        &test_env.env,
        &test_env.autoshare_contract,
        &creator,
        &Vec::new(&test_env.env),
        9,
        &token,
    );

    for _ in 0..9 {
        client.reduce_usage(&id, &creator);
    }
    assert_eq!(client.get_remaining_usages(&id), 0);
    assert!(client.try_reduce_usage(&id, &creator).is_err());
}

// ============================================================================
// Scheduled-notification failure paths
// ============================================================================

#[test]
#[should_panic]
fn test_schedule_duplicate_notification_id_rejected() {
    let test_env = setup_test_env();
    let client = AutoShareContractClient::new(&test_env.env, &test_env.autoshare_contract);
    let creator = test_env.users.get(0).unwrap().clone();

    let id = make_id(&test_env.env, 20);
    client.schedule_notification(
        &id,
        &creator,
        &ONE_HOUR,
        &title(&test_env.env),
        &NotificationPriority::Medium,
    );
    client.schedule_notification(
        &id,
        &creator,
        &ONE_HOUR,
        &title(&test_env.env),
        &NotificationPriority::Medium,
    );
}

#[test]
#[should_panic]
fn test_revoke_notification_twice_rejected() {
    let test_env = setup_test_env();
    let client = AutoShareContractClient::new(&test_env.env, &test_env.autoshare_contract);
    let creator = test_env.users.get(0).unwrap().clone();

    let id = make_id(&test_env.env, 21);
    client.schedule_notification(
        &id,
        &creator,
        &ONE_HOUR,
        &title(&test_env.env),
        &NotificationPriority::Medium,
    );
    client.revoke_notification(&id, &creator);
    client.revoke_notification(&id, &creator); // AlreadyRevoked
}

#[test]
fn test_confirm_delivery_on_revoked_notification_rejected() {
    let test_env = setup_test_env();
    let client = AutoShareContractClient::new(&test_env.env, &test_env.autoshare_contract);
    let creator = test_env.users.get(0).unwrap().clone();

    let id = make_id(&test_env.env, 22);
    client.schedule_notification(
        &id,
        &creator,
        &ONE_HOUR,
        &title(&test_env.env),
        &NotificationPriority::Medium,
    );
    client.revoke_notification(&id, &creator);

    assert!(client
        .try_confirm_notification_delivery(&id, &creator)
        .is_err());
}

#[test]
fn test_audit_helpers_reject_unknown_notification() {
    let test_env = setup_test_env();
    let client = AutoShareContractClient::new(&test_env.env, &test_env.autoshare_contract);
    let actor = test_env.users.get(0).unwrap().clone();

    let ghost = make_id(&test_env.env, 23);
    assert!(client.try_record_delivery_attempt(&ghost, &actor).is_err());
    assert!(client.try_record_delivery_failure(&ghost, &actor).is_err());
    assert!(client.try_record_acknowledgment(&ghost, &actor).is_err());
}

#[test]
fn test_audit_helpers_reject_revoked_notification() {
    let test_env = setup_test_env();
    let client = AutoShareContractClient::new(&test_env.env, &test_env.autoshare_contract);
    let creator = test_env.users.get(0).unwrap().clone();

    let id = make_id(&test_env.env, 24);
    client.schedule_notification(
        &id,
        &creator,
        &ONE_HOUR,
        &title(&test_env.env),
        &NotificationPriority::Medium,
    );
    client.revoke_notification(&id, &creator);

    assert!(client.try_record_delivery_attempt(&id, &creator).is_err());
    assert!(client.try_record_acknowledgment(&id, &creator).is_err());
}

#[test]
fn test_audit_helpers_reject_expired_notification() {
    let test_env = setup_test_env();
    let client = AutoShareContractClient::new(&test_env.env, &test_env.autoshare_contract);
    let creator = test_env.users.get(0).unwrap().clone();

    test_env.env.ledger().set_timestamp(1_000);
    let id = make_id(&test_env.env, 25);
    client.schedule_notification(
        &id,
        &creator,
        &ONE_HOUR,
        &title(&test_env.env),
        &NotificationPriority::Medium,
    );

    test_env.env.ledger().set_timestamp(1_000 + ONE_HOUR + 1);
    assert!(client.try_record_delivery_attempt(&id, &creator).is_err());
}

#[test]
#[should_panic]
fn test_extend_expiry_zero_seconds_rejected() {
    let test_env = setup_test_env();
    let client = AutoShareContractClient::new(&test_env.env, &test_env.autoshare_contract);
    let creator = test_env.users.get(0).unwrap().clone();

    let id = make_id(&test_env.env, 26);
    client.schedule_notification(
        &id,
        &creator,
        &ONE_HOUR,
        &title(&test_env.env),
        &NotificationPriority::Medium,
    );
    client.extend_notification_expiry(&id, &creator, &0u64);
}

#[test]
#[should_panic]
fn test_extend_expiry_beyond_max_lifetime_rejected() {
    let test_env = setup_test_env();
    let client = AutoShareContractClient::new(&test_env.env, &test_env.autoshare_contract);
    let creator = test_env.users.get(0).unwrap().clone();

    test_env.env.ledger().set_timestamp(1_000);
    let id = make_id(&test_env.env, 27);
    client.schedule_notification(
        &id,
        &creator,
        &ONE_HOUR,
        &title(&test_env.env),
        &NotificationPriority::Medium,
    );
    // Pushes total lifetime well past the protocol maximum.
    client.extend_notification_expiry(&id, &creator, &(MAX_LIFETIME + 1));
}

#[test]
#[should_panic]
fn test_get_nonexistent_notification_panics() {
    let test_env = setup_test_env();
    let client = AutoShareContractClient::new(&test_env.env, &test_env.autoshare_contract);

    client.get_notification(&make_id(&test_env.env, 28));
}

// ============================================================================
// Batch scheduling — malformed inputs
// ============================================================================

fn batch_of(
    env: &Env,
    n: u32,
    ttl: u64,
) -> (
    Vec<BytesN<32>>,
    Vec<u64>,
    Vec<String>,
    Vec<NotificationPriority>,
) {
    let mut ids = Vec::new(env);
    let mut ttls = Vec::new(env);
    let mut titles = Vec::new(env);
    let mut priorities = Vec::new(env);
    for i in 0..n {
        let mut bytes = [0u8; 32];
        bytes[0] = (i % 256) as u8;
        bytes[1] = 0xBA;
        bytes[2] = (i / 256) as u8;
        ids.push_back(BytesN::from_array(env, &bytes));
        ttls.push_back(ttl);
        titles.push_back(String::from_str(env, "batch"));
        priorities.push_back(NotificationPriority::Low);
    }
    (ids, ttls, titles, priorities)
}

#[test]
fn test_batch_schedule_empty_rejected() {
    let test_env = setup_test_env();
    let client = AutoShareContractClient::new(&test_env.env, &test_env.autoshare_contract);
    let creator = test_env.users.get(0).unwrap().clone();

    let (ids, ttls, titles, priorities) = batch_of(&test_env.env, 0, ONE_HOUR);
    assert!(client
        .try_batch_schedule_notifications(&ids, &creator, &ttls, &titles, &priorities)
        .is_err());
}

#[test]
fn test_batch_schedule_length_mismatch_rejected() {
    let test_env = setup_test_env();
    let client = AutoShareContractClient::new(&test_env.env, &test_env.autoshare_contract);
    let creator = test_env.users.get(0).unwrap().clone();

    let (ids, ttls, titles, mut priorities) = batch_of(&test_env.env, 3, ONE_HOUR);
    priorities.pop_back(); // now length 2 vs 3
    assert!(client
        .try_batch_schedule_notifications(&ids, &creator, &ttls, &titles, &priorities)
        .is_err());
}

#[test]
fn test_batch_schedule_over_max_size_rejected() {
    let test_env = setup_test_env();
    let client = AutoShareContractClient::new(&test_env.env, &test_env.autoshare_contract);
    let creator = test_env.users.get(0).unwrap().clone();

    let (ids, ttls, titles, priorities) = batch_of(&test_env.env, 51, ONE_HOUR);
    assert!(client
        .try_batch_schedule_notifications(&ids, &creator, &ttls, &titles, &priorities)
        .is_err());
}

#[test]
fn test_batch_schedule_duplicate_ids_rejected() {
    let test_env = setup_test_env();
    let client = AutoShareContractClient::new(&test_env.env, &test_env.autoshare_contract);
    let creator = test_env.users.get(0).unwrap().clone();

    let (mut ids, ttls, titles, priorities) = batch_of(&test_env.env, 3, ONE_HOUR);
    let dup = ids.get(0).unwrap();
    ids.set(2, dup);
    assert!(client
        .try_batch_schedule_notifications(&ids, &creator, &ttls, &titles, &priorities)
        .is_err());
}

#[test]
fn test_batch_schedule_entry_over_max_lifetime_rejected() {
    let test_env = setup_test_env();
    let client = AutoShareContractClient::new(&test_env.env, &test_env.autoshare_contract);
    let creator = test_env.users.get(0).unwrap().clone();

    let (ids, mut ttls, titles, priorities) = batch_of(&test_env.env, 2, ONE_HOUR);
    ttls.set(1, MAX_LIFETIME + 1);
    assert!(client
        .try_batch_schedule_notifications(&ids, &creator, &ttls, &titles, &priorities)
        .is_err());
}
