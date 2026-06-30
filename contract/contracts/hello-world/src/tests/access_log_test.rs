use crate::{AutoShareContract, AutoShareContractClient};
use soroban_sdk::{testutils::Address as _, Address, BytesN, Env, String};

fn setup(env: &Env) -> (Address, AutoShareContractClient) {
    let id = env.register(AutoShareContract, ());
    let client = AutoShareContractClient::new(env, &id);
    let admin = Address::generate(env);
    env.mock_all_auths();
    client.initialize_admin(&admin);
    (admin, client)
}

fn schedule_test_notification(
    client: &AutoShareContractClient,
    env: &Env,
    creator: &Address,
) -> BytesN<32> {
    let mut id_bytes = [0u8; 32];
    id_bytes[0] = 42;
    let notification_id = BytesN::from_array(env, &id_bytes);
    client.schedule_notification(&notification_id, creator, &3600u64, &String::from_str(env, "Test"));
    notification_id
}

#[test]
fn test_access_event_emitted_for_existing_notification() {
    let env = Env::default();
    env.mock_all_auths();
    let (admin, client) = setup(&env);
    let notification_id = schedule_test_notification(&client, &env, &admin);
    let accessor = Address::generate(&env);

    // Should not panic — notification exists.
    client.record_notification_access(&notification_id, &accessor);
}

#[test]
#[should_panic]
fn test_access_event_fails_for_nonexistent_notification() {
    let env = Env::default();
    env.mock_all_auths();
    let (_admin, client) = setup(&env);

    let mut id_bytes = [0u8; 32];
    id_bytes[0] = 99;
    let notification_id = BytesN::from_array(&env, &id_bytes);
    let accessor = Address::generate(&env);

    // Should panic — notification does not exist.
    client.record_notification_access(&notification_id, &accessor);
}

#[test]
fn test_multiple_access_events_can_be_emitted() {
    let env = Env::default();
    env.mock_all_auths();
    let (admin, client) = setup(&env);
    let notification_id = schedule_test_notification(&client, &env, &admin);

    let accessor1 = Address::generate(&env);
    let accessor2 = Address::generate(&env);

    client.record_notification_access(&notification_id, &accessor1);
    client.record_notification_access(&notification_id, &accessor2);
    // Both succeed — audit trail is append-only.
}
