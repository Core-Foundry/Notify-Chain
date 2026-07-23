use soroban_sdk::{contracttype, Address, String};

/// Task status enum
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum TaskStatus {
    Open,       // Task is open for submissions
    InProgress, // Work has been submitted
    Completed,  // Task completed and paid
    Cancelled,  // Task cancelled by poster
    Disputed,   // Task is under dispute
}

/// Submission status enum
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum SubmissionStatus {
    Pending,  // Awaiting review
    Approved, // Approved and paid
    Rejected, // Rejected by task poster
}

/// Task structure
///
/// # Field ordering (storage optimization)
///
/// Fields are grouped by semantic purpose and serialization width so that
/// related data sits together in XDR-encoded storage entries:
///
/// 1. Identity   — `id` (u64)
/// 2. Ownership  — `poster` (Address)
/// 3. Content    — `title`, `description`, `token` (heap-allocated, variable)
/// 4. Reward     — `reward` (i128, 16 bytes)
/// 5. Timestamps — `deadline`, `created_at` (u64 each, 8 bytes)
/// 6. Counters   — `max_submissions`, `submission_count` (u32 each, 4 bytes)
/// 7. Status     — `status` (enum)
///
/// Grouping the two u64 timestamps together and the two u32 counters together
/// avoids fragmentation in the XDR representation and makes the struct layout
/// easier to reason about for future contributors.
#[contracttype]
#[derive(Clone, Debug)]
pub struct Task {
    /// Unique task identifier, monotonically assigned by the contract.
    pub id: u64,
    /// Address of the task creator / reward poster.
    pub poster: Address,
    /// Human-readable title for the task.
    pub title: String,
    /// Full task description (requirements, acceptance criteria, etc.).
    pub description: String,
    /// Token address used for the escrowed reward (XLM or SAC token).
    pub token: Address,
    /// Reward amount in the token's smallest unit.
    pub reward: i128,
    /// Unix timestamp (seconds) after which new submissions are rejected.
    pub deadline: u64,
    /// Unix timestamp (seconds) at which the task was created.
    pub created_at: u64,
    /// Maximum number of submissions this task will accept.
    pub max_submissions: u32,
    /// Number of submissions received so far.
    pub submission_count: u32,
    /// Current lifecycle state of the task.
    pub status: TaskStatus,
}

/// Submission structure
///
/// # Field ordering
///
/// Identity → ownership → content (variable-length) → status → timestamp.
/// The single timestamp is placed last so all fixed-width fields are packed
/// together before the heap-allocated `String` fields.
#[contracttype]
#[derive(Clone, Debug)]
pub struct Submission {
    /// Unique submission identifier.
    pub id: u64,
    /// ID of the task this submission belongs to.
    pub task_id: u64,
    /// Address of the contributor who submitted the work.
    pub contributor: Address,
    /// URL pointing to the submitted work (IPFS, Arweave, GitHub, etc.).
    pub work_url: String,
    /// Human-readable description of the work done.
    pub description: String,
    /// Current review status of this submission.
    pub status: SubmissionStatus,
    /// Unix timestamp (seconds) at which the submission was made.
    pub submitted_at: u64,
}

/// Dispute structure
///
/// # Field ordering
///
/// Identity / foreign keys → ownership → content → timestamp.
#[contracttype]
#[derive(Clone, Debug)]
pub struct Dispute {
    /// Unique dispute identifier.
    pub id: u64,
    /// ID of the task the dispute concerns.
    pub task_id: u64,
    /// ID of the submission that triggered the dispute.
    pub submission_id: u64,
    /// Address of the party that raised the dispute.
    pub raiser: Address,
    /// Human-readable explanation of the dispute.
    pub reason: String,
    /// Unix timestamp (seconds) at which the dispute was created.
    pub created_at: u64,
}

/// Error codes
#[contracttype]
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
#[repr(u32)]
pub enum Error {
    TaskNotFound = 1,
    SubmissionNotFound = 2,
    Unauthorized = 3,
    TaskExpired = 4,
    InvalidTaskStatus = 5,
    InvalidSubmissionStatus = 6,
    InsufficientReward = 7,
    InvalidDeadline = 8,
    InvalidMaxSubmissions = 9,
    AlreadySubmitted = 10,
    MaxSubmissionsReached = 11,
    PaymentFailed = 12,
    DisputeAlreadyExists = 13,
}
