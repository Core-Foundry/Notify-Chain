use soroban_sdk::{contracttype, Address, BytesN, String};

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
#[contracttype]
#[derive(Clone, Debug)]
pub struct Task {
    pub id: u64,
    pub poster: Address,
    pub title: String,
    pub description: String,
    pub token: Address,           // Token address for reward
    pub reward: i128,             // Reward amount
    pub deadline: u64,            // Unix timestamp
    pub max_submissions: u32,
    pub submission_count: u32,
    pub status: TaskStatus,
    pub created_at: u64,          // Unix timestamp
}

/// Submission structure
#[contracttype]
#[derive(Clone, Debug)]
pub struct Submission {
    pub id: u64,
    pub task_id: u64,
    pub contributor: Address,
    pub work_url: String,         // IPFS, Arweave, GitHub, etc.
    pub description: String,
    pub submitted_at: u64,        // Unix timestamp
    pub status: SubmissionStatus,
}

/// Dispute structure
#[contracttype]
#[derive(Clone, Debug)]
pub struct Dispute {
    pub id: u64,
    pub task_id: u64,
    pub submission_id: u64,
    pub raiser: Address,
    pub reason: String,
    pub created_at: u64,
}

/// API credential record scoped to an organization.
#[contracttype]
#[derive(Clone, Debug)]
pub struct ApiCredential {
    pub id: u64,
    pub organization: Address,
    pub label: String,
    pub fingerprint: BytesN<32>,
    pub created_at: u64,
    pub is_active: bool,
    pub is_primary: bool,
    pub previous_credential_id: u64,
}

/// Rotation audit entry for API credentials.
#[contracttype]
#[derive(Clone, Debug)]
pub struct ApiCredentialRotation {
    pub organization: Address,
    pub old_credential_id: u64,
    pub new_credential_id: u64,
    pub actor: Address,
    pub reason: String,
    pub rotated_at: u64,
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
    ApiKeyNotFound = 14,
    ApiKeyAlreadyExists = 15,
    NoActiveApiKeys = 16,
    InvalidApiKeyRotation = 17,
    ApiKeyRevoked = 18,
    UnauthorizedApiKeyAction = 19,
}
