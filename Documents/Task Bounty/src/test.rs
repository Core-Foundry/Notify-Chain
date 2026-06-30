#![cfg(test)]

use super::*;
use soroban_sdk::{
    testutils::{Address as _, Ledger, LedgerInfo},
    token, Address, Env, String,
};
use types::{SubmissionStatus, TaskStatus};

fn create_token_contract<'a>(env: &Env, admin: &Address) -> token::Client<'a> {
    let token_address = env.register_stellar_asset_contract(admin.clone());
    token::Client::new(env, &token_address)
}

fn setup_test() -> (
    Env,
    Address,
    Address,
    Address,
    token::Client<'static>,
    Address,
) {
    let env = Env::default();
    env.mock_all_auths();

    let admin = Address::generate(&env);
    let poster = Address::generate(&env);
    let contributor = Address::generate(&env);
    let token_client = create_token_contract(&env, &admin);

    // Mint tokens to poster
    token_client.mint(&poster, &10_000_000_000); // 1000 XLM

    // Deploy contract
    let contract_id = env.register_contract(None, TaskBountyContract);
    let client = TaskBountyContractClient::new(&env, &contract_id);

    // Initialize
    let dispute_resolver = Address::generate(&env);
    client.initialize(&dispute_resolver, &admin);

    (env, poster, contributor, admin, token_client, contract_id)
}

#[test]
fn test_create_task() {
    let (env, poster, _, _, token_client, contract_id) = setup_test();
    let client = TaskBountyContractClient::new(&env, &contract_id);

    let title = String::from_str(&env, "Build DEX Interface");
    let description = String::from_str(&env, "Create a React frontend for Stellar DEX");
    let reward = 100_000_000; // 10 XLM
    let deadline = env.ledger().timestamp() + 2_592_000; // 30 days

    let task_id = client.create_task(
        &poster,
        &title,
        &description,
        &token_client.address,
        &reward,
        &deadline,
        &3,
    );

    assert_eq!(task_id, 1);

    let task = client.get_task(&task_id);
    assert_eq!(task.poster, poster);
    assert_eq!(task.title, title);
    assert_eq!(task.reward, reward);
    assert_eq!(task.deadline, deadline);
    assert_eq!(task.max_submissions, 3);
    assert_eq!(task.status, TaskStatus::Open);
}

#[test]
#[should_panic(expected = "InsufficientReward")]
fn test_create_task_insufficient_reward() {
    let (env, poster, _, _, token_client, contract_id) = setup_test();
    let client = TaskBountyContractClient::new(&env, &contract_id);

    let title = String::from_str(&env, "Task");
    let description = String::from_str(&env, "Description");
    let reward = 100_000; // Too low
    let deadline = env.ledger().timestamp() + 86400;

    client.create_task(
        &poster,
        &title,
        &description,
        &token_client.address,
        &reward,
        &deadline,
        &1,
    );
}

#[test]
#[should_panic(expected = "InvalidDeadline")]
fn test_create_task_past_deadline() {
    let (env, poster, _, _, token_client, contract_id) = setup_test();
    let client = TaskBountyContractClient::new(&env, &contract_id);

    let title = String::from_str(&env, "Task");
    let description = String::from_str(&env, "Description");
    let reward = 10_000_000;
    let deadline = env.ledger().timestamp() - 1; // Past

    client.create_task(
        &poster,
        &title,
        &description,
        &token_client.address,
        &reward,
        &deadline,
        &1,
    );
}

#[test]
fn test_submit_work() {
    let (env, poster, contributor, _, token_client, contract_id) = setup_test();
    let client = TaskBountyContractClient::new(&env, &contract_id);

    // Create task
    let task_id = client.create_task(
        &poster,
        &String::from_str(&env, "Task"),
        &String::from_str(&env, "Description"),
        &token_client.address,
        &10_000_000,
        &(env.ledger().timestamp() + 86400),
        &3,
    );

    // Submit work
    let work_url = String::from_str(&env, "ipfs://QmXxxx");
    let description = String::from_str(&env, "Completed work");

    let submission_id = client.submit_work(&task_id, &contributor, &work_url, &description);

    assert_eq!(submission_id, 1);

    let submission = client.get_submission(&submission_id);
    assert_eq!(submission.task_id, task_id);
    assert_eq!(submission.contributor, contributor);
    assert_eq!(submission.work_url, work_url);
    assert_eq!(submission.status, SubmissionStatus::Pending);

    // Check task updated
    let task = client.get_task(&task_id);
    assert_eq!(task.status, TaskStatus::InProgress);
    assert_eq!(task.submission_count, 1);
}

