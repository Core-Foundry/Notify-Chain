use crate::events;
use crate::storage;
use crate::types::{Dispute, Error, SubmissionStatus, TaskStatus};
use soroban_sdk::{Address, Env, String};

/// Raise a dispute for a submission
pub fn raise_dispute(env: &Env, task_id: u64, submission_id: u64, raiser: Address, reason: String) {
    // Get task
    if !storage::task_exists(env, task_id) {
        panic_with_error!(env, Error::TaskNotFound);
    }

    let mut task = storage::get_task(env, task_id);

    // Get submission
    if !storage::submission_exists(env, submission_id) {
        panic_with_error!(env, Error::SubmissionNotFound);
    }

    let submission = storage::get_submission(env, submission_id);

    // Verify submission belongs to task
    if submission.task_id != task_id {
        panic_with_error!(env, Error::Unauthorized);
    }

    // Verify raiser is poster or contributor
    if raiser != task.poster && raiser != submission.contributor {
        panic_with_error!(env, Error::Unauthorized);
    }

    // Check submission status (can only dispute pending or rejected)
    if submission.status != SubmissionStatus::Pending
        && submission.status != SubmissionStatus::Rejected
    {
        panic_with_error!(env, Error::InvalidSubmissionStatus);
    }

    // Check if dispute already exists
    if storage::has_active_dispute(env, task_id, submission_id) {
        panic_with_error!(env, Error::DisputeAlreadyExists);
    }

    // Create dispute
    let dispute_id = storage::increment_dispute_counter(env);
    let dispute = Dispute {
        id: dispute_id,
        task_id,
        submission_id,
        raiser: raiser.clone(),
        reason: reason.clone(),
        created_at: env.ledger().timestamp(),
    };

    storage::set_dispute(env, &dispute);
    storage::set_active_dispute(env, task_id, submission_id, dispute_id);

    // Update task status
    task.status = TaskStatus::Disputed;
    storage::set_task(env, &task);

    // Emit event
    events::emit_dispute_raised(env, task_id, submission_id, &raiser, &reason);
}
