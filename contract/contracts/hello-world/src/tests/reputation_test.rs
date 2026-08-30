//! Tests for sender reputation tracking (`reputation_logic` / `base::reputation`).
//!
//! These cover the full contract-level integration surface, which previously
//! had no test coverage at all:
//! - A never-seen sender reads back sane defaults instead of erroring.
//! - Successful/failed deliveries update the stored score and tier correctly,
//!   including the boundary cases (score clamped to 0 and to 100).
//! - `ReputationUpdated` fires on every recorded delivery; `ReputationTierChanged`
//!   fires only when the tier actually crosses a boundary.
//! - Reputation is tracked independently per sender.
//! - Counts saturate rather than overflow/panic under heavy volume.

use crate::base::events::NotificationCategory;
use crate::base::reputation::ReputationTier;
use crate::test_utils::setup_test_env;
use crate::AutoShareContractClient;

use soroban_sdk::testutils::{Address as _, Events};
use soroban_sdk::{Address, Map, Symbol, TryFromVal, Val};

/// Find the topics + data of the most recent event named `event_name`, if any
/// was emitted by the most recent contract invocation.
fn find_event(
    env: &soroban_sdk::Env,
    event_name: &str,
) -> Option<(soroban_sdk::Vec<Val>, Val)> {
    let target = Symbol::new(env, event_name);
    for (_addr, topics, data) in env.events().all().iter() {
        if topics.is_empty() {
            continue;
        }
        if let Ok(name) = Symbol::try_from_val(env, &topics.get(0).unwrap()) {
            if name == target {
                return Some((topics, data));
            }
        }
    }
    None
}

/// Decode a `ReputationUpdated`/`NotificationLimitsConfigured`-style map-format
/// event's data payload field by field (map-format events sort keys
/// alphabetically; `Map::get` looks up by key regardless of order).
fn map_get_i64(env: &soroban_sdk::Env, data: &Val, key: &str) -> i64 {
    let map = Map::<Symbol, Val>::try_from_val(env, data).unwrap();
    let val = map.get(Symbol::new(env, key)).unwrap();
    i64::try_from_val(env, &val).unwrap()
}

fn map_get_u32(env: &soroban_sdk::Env, data: &Val, key: &str) -> u32 {
    let map = Map::<Symbol, Val>::try_from_val(env, data).unwrap();
    let val = map.get(Symbol::new(env, key)).unwrap();
    u32::try_from_val(env, &val).unwrap()
}

// ── defaults for an unseen sender ────────────────────────────────────────────

#[test]
fn test_new_sender_has_default_reputation() {
    let test_env = setup_test_env();
    let client = AutoShareContractClient::new(&test_env.env, &test_env.autoshare_contract);
    let sender = Address::generate(&test_env.env);

    let rep = client.get_sender_reputation(&sender);
    assert_eq!(rep.sender, sender);
    assert_eq!(rep.total_sent, 0);
    assert_eq!(rep.successful_deliveries, 0);
    assert_eq!(rep.failed_deliveries, 0);
    assert_eq!(rep.reputation_score, 50);

    assert_eq!(client.get_sender_reputation_score(&sender), 50);
    // Score 50 falls in the Bronze band (21-60).
    assert_eq!(client.get_sender_reputation_tier(&sender), ReputationTier::Bronze as u32);
}

// ── score updates from delivery outcomes ─────────────────────────────────────

#[test]
fn test_successful_delivery_increments_counts_and_raises_score() {
    let test_env = setup_test_env();
    let client = AutoShareContractClient::new(&test_env.env, &test_env.autoshare_contract);
    let sender = Address::generate(&test_env.env);

    client.record_delivery_success(&sender);

    let rep = client.get_sender_reputation(&sender);
    assert_eq!(rep.total_sent, 1);
    assert_eq!(rep.successful_deliveries, 1);
    assert_eq!(rep.failed_deliveries, 0);
    // 100% success rate -> score reaches the maximum.
    assert_eq!(rep.reputation_score, 100);
    assert_eq!(client.get_sender_reputation_tier(&sender), ReputationTier::Platinum as u32);
}