#[test]
#[should_panic(expected = "AlreadySubmitted")]
fn test_submit_work_twice() {
    let (env, poster, contributor, _, token_client, contract_id) = setup_test();
    let client = TaskBountyContractClient::new(&env, &contract_id);

    let task_id = client.create_task(
        &poster,
        &String::from_str(&env, "Task"),
        &String::from_str(&env, "Description"),
        &token_client.address,
        &10_000_000,
        &(env.ledger().timestamp() + 86400),
        &3,
    );

    let work_url = String::from_str(&env, "ipfs://QmXxxx");
    let description = String::from_str(&env, "Work");

    client.submit_work(&task_id, &contributor, &work_url, &description);
    client.submit_work(&task_id, &contributor, &work_url, &description); // Should panic
}

#[test]
#[should_panic(expected = "TaskExpired")]
fn test_submit_work_expired() {
    let (env, poster, contributor, _, token_client, contract_id) = setup_test();
    let client = TaskBountyContractClient::new(&env, &contract_id);

    let task_id = client.create_task(
        &poster,
        &String::from_str(&env, "Task"),
        &String::from_str(&env, "Description"),
        &token_client.address,
        &10_000_000,
        &(env.ledger().timestamp() + 86400),
        &1,
    );

    // Fast forward past deadline
    env.ledger().with_mut(|li| {
        li.timestamp = li.timestamp + 86401;
    });

    client.submit_work(
        &task_id,
        &contributor,
        &String::from_str(&env, "ipfs://QmXxxx"),
        &String::from_str(&env, "Work"),
    );
}

#[test]
fn test_approve_submission() {
    let (env, poster, contributor, _, token_client, contract_id) = setup_test();
    let client = TaskBountyContractClient::new(&env, &contract_id);

    let reward = 10_000_000;

    // Create task
    let task_id = client.create_task(
        &poster,
        &String::from_str(&env, "Task"),
        &String::from_str(&env, "Description"),
        &token_client.address,
        &reward,
        &(env.ledger().timestamp() + 86400),
        &1,
    );

    // Submit work
    let submission_id = client.submit_work(
        &task_id,
        &contributor,
        &String::from_str(&env, "ipfs://QmXxxx"),
        &String::from_str(&env, "Work"),
    );

    let contributor_balance_before = token_client.balance(&contributor);

    // Approve
    client.approve_submission(&task_id, &submission_id, &poster);

    // Check payment
    let contributor_balance_after = token_client.balance(&contributor);
    assert_eq!(
        contributor_balance_after,
        contributor_balance_before + reward
    );

    // Check statuses
    let task = client.get_task(&task_id);
    assert_eq!(task.status, TaskStatus::Completed);

    let submission = client.get_submission(&submission_id);
    assert_eq!(submission.status, SubmissionStatus::Approved);
}

#[test]
fn test_reject_submission() {
    let (env, poster, contributor, _, token_client, contract_id) = setup_test();
    let client = TaskBountyContractClient::new(&env, &contract_id);

    let task_id = client.create_task(
        &poster,
        &String::from_str(&env, "Task"),
        &String::from_str(&env, "Description"),
        &token_client.address,
        &10_000_000,
        &(env.ledger().timestamp() + 86400),
        &1,
    );

    let submission_id = client.submit_work(
        &task_id,
        &contributor,
        &String::from_str(&env, "ipfs://QmXxxx"),
        &String::from_str(&env, "Work"),
    );

    client.reject_submission(
        &task_id,
        &submission_id,
        &poster,
        &String::from_str(&env, "Incomplete"),
    );

    let submission = client.get_submission(&submission_id);
    assert_eq!(submission.status, SubmissionStatus::Rejected);
}

