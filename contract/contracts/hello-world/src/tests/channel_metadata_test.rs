//! Tests for channel metadata updates.
//!
//! Authorized creators can update channel descriptions and custom metadata
//! without recreating the channel. Subscribers / members remain unaffected.

use crate::test_utils::{create_test_group, create_test_members, setup_test_env};
use crate::AutoShareContractClient;

extern crate std;

use soroban_sdk::testutils::Events;
use soroban_sdk::{Env, Map, String, Symbol, TryFromVal, Val, Vec};

fn topics_of(env: &Env, event_name: &str) -> Option<Vec<Val>> {
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

#[test]
fn test_update_channel_metadata_stores_description() {
    let test_env = setup_test_env();
    let client = AutoShareContractClient::new(&test_env.env, &test_env.autoshare_contract);
    let creator = test_env.users.get(0).unwrap().clone();
    let token = test_env.mock_tokens.get(0).unwrap().clone();

    let members = create_test_members(&test_env.env, 0);
    let channel_id = create_test_group(
        &test_env.env,
        &test_env.autoshare_contract,
        &creator,
        &members,
        10,
        &token,
    );

    let mut fields = Map::new(&test_env.env);
    fields.set(
        String::from_str(&test_env.env, "region"),
        String::from_str(&test_env.env, "us-east"),
    );

    client.update_channel_metadata(
        &channel_id,
        &creator,
        &String::from_str(&test_env.env, "Ops alert channel"),
        &fields,
    );

    let meta = client.get_channel_metadata(&channel_id);
    assert_eq!(meta.channel_id, channel_id);
    assert_eq!(
        meta.description,
        String::from_str(&test_env.env, "Ops alert channel")
    );
    assert_eq!(
        meta.custom_fields
            .get(String::from_str(&test_env.env, "region"))
            .unwrap(),
        String::from_str(&test_env.env, "us-east")
    );
}

#[test]
fn test_update_channel_metadata_emits_event() {
    let test_env = setup_test_env();
    let client = AutoShareContractClient::new(&test_env.env, &test_env.autoshare_contract);
    let creator = test_env.users.get(0).unwrap().clone();
    let token = test_env.mock_tokens.get(0).unwrap().clone();

    let members = create_test_members(&test_env.env, 0);
    let channel_id = create_test_group(
        &test_env.env,
        &test_env.autoshare_contract,
        &creator,
        &members,
        5,
        &token,
    );

    client.update_channel_metadata(
        &channel_id,
        &creator,
        &String::from_str(&test_env.env, "News feed"),
        &Map::new(&test_env.env),
    );

    let topics =
        topics_of(&test_env.env, "channel_metadata_updated").expect("event must be emitted");
    assert!(!topics.is_empty());
}

#[test]
#[should_panic]
fn test_update_channel_metadata_rejects_non_creator() {
    let test_env = setup_test_env();
    let client = AutoShareContractClient::new(&test_env.env, &test_env.autoshare_contract);
    let creator = test_env.users.get(0).unwrap().clone();
    let interloper = test_env.users.get(1).unwrap().clone();
    let token = test_env.mock_tokens.get(0).unwrap().clone();

    let members = create_test_members(&test_env.env, 0);
    let channel_id = create_test_group(
        &test_env.env,
        &test_env.autoshare_contract,
        &creator,
        &members,
        5,
        &token,
    );

    client.update_channel_metadata(
        &channel_id,
        &interloper,
        &String::from_str(&test_env.env, "hacked"),
        &Map::new(&test_env.env),
    );
}

#[test]
fn test_update_channel_metadata_leaves_subscribers_intact() {
    let test_env = setup_test_env();
    let client = AutoShareContractClient::new(&test_env.env, &test_env.autoshare_contract);
    let creator = test_env.users.get(0).unwrap().clone();
    let token = test_env.mock_tokens.get(0).unwrap().clone();

    let members = create_test_members(&test_env.env, 2);
    let channel_id = create_test_group(
        &test_env.env,
        &test_env.autoshare_contract,
        &creator,
        &members,
        10,
        &token,
    );

    let before = client.get(&channel_id);
    let member_count_before = before.members.len();
    let usage_before = before.usage_count;
    let active_before = before.is_active;

    client.update_channel_metadata(
        &channel_id,
        &creator,
        &String::from_str(&test_env.env, "Updated desc"),
        &Map::new(&test_env.env),
    );

    let after = client.get(&channel_id);
    assert_eq!(after.members.len(), member_count_before);
    assert_eq!(after.usage_count, usage_before);
    assert_eq!(after.is_active, active_before);
    assert_eq!(after.name, before.name);
}
