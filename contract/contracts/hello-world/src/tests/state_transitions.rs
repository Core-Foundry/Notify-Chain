#![allow(unused_variables)]
#![allow(unused_imports)]

use crate::base::events::NotificationCategory;
use crate::mock_token::{MockToken, MockTokenClient};
use crate::{AutoShareContract, AutoShareContractClient};
use soroban_sdk::{
    testutils::Address as _, testutils::Events, Address, BytesN, Env, IntoVal, String, Symbol,
    TryFromVal, Val, Vec,
};

fn deploy_mock_token(env: &Env, name: &String, symbol: &String) -> (Address, MockTokenClient<'_>) {
    let contract_id = env.register(MockToken, ());
    let client = MockTokenClient::new(env, &contract_id);
    let admin = Address::generate(env);
    client.initialize(&admin, &7, name, symbol);
    (contract_id, client)
}

fn setup_basic_env() -> (Env, AutoShareContractClient<'static>, Address, Address) {
    let env = Env::default();
    env.mock_all_auths();
    let contract_id = env.register(AutoShareContract, ());
    let client = AutoShareContractClient::new(&env, &contract_id);
    let admin = Address::generate(&env);
    let user = Address::generate(&env);
    (env, client, admin, user)
}

fn setup_with_token(
    env: &Env,
    client: &AutoShareContractClient,
    admin: &Address,
) -> (Address, MockTokenClient<'_>) {
    let (token_address, token_client) = deploy_mock_token(
        env,
        &String::from_str(env, "Test Token"),
        &String::from_str(env, "TEST"),
    );
    client.add_supported_token(&token_address, admin);
    (token_address, token_client)
}

fn create_test_group(
    env: &Env,
    client: &AutoShareContractClient,
    creator: &Address,
    token: &Address,
    token_client: &MockTokenClient,
) -> BytesN<32> {
    let id = BytesN::from_array(env, &[1u8; 32]);
    let name = String::from_str(env, "Test Group");
    token_client.mint(creator, &10000000);
    client.create(&id, &name, creator, &100u32, token);
    id
}

fn count_events(env: &Env, event_name: &str) -> usize {
    let target = Symbol::new(env, event_name);
    env.events()
        .all()
        .iter()
        .filter(|(_addr, topics, _data)| {
            if topics.is_empty() {
                return false;
            }
            let first = topics.get(0).unwrap();
            Symbol::try_from_val(env, &first)
                .map(|s| s == target)
                .unwrap_or(false)
        })
        .count()
}

// ---------------------------------------------------------------------------
// 1. Initial State Tests
// ---------------------------------------------------------------------------

#[test]
fn test_initial_state_before_admin_initialization() {
    let env = Env::default();
    env.mock_all_auths();
    let contract_id = env.register(AutoShareContract, ());
    let client = AutoShareContractClient::new(&env, &contract_id);

    assert!(
        !client.get_paused_status(),
        "Contract should be active (not paused) immediately after deployment"
    );
}

#[test]
fn test_initial_state_after_admin_initialization() {
    let (env, client, admin, _user) = setup_basic_env();

    assert!(
        !client.get_paused_status(),
        "Contract should still be active after admin initialization"
    );

    client.initialize_admin(&admin);

    assert!(
        !client.get_paused_status(),
        "Contract must start unpaused (active) after initialize_admin"
    );
}

// ---------------------------------------------------------------------------
// 2. Pause Transition Tests
// ---------------------------------------------------------------------------

#[test]
fn test_pause_transition_by_admin() {
    let (env, client, admin, _user) = setup_basic_env();
    client.initialize_admin(&admin);

    assert!(
        !client.get_paused_status(),
        "Precondition: contract must be active before pause"
    );

    client.pause(&admin);

    assert!(
        client.get_paused_status(),
        "Contract must be paused immediately after admin calls pause"
    );
}

#[test]
fn test_pause_emits_contract_paused_event() {
    let (env, client, admin, _user) = setup_basic_env();
    client.initialize_admin(&admin);

    client.pause(&admin);

    assert_eq!(
        count_events(&env, "contract_paused"),
        1,
        "Exactly one contract_paused event must be emitted"
    );
}

#[test]
fn test_pause_event_carries_admin_category() {
    let (env, client, admin, _user) = setup_basic_env();
    client.initialize_admin(&admin);

    client.pause(&admin);

    let events = env.events().all();
    let last = events.last().expect("at least one event");
    let (_addr, topics, _data) = last;
    let last_topic = topics.last().expect("event has trailing category topic");
    let category =
        NotificationCategory::try_from_val(&env, &last_topic).expect("category decodes");
    assert_eq!(category, NotificationCategory::Admin);
}

