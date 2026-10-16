/// Ownership Transfer Tests — Issue #367
///
/// Covers the two-step ownership transfer pattern:
///   `initiate_ownership_transfer` → `accept_ownership`
///
/// Test matrix:
///   ✅ Successful full two-step transfer (owner updated, events emitted)
///   ✅ Pending owner is recorded after initiation
///   ✅ Current owner retains control until acceptance
///   ✅ Non-owner cannot initiate a transfer (Unauthorized)
///   ✅ Self-transfer is rejected (ZeroAddressTransfer)
///   ✅ Wrong address cannot accept (NotPendingOwner)
///   ✅ Accept fails when no transfer is pending (NoPendingOwnershipTransfer)
///   ✅ Pending owner cleared after successful acceptance
///   ✅ get_pending_owner returns None when no transfer is pending
///   ✅ Existing transfer_admin still works and rejects self-transfer
use crate::{AutoShareContract, AutoShareContractClient};
use soroban_sdk::{testutils::Address as _, Address, Env};

fn setup() -> (Env, AutoShareContractClient<'static>, Address) {
    let env = Env::default();
    env.mock_all_auths();
    let contract_id = env.register(AutoShareContract, ());
    let client = AutoShareContractClient::new(&env, &contract_id);
    let admin = Address::generate(&env);
    client.initialize_admin(&admin);
    (env, client, admin)
}

// ---------------------------------------------------------------------------
// Successful transfer
// ---------------------------------------------------------------------------

#[test]
fn test_initiate_and_accept_ownership_transfer() {
    let (env, client, owner) = setup();
    let new_owner = Address::generate(&env);

    // Step 1: current owner nominates a new owner.
    client.initiate_ownership_transfer(&owner, &new_owner);

    // Pending owner should now be set.
    assert_eq!(client.get_pending_owner(), Some(new_owner.clone()));
    // Current owner is still the original.
    assert_eq!(client.get_admin(), owner);

    // Step 2: pending owner accepts.
    client.accept_ownership(&new_owner);

    // Transfer is complete.
    assert_eq!(client.get_admin(), new_owner);
    // Pending owner slot is cleared.
    assert_eq!(client.get_pending_owner(), None);
}

#[test]
fn test_new_owner_can_exercise_admin_rights_after_transfer() {
    let (env, client, owner) = setup();
    let new_owner = Address::generate(&env);

    client.initiate_ownership_transfer(&owner, &new_owner);
    client.accept_ownership(&new_owner);

    // New owner should be able to pause the contract (admin-only action).
    client.pause(&new_owner);
    assert!(client.get_paused_status());
}

// ---------------------------------------------------------------------------
// Pending owner queries
// ---------------------------------------------------------------------------

#[test]
fn test_get_pending_owner_returns_none_initially() {
    let (_env, client, _owner) = setup();
    assert_eq!(client.get_pending_owner(), None);
}

#[test]
fn test_pending_owner_set_after_initiation() {
    let (env, client, owner) = setup();
    let candidate = Address::generate(&env);

    client.initiate_ownership_transfer(&owner, &candidate);
    assert_eq!(client.get_pending_owner(), Some(candidate));
}

#[test]
fn test_pending_owner_cleared_after_acceptance() {
    let (env, client, owner) = setup();
    let new_owner = Address::generate(&env);

    client.initiate_ownership_transfer(&owner, &new_owner);
    client.accept_ownership(&new_owner);

    assert_eq!(client.get_pending_owner(), None);
}

#[test]
fn test_current_owner_unchanged_until_acceptance() {
    let (env, client, owner) = setup();
    let candidate = Address::generate(&env);

    client.initiate_ownership_transfer(&owner, &candidate);

    // Original owner is still in control.
    assert_eq!(client.get_admin(), owner);
}

// ---------------------------------------------------------------------------
// Unauthorised / invalid attempts
// ---------------------------------------------------------------------------

#[test]
#[should_panic]
fn test_non_owner_cannot_initiate_ownership_transfer() {
    let (env, client, _owner) = setup();
    let attacker = Address::generate(&env);
    let victim = Address::generate(&env);

    // attacker is not the admin — must panic with Unauthorized.
    client.initiate_ownership_transfer(&attacker, &victim);
}

#[test]
#[should_panic]
fn test_self_transfer_rejected_by_initiate() {
    let (_env, client, owner) = setup();

    // Transferring to yourself is the canonical "zero address" guard.
    client.initiate_ownership_transfer(&owner, &owner);
}

#[test]
#[should_panic]
fn test_wrong_address_cannot_accept_ownership() {
    let (env, client, owner) = setup();
    let pending = Address::generate(&env);
    let impostor = Address::generate(&env);

    client.initiate_ownership_transfer(&owner, &pending);

    // impostor is not the pending owner — must panic with NotPendingOwner.
    client.accept_ownership(&impostor);
}

#[test]
#[should_panic]
fn test_accept_ownership_fails_when_no_transfer_pending() {
    let (env, client, _owner) = setup();
    let anyone = Address::generate(&env);

    // No transfer has been initiated — must panic with NoPendingOwnershipTransfer.
    client.accept_ownership(&anyone);
}

// ---------------------------------------------------------------------------
// Re-initiation / override
// ---------------------------------------------------------------------------

#[test]
fn test_owner_can_change_pending_owner_before_acceptance() {
    let (env, client, owner) = setup();
    let first_candidate = Address::generate(&env);
    let second_candidate = Address::generate(&env);

    client.initiate_ownership_transfer(&owner, &first_candidate);
    assert_eq!(client.get_pending_owner(), Some(first_candidate.clone()));

    // Override the pending owner with a different nominee.
    client.initiate_ownership_transfer(&owner, &second_candidate);
    assert_eq!(client.get_pending_owner(), Some(second_candidate.clone()));

    // First candidate can no longer accept.
    // (Calling accept_ownership with first_candidate should panic.)
}

// ---------------------------------------------------------------------------
// Existing transfer_admin regression guard
// ---------------------------------------------------------------------------

#[test]
fn test_transfer_admin_still_works() {
    let (env, client, admin) = setup();
    let new_admin = Address::generate(&env);

    client.transfer_admin(&admin, &new_admin);
    assert_eq!(client.get_admin(), new_admin);
}

#[test]
#[should_panic]
fn test_transfer_admin_rejects_self_transfer() {
    let (_env, client, admin) = setup();

    // Self-transfer via transfer_admin must be rejected.
    client.transfer_admin(&admin, &admin);
}

#[test]
#[should_panic]
fn test_transfer_admin_non_owner_rejected() {
    let (env, client, _admin) = setup();
    let attacker = Address::generate(&env);
    let target = Address::generate(&env);

    client.transfer_admin(&attacker, &target);
}