#[test]
fn test_cancel_task() {
    let (env, poster, _, _, token_client, contract_id) = setup_test();
    let client = TaskBountyContractClient::new(&env, &contract_id);

    let reward = 10_000_000;
    let poster_balance_before = token_client.balance(&poster);

    let task_id = client.create_task(
        &poster,
        &String::from_str(&env, "Task"),
        &String::from_str(&env, "Description"),
        &token_client.address,
        &reward,
        &(env.ledger().timestamp() + 86400),
        &1,
    );

    client.cancel_task(&task_id, &poster);

    // Check refund
    let poster_balance_after = token_client.balance(&poster);
    assert_eq!(poster_balance_after, poster_balance_before);

    // Check status
    let task = client.get_task(&task_id);
    assert_eq!(task.status, TaskStatus::Cancelled);
}

#[test]
fn test_raise_dispute() {
    let (env, poster, contributor, _, token_client, contract_id) = setup_test();
    let client = TaskBountyContractClient::new(&env, &contract_id);

    let task_id = client.create_task(
        &poster,
        &String::from_str(&env, "Task"),
        &String::from_str(&env, "Description"),
        &token_client.address,
        &10_000_000,
        &(env.ledger().timestamp() + 86400),
        &1,
    );

    let submission_id = client.submit_work(
        &task_id,
        &contributor,
        &String::from_str(&env, "ipfs://QmXxxx"),
        &String::from_str(&env, "Work"),
    );

    client.reject_submission(
        &task_id,
        &submission_id,
        &poster,
        &String::from_str(&env, "Incomplete"),
    );

    client.raise_dispute(
        &task_id,
        &submission_id,
        &contributor,
        &String::from_str(&env, "Work is complete"),
    );

    let task = client.get_task(&task_id);
    assert_eq!(task.status, TaskStatus::Disputed);
}

#[test]
fn test_multiple_submissions() {
    let (env, poster, contributor, _, token_client, contract_id) = setup_test();
    let client = TaskBountyContractClient::new(&env, &contract_id);

    let task_id = client.create_task(
        &poster,
        &String::from_str(&env, "Task"),
        &String::from_str(&env, "Description"),
        &token_client.address,
        &10_000_000,
        &(env.ledger().timestamp() + 86400),
        &3,
    );

    let contributor2 = Address::generate(&env);
    let contributor3 = Address::generate(&env);

    let sub1 = client.submit_work(
        &task_id,
        &contributor,
        &String::from_str(&env, "ipfs://1"),
        &String::from_str(&env, "Work 1"),
    );

    let sub2 = client.submit_work(
        &task_id,
        &contributor2,
        &String::from_str(&env, "ipfs://2"),
        &String::from_str(&env, "Work 2"),
    );

    let sub3 = client.submit_work(
        &task_id,
        &contributor3,
        &String::from_str(&env, "ipfs://3"),
        &String::from_str(&env, "Work 3"),
    );

    let submissions = client.get_task_submissions(&task_id);
    assert_eq!(submissions.len(), 3);
    assert_eq!(submissions.get(0).unwrap(), sub1);
    assert_eq!(submissions.get(1).unwrap(), sub2);
    assert_eq!(submissions.get(2).unwrap(), sub3);
}

#[test]
fn test_get_total_tasks() {
    let (env, poster, _, _, token_client, contract_id) = setup_test();
    let client = TaskBountyContractClient::new(&env, &contract_id);

    assert_eq!(client.get_total_tasks(), 0);

    client.create_task(
        &poster,
        &String::from_str(&env, "Task 1"),
        &String::from_str(&env, "Description"),
        &token_client.address,
        &10_000_000,
        &(env.ledger().timestamp() + 86400),
        &1,
    );

    assert_eq!(client.get_total_tasks(), 1);

    client.create_task(
        &poster,
        &String::from_str(&env, "Task 2"),
        &String::from_str(&env, "Description"),
        &token_client.address,
        &10_000_000,
        &(env.ledger().timestamp() + 86400),
        &1,
    );

    assert_eq!(client.get_total_tasks(), 2);
}