#[test]
#[should_panic]
fn test_pause_transition_rejects_non_admin() {
    let (env, client, admin, user) = setup_basic_env();
    client.initialize_admin(&admin);

    client.pause(&user);
}

#[test]
#[should_panic]
fn test_pause_transition_rejects_double_pause() {
    let (env, client, admin, _user) = setup_basic_env();
    client.initialize_admin(&admin);

    client.pause(&admin);
    client.pause(&admin);
}

// ---------------------------------------------------------------------------
// 3. Unpause Transition Tests
// ---------------------------------------------------------------------------

#[test]
fn test_unpause_transition_by_admin() {
    let (env, client, admin, _user) = setup_basic_env();
    client.initialize_admin(&admin);

    client.pause(&admin);
    assert!(
        client.get_paused_status(),
        "Precondition: contract must be paused before unpause"
    );

    client.unpause(&admin);

    assert!(
        !client.get_paused_status(),
        "Contract must be active immediately after admin calls unpause"
    );
}

#[test]
fn test_unpause_emits_contract_unpaused_event() {
    let (env, client, admin, _user) = setup_basic_env();
    client.initialize_admin(&admin);

    client.pause(&admin);
    client.unpause(&admin);

    assert_eq!(
        count_events(&env, "contract_unpaused"),
        1,
        "Exactly one contract_unpaused event must be emitted"
    );
}

#[test]
fn test_unpause_event_carries_admin_category() {
    let (env, client, admin, _user) = setup_basic_env();
    client.initialize_admin(&admin);

    client.pause(&admin);
    client.unpause(&admin);

    let events = env.events().all();
    let last = events.last().expect("at least one event");
    let (_addr, topics, _data) = last;
    let last_topic = topics.last().expect("event has trailing category topic");
    let category =
        NotificationCategory::try_from_val(&env, &last_topic).expect("category decodes");
    assert_eq!(category, NotificationCategory::Admin);
}

#[test]
#[should_panic]
fn test_unpause_transition_rejects_non_admin() {
    let (env, client, admin, user) = setup_basic_env();
    client.initialize_admin(&admin);

    client.pause(&admin);
    client.unpause(&user);
}

#[test]
#[should_panic]
fn test_unpause_transition_rejects_unpause_when_active() {
    let (env, client, admin, _user) = setup_basic_env();
    client.initialize_admin(&admin);

    client.unpause(&admin);
}

// ---------------------------------------------------------------------------
// 4. Restricted Operations While Paused
// ---------------------------------------------------------------------------

#[test]
#[should_panic]
fn test_create_group_blocked_when_paused() {
    let (env, client, admin, creator) = setup_basic_env();
    client.initialize_admin(&admin);
    let (token, token_client) = setup_with_token(&env, &client, &admin);
    token_client.mint(&creator, &10000000);
    client.pause(&admin);

    let id = BytesN::from_array(&env, &[2u8; 32]);
    let name = String::from_str(&env, "Should Fail");
    client.create(&id, &name, &creator, &100u32, &token);
}

#[test]
#[should_panic]
fn test_update_members_blocked_when_paused() {
    let (env, client, admin, creator) = setup_basic_env();
    client.initialize_admin(&admin);
    let (token, token_client) = setup_with_token(&env, &client, &admin);
    let id = create_test_group(&env, &client, &creator, &token, &token_client);
    client.pause(&admin);

    let mut members = Vec::new(&env);
    members.push_back(crate::base::types::GroupMember {
        address: Address::generate(&env),
        percentage: 100,
    });
    client.update_members(&id, &creator, &members);
}

#[test]
#[should_panic]
fn test_add_group_member_blocked_when_paused() {
    let (env, client, admin, creator) = setup_basic_env();
    client.initialize_admin(&admin);
    let (token, token_client) = setup_with_token(&env, &client, &admin);
    let id = create_test_group(&env, &client, &creator, &token, &token_client);
    client.pause(&admin);

    let new_member = Address::generate(&env);
    client.add_group_member(&id, &creator, &new_member, &50u32);
}

#[test]
#[should_panic]
fn test_deactivate_group_blocked_when_paused() {
    let (env, client, admin, creator) = setup_basic_env();
    client.initialize_admin(&admin);
    let (token, token_client) = setup_with_token(&env, &client, &admin);
    let id = create_test_group(&env, &client, &creator, &token, &token_client);
    client.pause(&admin);

    client.deactivate_group(&id, &creator);
}

#[test]
#[should_panic]
fn test_activate_group_blocked_when_paused() {
    let (env, client, admin, creator) = setup_basic_env();
    client.initialize_admin(&admin);
    let (token, token_client) = setup_with_token(&env, &client, &admin);
    let id = create_test_group(&env, &client, &creator, &token, &token_client);
    client.deactivate_group(&id, &creator);
    client.pause(&admin);

    client.activate_group(&id, &creator);
}

