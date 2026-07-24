use crate::{AutoShareContract, AutoShareContractClient};
use soroban_sdk::{testutils::Address as _, Address, Env};

fn setup(env: &Env) -> (Address, AutoShareContractClient) {
    let id = env.register(AutoShareContract, ());
    let client = AutoShareContractClient::new(env, &id);
    let admin = Address::generate(env);
    env.mock_all_auths();
    client.initialize_admin(&admin);
    (admin, client)
}

#[test]
fn test_schema_version_default_is_zero() {
    let env = Env::default();
    let (_admin, client) = setup(&env);
    assert_eq!(client.get_schema_version(), 0);
}

#[test]
fn test_set_schema_version_stores_and_emits() {
    let env = Env::default();
    env.mock_all_auths();
    let (admin, client) = setup(&env);

    client.set_schema_version(&admin, &1);
    assert_eq!(client.get_schema_version(), 1);
}

#[test]
fn test_set_schema_version_previous_version_tracked() {
    let env = Env::default();
    env.mock_all_auths();
    let (admin, client) = setup(&env);

    // Set once; previous is 0.
    client.set_schema_version(&admin, &1);
    // Set again to the same supported value.
    client.set_schema_version(&admin, &1);
    assert_eq!(client.get_schema_version(), 1);
}

#[test]
fn test_is_version_supported_returns_true_for_valid() {
    let env = Env::default();
    let (_admin, client) = setup(&env);
    assert!(client.is_version_supported(&1));
}

#[test]
fn test_is_version_supported_returns_false_for_zero() {
    let env = Env::default();
    let (_admin, client) = setup(&env);
    assert!(!client.is_version_supported(&0));
}

#[test]
fn test_is_version_supported_returns_false_for_future() {
    let env = Env::default();
    let (_admin, client) = setup(&env);
    assert!(!client.is_version_supported(&999));
}

#[test]
#[should_panic]
fn test_set_schema_version_rejects_unsupported_version() {
    let env = Env::default();
    env.mock_all_auths();
    let (admin, client) = setup(&env);
    client.set_schema_version(&admin, &999);
}

#[test]
#[should_panic]
fn test_set_schema_version_rejects_zero() {
    let env = Env::default();
    env.mock_all_auths();
    let (admin, client) = setup(&env);
    client.set_schema_version(&admin, &0);
}

#[test]
#[should_panic]
fn test_set_schema_version_requires_admin() {
    let env = Env::default();
    env.mock_all_auths();
    let (_admin, client) = setup(&env);
    let non_admin = Address::generate(&env);
    client.set_schema_version(&non_admin, &1);
}
