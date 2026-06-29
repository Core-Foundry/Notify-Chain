use crate::base::events::{NotificationCategory, NotificationPriority};
use crate::test_utils::setup_test_env;
use crate::AutoShareContractClient;

use soroban_sdk::testutils::{Address as _, Events};
use soroban_sdk::{Address, Symbol, TryFromVal, Val};

fn latest_event_topics(env: &soroban_sdk::Env, event_name: &str) -> Option<soroban_sdk::Vec<Val>> {
    let target = Symbol::new(env, event_name);
    let mut found = None;
    for (_addr, topics, _data) in env.events().all().iter() {
        if topics.is_empty() {
            continue;
        }
        if let Ok(name) = Symbol::try_from_val(env, &topics.get(0).unwrap()) {
            if name == target {
                found = Some(topics);
            }
        }
    }
    found
}

#[test]
fn test_default_registry_starts_empty() {
    let test_env = setup_test_env();
    let client = AutoShareContractClient::new(&test_env.env, &test_env.autoshare_contract);

    let categories = client.get_registered_categories();
    assert_eq!(categories.len(), 0);
    assert!(!client.is_category_registered(&NotificationCategory::Group));
}

#[test]
fn test_admin_can_register_category() {
    let test_env = setup_test_env();
    let client = AutoShareContractClient::new(&test_env.env, &test_env.autoshare_contract);

    client.register_category(&test_env.admin, &NotificationCategory::Group);

    assert!(client.is_category_registered(&NotificationCategory::Group));
    let categories = client.get_registered_categories();
    assert_eq!(categories.len(), 1);
    assert_eq!(categories.get(0).unwrap(), NotificationCategory::Group);
}

#[test]
fn test_register_category_emits_event() {
    let test_env = setup_test_env();
    let client = AutoShareContractClient::new(&test_env.env, &test_env.autoshare_contract);

    client.register_category(&test_env.admin, &NotificationCategory::Admin);

    let topics = latest_event_topics(&test_env.env, "category_registered")
        .expect("category_registered event");
    assert_eq!(topics.len(), 4);
    assert_eq!(
        Address::try_from_val(&test_env.env, &topics.get(1).unwrap()).unwrap(),
        test_env.admin
    );
    assert_eq!(
        NotificationCategory::try_from_val(&test_env.env, &topics.get(2).unwrap()).unwrap(),
        NotificationCategory::Admin
    );
    assert_eq!(
        NotificationPriority::try_from_val(&test_env.env, &topics.get(3).unwrap()).unwrap(),
        NotificationPriority::Medium
    );
}

#[test]
#[should_panic]
fn test_duplicate_category_registration_rejected() {
    let test_env = setup_test_env();
    let client = AutoShareContractClient::new(&test_env.env, &test_env.autoshare_contract);

    client.register_category(&test_env.admin, &NotificationCategory::Financial);
    client.register_category(&test_env.admin, &NotificationCategory::Financial);
}

#[test]
#[should_panic]
fn test_non_admin_cannot_register_category() {
    let test_env = setup_test_env();
    let client = AutoShareContractClient::new(&test_env.env, &test_env.autoshare_contract);
    let non_admin = Address::generate(&test_env.env);

    client.register_category(&non_admin, &NotificationCategory::Notification);
}

#[test]
fn test_registry_queries_multiple_categories() {
    let test_env = setup_test_env();
    let client = AutoShareContractClient::new(&test_env.env, &test_env.autoshare_contract);

    client.register_category(&test_env.admin, &NotificationCategory::Group);
    client.register_category(&test_env.admin, &NotificationCategory::Notification);

    let categories = client.get_registered_categories();
    assert_eq!(categories.len(), 2);
    assert!(client.is_category_registered(&NotificationCategory::Group));
    assert!(client.is_category_registered(&NotificationCategory::Notification));
    assert!(!client.is_category_registered(&NotificationCategory::Admin));
}