#[test]
fn test_failed_delivery_increments_counts_and_floors_score() {
    let test_env = setup_test_env();
    let client = AutoShareContractClient::new(&test_env.env, &test_env.autoshare_contract);
    let sender = Address::generate(&test_env.env);

    client.record_sender_delivery_failure(&sender);

    let rep = client.get_sender_reputation(&sender);
    assert_eq!(rep.total_sent, 1);
    assert_eq!(rep.successful_deliveries, 0);
    assert_eq!(rep.failed_deliveries, 1);
    // 0% success rate -> score floors at the minimum.
    assert_eq!(rep.reputation_score, 0);
    assert_eq!(client.get_sender_reputation_tier(&sender), ReputationTier::Unverified as u32);
}

#[test]
fn test_mixed_deliveries_score_matches_quadratic_curve() {
    let test_env = setup_test_env();
    let client = AutoShareContractClient::new(&test_env.env, &test_env.autoshare_contract);
    let sender = Address::generate(&test_env.env);

    // 1 success + 1 failure = 50% success rate -> score = 50^2 / 100 = 25,
    // not a naive 50/50 average. The tier system deliberately punishes a
    // merely average delivery record more harshly than a linear score would.
    client.record_delivery_success(&sender);
    client.record_sender_delivery_failure(&sender);

    let rep = client.get_sender_reputation(&sender);
    assert_eq!(rep.total_sent, 2);
    assert_eq!(rep.reputation_score, 25);
    assert_eq!(client.get_sender_reputation_tier(&sender), ReputationTier::Bronze as u32);
}

#[test]
fn test_get_reputation_score_matches_full_record() {
    let test_env = setup_test_env();
    let client = AutoShareContractClient::new(&test_env.env, &test_env.autoshare_contract);
    let sender = Address::generate(&test_env.env);

    client.record_delivery_success(&sender);
    client.record_delivery_success(&sender);
    client.record_sender_delivery_failure(&sender);

    let rep = client.get_sender_reputation(&sender);
    assert_eq!(client.get_sender_reputation_score(&sender), rep.reputation_score);
}

// ── saturation / heavy volume ────────────────────────────────────────────────

#[test]
fn test_reputation_score_stays_clamped_under_heavy_success_volume() {
    let test_env = setup_test_env();
    let client = AutoShareContractClient::new(&test_env.env, &test_env.autoshare_contract);
    let sender = Address::generate(&test_env.env);

    for _ in 0..50 {
        client.record_delivery_success(&sender);
    }

    let rep = client.get_sender_reputation(&sender);
    assert_eq!(rep.total_sent, 50);
    assert_eq!(rep.successful_deliveries, 50);
    assert_eq!(rep.reputation_score, 100);
    assert_eq!(client.get_sender_reputation_tier(&sender), ReputationTier::Platinum as u32);
}

#[test]
fn test_reputation_score_stays_clamped_under_heavy_failure_volume() {
    let test_env = setup_test_env();
    let client = AutoShareContractClient::new(&test_env.env, &test_env.autoshare_contract);
    let sender = Address::generate(&test_env.env);

    for _ in 0..50 {
        client.record_sender_delivery_failure(&sender);
    }

    let rep = client.get_sender_reputation(&sender);
    assert_eq!(rep.total_sent, 50);
    assert_eq!(rep.failed_deliveries, 50);
    assert_eq!(rep.reputation_score, 0);
    assert_eq!(client.get_sender_reputation_tier(&sender), ReputationTier::Unverified as u32);
}

// ── multi-sender isolation ───────────────────────────────────────────────────

#[test]
fn test_reputation_is_tracked_independently_per_sender() {
    let test_env = setup_test_env();
    let client = AutoShareContractClient::new(&test_env.env, &test_env.autoshare_contract);
    let reliable = Address::generate(&test_env.env);
    let unreliable = Address::generate(&test_env.env);

    client.record_delivery_success(&reliable);
    client.record_delivery_success(&reliable);
    client.record_sender_delivery_failure(&unreliable);
    client.record_sender_delivery_failure(&unreliable);

    let reliable_rep = client.get_sender_reputation(&reliable);
    assert_eq!(reliable_rep.successful_deliveries, 2);
    assert_eq!(reliable_rep.failed_deliveries, 0);
    assert_eq!(reliable_rep.reputation_score, 100);

    let unreliable_rep = client.get_sender_reputation(&unreliable);
    assert_eq!(unreliable_rep.successful_deliveries, 0);
    assert_eq!(unreliable_rep.failed_deliveries, 2);
    assert_eq!(unreliable_rep.reputation_score, 0);

    // A sender that was never touched is unaffected by either of the above.
    let untouched = Address::generate(&test_env.env);
    assert_eq!(client.get_sender_reputation_score(&untouched), 50);
}

