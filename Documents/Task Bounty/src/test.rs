.ledger().timestamp() + 86400;

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

    let deadline = env.ledger().timestamp() + 10;
    let task_id = client.create_task(
        &poster,
        &String::from_str(&env, "Task"),
        &String::from_str(&env, "Description"),
        &token_client.address,
        &10_000_000,
        &deadline,
        &3,
    );

    // Advance ledger time past deadline
    env.ledger().set(LedgerInfo {
        timestamp: deadline + 1,
        protocol_version: 20,
        sequence_number: 100,
        network_id: Default::default(),
        base_reserve: 10,
        min_temp_entry_ttl: 16,
        min_persistent_entry_ttl: 16,
        max_entry_ttl: 6312000,
    });

    client.submit_work(
        &task_id,
        &contributor,
        &String::from_str(&env, "ipfs://QmXxxx"),
        &String::from_str(&env, "Work"),
    );
}

#[test]
fn test_multiple_reviewer_approval_flow() {
    let (env, poster, contributor, _, token_client, contract_id) = setup_test();
    let client = TaskBountyContractClient::new(&env, &contract_id);

    // Create task requiring multiple reviewers or standard configuration supporting multi-review
    let task_id = client.create_task(
        &poster,
        &String::from_str(&env, "Multi-Review Task"),
        &String::from_str(&env, "Task needing multiple approvals"),
        &token_client.address,
        &50_000_000,
        &(env.ledger().timestamp() + 86400),
        &3,
    );

    let submission_id = client.submit_work(
        &task_id,
        &contributor,
        &String::from_str(&env, "ipfs://ReviewSubmission"),
        &String::from_str(&env, "Ready for reviews"),
    );

    let reviewer1 = Address::generate(&env);
    let reviewer2 = Address::generate(&env);

    // First review approval
    client.approve_submission(&submission_id, &reviewer1);
    let sub_after_first = client.get_submission(&submission_id);
    assert_eq!(sub_after_first.status, SubmissionStatus::Pending);

    // Second review approval completing the required quorum/approvals for issue #1233
    client.approve_submission(&submission_id, &reviewer2);
    let sub_after_second = client.get_submission(&submission_id);
    assert_eq!(sub_after_second.status, SubmissionStatus::Approved);

    // Verify task completion status
    let task = client.get_task(&task_id);
    assert_eq!(task.status, TaskStatus::Completed);
}

#[test]
#[should_panic(expected = "AlreadyApprovedByReviewer")]
fn test_duplicate_reviewer_approval() {
    let (env, poster, contributor, _, token_client, contract_id) = setup_test();
    let client = TaskBountyContractClient::new(&env, &contract_id);

    let task_id = client.create_task(
        &poster,
        &String::from_str(&env, "Task"),
        &String::from_str(&env, "Desc"),
        &token_client.address,
        &10_000_000,
        &(env.ledger().timestamp() + 86400),
        &1,
    );

    let submission_id = client.submit_work(
        &task_id,
        &contributor,
        &String::from_str(&env, "ipfs://url"),
        &String::from_str(&env, "desc"),
    );

    let reviewer = Address::generate(&env);
    client.approve_submission(&submission_id, &reviewer);
    client.approve_submission(&submission_id, &reviewer); // Should panic due to duplicate review by same address
}