#[test]
fn test_register_api_key() {
    let (env, _, _, admin, _, contract_id) = setup_test();
    let client = TaskBountyContractClient::new(&env, &contract_id);

    let label = String::from_str(&env, "Primary Key");
    let fingerprint = BytesN::from_array(&env, &[1u8; 32]);

    let key_id = client.register_api_key(&admin, &label, &fingerprint);
    assert_eq!(key_id, 1);

    let keys = client.get_active_api_keys(&admin);
    assert_eq!(keys.len(), 1);

    let key = keys.get(0).unwrap();
    assert_eq!(key.id, key_id);
    assert_eq!(key.label, label);
    assert!(key.is_active);
    assert!(key.is_primary);
    assert_eq!(key.fingerprint, fingerprint);
    assert!(client.is_api_key_active(&admin, &fingerprint));
}

#[test]
fn test_rotate_api_key_keeps_old_key_active() {
    let (env, _, _, admin, _, contract_id) = setup_test();
    let client = TaskBountyContractClient::new(&env, &contract_id);

    let initial_label = String::from_str(&env, "Primary Key");
    let initial_fingerprint = BytesN::from_array(&env, &[1u8; 32]);
    let original_key_id = client.register_api_key(&admin, &initial_label, &initial_fingerprint);

    let rotated_label = String::from_str(&env, "Rotated Key");
    let rotated_fingerprint = BytesN::from_array(&env, &[2u8; 32]);
    let reason = String::from_str(&env, "Quarterly rotation");

    let new_key_id = client.rotate_api_key(
        &admin,
        &original_key_id,
        &rotated_label,
        &rotated_fingerprint,
        &reason,
    );

    assert_eq!(new_key_id, 2);
    assert!(client.is_api_key_active(&admin, &initial_fingerprint));
    assert!(client.is_api_key_active(&admin, &rotated_fingerprint));

    let keys = client.get_active_api_keys(&admin);
    assert_eq!(keys.len(), 2);

    let old_key = keys.get(0).unwrap();
    let new_key = keys.get(1).unwrap();

    assert_eq!(old_key.id, original_key_id);
    assert!(!old_key.is_primary);
    assert!(old_key.is_active);

    assert_eq!(new_key.id, new_key_id);
    assert!(new_key.is_primary);
    assert!(new_key.is_active);
    assert_eq!(new_key.previous_credential_id, original_key_id);

    let history = client.get_api_key_rotation_history(&admin);
    assert_eq!(history.len(), 1);
    let entry = history.get(0).unwrap();
    assert_eq!(entry.old_credential_id, original_key_id);
    assert_eq!(entry.new_credential_id, new_key_id);
    assert_eq!(entry.reason, reason);
}

#[test]
#[should_panic(expected = "ApiKeyAlreadyExists")]
fn test_register_api_key_rejects_duplicate_active_fingerprint() {
    let (env, _, _, admin, _, contract_id) = setup_test();
    let client = TaskBountyContractClient::new(&env, &contract_id);

    let label = String::from_str(&env, "Primary Key");
    let fingerprint = BytesN::from_array(&env, &[1u8; 32]);

    client.register_api_key(&admin, &label, &fingerprint);
    client.register_api_key(&admin, &String::from_str(&env, "Duplicate"), &fingerprint);
}

#[test]
fn test_revoke_api_key_promotes_remaining_primary() {
    let (env, _, _, admin, _, contract_id) = setup_test();
    let client = TaskBountyContractClient::new(&env, &contract_id);

    let first = client.register_api_key(
        &admin,
        &String::from_str(&env, "Primary"),
        &BytesN::from_array(&env, &[1u8; 32]),
    );
    let second = client.register_api_key(
        &admin,
        &String::from_str(&env, "Backup"),
        &BytesN::from_array(&env, &[2u8; 32]),
    );

    client.revoke_api_key(&admin, &first);

    let keys = client.get_active_api_keys(&admin);
    assert_eq!(keys.len(), 1);
    let remaining = keys.get(0).unwrap();
    assert_eq!(remaining.id, second);
    assert!(remaining.is_primary);
    assert!(client.is_api_key_active(&admin, &BytesN::from_array(&env, &[2u8; 32])));
}