#[test]
#[should_panic]
fn test_topup_subscription_blocked_when_paused() {
    let (env, client, admin, creator) = setup_basic_env();
    client.initialize_admin(&admin);
    let (token, token_client) = setup_with_token(&env, &client, &admin);
    let id = create_test_group(&env, &client, &creator, &token, &token_client);
    client.pause(&admin);

    let payer = Address::generate(&env);
    token_client.mint(&payer, &10000000);
    client.topup_subscription(&id, &10u32, &token, &payer);
}

#[test]
fn test_read_operations_succeed_when_paused() {
    let (env, client, admin, creator) = setup_basic_env();
    client.initialize_admin(&admin);
    let (token, token_client) = setup_with_token(&env, &client, &admin);
    let id = create_test_group(&env, &client, &creator, &token, &token_client);
    client.pause(&admin);

    let _ = client.get(&id);
    let _ = client.get_all_groups();
    let _ = client.get_groups_by_creator(&creator);
    let _ = client.get_group_members(&id);
    let _ = client.is_group_member(&id, &creator);
    let _ = client.get_paused_status();
    let _ = client.get_admin();
    let _ = client.get_supported_tokens();
    let _ = client.is_token_supported(&token);
    let _ = client.get_usage_fee();
    let _ = client.get_remaining_usages(&id);
    let _ = client.get_total_usages_paid(&id);
    let _ = client.get_user_payment_history(&creator);
    let _ = client.get_group_payment_history(&id);
    let _ = client.is_group_active(&id);
    let _ = client.get_contract_balance(&token);
    let _ = client.version();
}

// ---------------------------------------------------------------------------
// 5. Repeated State Transitions
// ---------------------------------------------------------------------------

#[test]
fn test_repeated_pause_unpause_cycles() {
    let (env, client, admin, _user) = setup_basic_env();
    client.initialize_admin(&admin);

    const CYCLES: u32 = 3;
    for cycle in 1..=CYCLES {
        assert!(
            !client.get_paused_status(),
            "Cycle {} start: contract must be active",
            cycle
        );

        client.pause(&admin);
        assert!(
            client.get_paused_status(),
            "Cycle {} after pause: contract must be paused",
            cycle
        );

        client.unpause(&admin);
        assert!(
            !client.get_paused_status(),
            "Cycle {} after unpause: contract must be active",
            cycle
        );
    }
}

#[test]
fn test_repeated_pause_unpause_event_count() {
    let (env, client, admin, _user) = setup_basic_env();
    client.initialize_admin(&admin);

    const CYCLES: u32 = 5;
    for _ in 1..=CYCLES {
        client.pause(&admin);
        client.unpause(&admin);
    }

    assert_eq!(
        count_events(&env, "contract_paused"),
        CYCLES as usize,
        "Expected {} contract_paused events across {} cycles",
        CYCLES,
        CYCLES
    );
    assert_eq!(
        count_events(&env, "contract_unpaused"),
        CYCLES as usize,
        "Expected {} contract_unpaused events across {} cycles",
        CYCLES,
        CYCLES
    );
}

#[test]
fn test_operations_alternate_correctly_across_transitions() {
    let (env, client, admin, creator) = setup_basic_env();
    client.initialize_admin(&admin);
    let (token, token_client) = setup_with_token(&env, &client, &admin);

    client.pause(&admin);
    client.unpause(&admin);

    let id1 = BytesN::from_array(&env, &[0x11u8; 32]);
    token_client.mint(&creator, &10000000);
    client.create(
        &id1,
        &String::from_str(&env, "Group 1"),
        &creator,
        &100u32,
        &token,
    );

    client.pause(&admin);
    let id_blocked = BytesN::from_array(&env, &[0x22u8; 32]);
    let result = std::panic::catch_unwind(|| {
        client.create(
            &id_blocked,
            &String::from_str(&env, "Blocked"),
            &creator,
            &50u32,
            &token,
        );
    });
    assert!(result.is_err(), "Create must fail while paused");

    client.unpause(&admin);
    let id2 = BytesN::from_array(&env, &[0x33u8; 32]);
    client.create(
        &id2,
        &String::from_str(&env, "Group 2"),
        &creator,
        &50u32,
        &token,
    );

    client.pause(&admin);
    let mut members = Vec::new(&env);
    members.push_back(crate::base::types::GroupMember {
        address: Address::generate(&env),
        percentage: 100,
    });
    let update_result = std::panic::catch_unwind(|| {
        client.update_members(&id1, &creator, &members.clone());
    });
    assert!(update_result.is_err(), "Update members must fail while paused");

    client.unpause(&admin);
    client.update_members(&id1, &creator, &members);

    assert_eq!(client.get_all_groups().len(), 2);
    assert!(!client.get_paused_status());
}