// ── events ────────────────────────────────────────────────────────────────────

#[test]
fn test_successful_delivery_emits_reputation_updated_event() {
    let test_env = setup_test_env();
    let client = AutoShareContractClient::new(&test_env.env, &test_env.autoshare_contract);
    let sender = Address::generate(&test_env.env);

    client.record_delivery_success(&sender);

    let (topics, data) =
        find_event(&test_env.env, "reputation_updated").expect("reputation_updated event");
    assert_eq!(topics.len(), 4);
    assert_eq!(
        Address::try_from_val(&test_env.env, &topics.get(1).unwrap()).unwrap(),
        sender
    );
    assert_eq!(
        NotificationCategory::try_from_val(&test_env.env, &topics.get(2).unwrap()).unwrap(),
        NotificationCategory::Notification
    );

    assert_eq!(map_get_i64(&test_env.env, &data, "new_score"), 100);
    assert_eq!(map_get_u32(&test_env.env, &data, "successful_count"), 1);
    assert_eq!(map_get_u32(&test_env.env, &data, "failed_count"), 0);
}

#[test]
fn test_failed_delivery_emits_reputation_updated_event() {
    let test_env = setup_test_env();
    let client = AutoShareContractClient::new(&test_env.env, &test_env.autoshare_contract);
    let sender = Address::generate(&test_env.env);

    client.record_sender_delivery_failure(&sender);

    let (_topics, data) =
        find_event(&test_env.env, "reputation_updated").expect("reputation_updated event");
    assert_eq!(map_get_i64(&test_env.env, &data, "new_score"), 0);
    assert_eq!(map_get_u32(&test_env.env, &data, "successful_count"), 0);
    assert_eq!(map_get_u32(&test_env.env, &data, "failed_count"), 1);
}

#[test]
fn test_tier_change_event_emitted_when_crossing_a_boundary() {
    let test_env = setup_test_env();
    let client = AutoShareContractClient::new(&test_env.env, &test_env.autoshare_contract);
    let sender = Address::generate(&test_env.env);

    // Starts at score 50 (Bronze). A single success jumps straight to 100
    // (Platinum) — a tier boundary crossing that must emit the event.
    client.record_delivery_success(&sender);

    let (topics, data) = find_event(&test_env.env, "reputation_tier_changed")
        .expect("reputation_tier_changed event");
    assert_eq!(
        Address::try_from_val(&test_env.env, &topics.get(1).unwrap()).unwrap(),
        sender
    );
    assert_eq!(
        map_get_u32(&test_env.env, &data, "old_tier"),
        ReputationTier::Bronze as u32
    );
    assert_eq!(
        map_get_u32(&test_env.env, &data, "new_tier"),
        ReputationTier::Platinum as u32
    );
}

#[test]
fn test_tier_change_event_not_emitted_when_tier_is_unchanged() {
    let test_env = setup_test_env();
    let client = AutoShareContractClient::new(&test_env.env, &test_env.autoshare_contract);
    let sender = Address::generate(&test_env.env);

    // First failure: Bronze (50) -> Unverified (0). Tier changes, event fires.
    client.record_sender_delivery_failure(&sender);
    assert!(find_event(&test_env.env, "reputation_tier_changed").is_some());

    // Second failure: still Unverified (0 stays clamped at 0). Tier is
    // unchanged on *this* invocation, so no tier-change event should fire,
    // even though the score-update event still does.
    client.record_sender_delivery_failure(&sender);
    assert!(find_event(&test_env.env, "reputation_updated").is_some());
    assert!(find_event(&test_env.env, "reputation_tier_changed").is_none());
}
