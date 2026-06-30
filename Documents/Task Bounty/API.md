# TaskBounty API Documentation

Complete API reference for TaskBounty smart contracts.

## Table of Contents

- [TaskBountyCore](#taskbountycore)
- [DisputeResolver](#disputeresolver)
- [TaskBountyFactory](#taskbountyfactory)
- [Events](#events)
- [Errors](#errors)
- [Data Structures](#data-structures)

---

## TaskBountyCore

Main contract for task and bounty management.

### State Variables

#### `disputeResolver`
```solidity
IDisputeResolver public immutable disputeResolver
```
Reference to the dispute resolver contract.

#### `MIN_REWARD`
```solidity
uint256 public constant MIN_REWARD = 0.001 ether
```
Minimum reward amount for creating a task.

#### `MAX_DEADLINE`
```solidity
uint256 public constant MAX_DEADLINE = 365 days
```
Maximum deadline extension from current time.

### Functions

#### `createTask`
```solidity
function createTask(
    string calldata title,
    string calldata description,
    uint256 deadline,
    uint256 maxSubmissions
) external payable returns (uint256 taskId)
```

Creates a new task with escrowed reward.

**Parameters:**
- `title`: Short title of the task
- `description`: Detailed description of requirements
- `deadline`: Unix timestamp when task expires
- `maxSubmissions`: Maximum number of submissions allowed

**Returns:**
- `taskId`: Unique identifier for the created task

**Requirements:**
- `msg.value >= MIN_REWARD`
- `deadline > block.timestamp`
- `deadline <= block.timestamp + MAX_DEADLINE`
- `maxSubmissions > 0`

**Emits:** `TaskCreated`

**Example:**
```solidity
uint256 taskId = bounty.createTask{value: 1 ether}(
    "Build DEX Interface",
    "Create a React frontend for Uniswap V3",
    block.timestamp + 30 days,
    3
);
```

---

#### `submitWork`
```solidity
function submitWork(
    uint256 taskId,
    string calldata workUrl,
    string calldata description
) external returns (uint256 submissionId)
```

Submit work for a task.

**Parameters:**
- `taskId`: ID of the task
- `workUrl`: URL to completed work (GitHub, IPFS, etc.)
- `description`: Description of the work done

**Returns:**
- `submissionId`: Unique identifier for the submission

**Requirements:**
- Task must exist
- Task status must be `Open`
- Task deadline not passed
- Contributor hasn't already submitted
- Max submissions not reached

**Emits:** `WorkSubmitted`

**Example:**
```solidity
uint256 submissionId = bounty.submitWork(
    1,
    "https://github.com/user/dex-interface",
    "Completed DEX interface with responsive design"
);
```

---

#### `approveSubmission`
```solidity
function approveSubmission(
    uint256 taskId,
    uint256 submissionId
) external
```

Approve a submission and release payment to contributor.

**Parameters:**
- `taskId`: ID of the task
- `submissionId`: ID of the submission to approve

**Requirements:**
- Caller must be task poster
- Task must exist
- Submission must exist
- Submission must belong to the task
- Submission status must be `Pending`
- Task not completed or cancelled
- No active disputes

**Emits:** `SubmissionApproved`

**Example:**
```solidity
bounty.approveSubmission(1, 1);
```

---

#### `rejectSubmission`
```solidity
function rejectSubmission(
    uint256 taskId,
    uint256 submissionId,
    string calldata reason
) external
```

Reject a submission.

**Parameters:**
- `taskId`: ID of the task
- `submissionId`: ID of the submission to reject
- `reason`: Reason for rejection

**Requirements:**
- Caller must be task poster
- Task must exist
- Submission must exist
- Submission must belong to the task
- Submission status must be `Pending`

**Emits:** `SubmissionRejected`

**Example:**
```solidity
bounty.rejectSubmission(1, 1, "Does not meet requirements");
```

---

#### `cancelTask`
```solidity
function cancelTask(uint256 taskId) external
```

Cancel a task and refund the poster.

**Parameters:**
- `taskId`: ID of the task to cancel

**Requirements:**
- Caller must be task poster
- Task must exist
- Task not already completed or cancelled
- No approved submissions

**Emits:** `TaskCancelled`

**Example:**
```solidity
bounty.cancelTask(1);
```

---

#### `raiseDispute`
```solidity
function raiseDispute(
    uint256 taskId,
    uint256 submissionId,
    string calldata reason
) external
```

Raise a dispute for a submission.

**Parameters:**
- `taskId`: ID of the task
- `submissionId`: ID of the submission
- `reason`: Reason for the dispute

**Requirements:**
- Task must exist
- Submission must exist
- Submission must belong to the task
- Caller must be task poster or contributor
- Submission status must be `Pending` or `Rejected`

**Emits:** `DisputeRaised`

**Example:**
```solidity
bounty.raiseDispute(1, 1, "Work does not meet stated requirements");
```

---

#### `getTask`
```solidity
function getTask(uint256 taskId) 
    external 
    view 
    returns (Task memory task)
```

Get task details.

**Parameters:**
- `taskId`: ID of the task

**Returns:**
- `task`: Task struct with all details

**Example:**
```solidity
ITaskBounty.Task memory task = bounty.getTask(1);
console.log(task.title);
console.log(task.reward);
```

---

#### `getSubmission`
```solidity
function getSubmission(uint256 submissionId)
    external
    view
    returns (Submission memory submission)
```

Get submission details.

**Parameters:**
- `submissionId`: ID of the submission

**Returns:**
- `submission`: Submission struct with all details

**Example:**
```solidity
ITaskBounty.Submission memory sub = bounty.getSubmission(1);
console.log(sub.contributor);
console.log(sub.workUrl);
```

---

#### `getTaskSubmissions`
```solidity
function getTaskSubmissions(uint256 taskId)
    external
    view
    returns (uint256[] memory submissions)
```

Get all submission IDs for a task.

**Parameters:**
- `taskId`: ID of the task

**Returns:**
- `submissions`: Array of submission IDs

**Example:**
```solidity
uint256[] memory subs = bounty.getTaskSubmissions(1);
for (uint256 i = 0; i < subs.length; i++) {
    ITaskBounty.Submission memory sub = bounty.getSubmission(subs[i]);
    // Process submission
}
```

---

#### `hasContributorSubmitted`
```solidity
function hasContributorSubmitted(uint256 taskId, address contributor)
    external
    view
    returns (bool)
```

Check if a contributor has submitted for a task.

**Parameters:**
- `taskId`: ID of the task
- `contributor`: Address of the contributor

**Returns:**
- `bool`: True if contributor has submitted

---

#### `getTotalTasks`
```solidity
function getTotalTasks() external view returns (uint256)
```

Get total number of tasks created.

**Returns:**
- `uint256`: Total task count

---

#### `getTotalSubmissions`
```solidity
function getTotalSubmissions() external view returns (uint256)
```

Get total number of submissions.

**Returns:**
- `uint256`: Total submission count

---

## API Credential Management

Organizations can keep old and new API credentials active at the same time during a rotation window.

### Workflow

1. Register a new credential for the organization.
2. Keep the existing credential active until integrations are migrated.
3. Promote the new credential to primary for new traffic.
4. Revoke the old credential after cutover.
5. Review the rotation log for audit evidence.

### Functions

#### `registerApiKey`
```solidity
function registerApiKey(
    address organization,
    string calldata label,
    bytes32 fingerprint
) external returns (uint256 credentialId)
```

Registers a new active credential.

**Requirements:**
- Caller must control `organization`
- Active fingerprints must be unique per organization

#### `rotateApiKey`
```solidity
function rotateApiKey(
    address organization,
    uint256 currentCredentialId,
    string calldata label,
    bytes32 fingerprint,
    string calldata reason
) external returns (uint256 newCredentialId)
```

Registers a new primary credential and preserves the old one until revocation.

**Requirements:**
- Caller must control `organization`
- Current credential must exist and be active
- New fingerprint must not already be active

#### `revokeApiKey`
```solidity
function revokeApiKey(address organization, uint256 credentialId) external
```

Revokes a credential and promotes another active credential if one exists.

#### `getActiveApiKeys`
```solidity
function getActiveApiKeys(address organization)
    external
    view
    returns (ApiCredential[] memory)
```

Returns all active credentials for an organization.

#### `getApiKeyRotationHistory`
```solidity
function getApiKeyRotationHistory(address organization)
    external
    view
    returns (ApiCredentialRotation[] memory)
```

Returns the immutable rotation history for audit review.

#### `isApiKeyActive`
```solidity
function isApiKeyActive(address organization, bytes32 fingerprint)
    external
    view
    returns (bool)
```

Checks whether a fingerprint is currently active.

---

## DisputeResolver

Handles dispute resolution for TaskBounty.

### State Variables

#### `taskBountyContract`
```solidity
address public immutable taskBountyContract
```
Address of the TaskBounty contract.

#### `owner`
```solidity
address public owner
```
Owner of the contract (can manage arbitrators).

#### `arbitrators`
```solidity
mapping(address => bool) public arbitrators
```
Mapping of authorized arbitrators.

### Functions

#### `createDispute`
```solidity
function createDispute(
    uint256 taskId,
    uint256 submissionId,
    address raiser,
    string calldata reason
) external returns (uint256 disputeId)
```

Create a new dispute.

**Parameters:**
- `taskId`: ID of the task
- `submissionId`: ID of the submission
- `raiser`: Address raising the dispute
- `reason`: Reason for the dispute

**Returns:**
- `disputeId`: Unique identifier for the dispute

**Requirements:**
- Caller must be TaskBounty contract
- No existing dispute for this submission

**Emits:** `DisputeCreated`

---

#### `resolveDispute`
```solidity
function resolveDispute(uint256 disputeId, bool favorContributor) external
```

Resolve a dispute.

**Parameters:**
- `disputeId`: ID of the dispute
- `favorContributor`: True if ruling in favor of contributor

**Requirements:**
- Caller must be an arbitrator
- Dispute must exist
- Dispute status must be `Open`

**Emits:** `DisputeResolved`

**Example:**
```solidity
resolver.resolveDispute(1, true);  // Favor contributor
```

---

#### `getDispute`
```solidity
function getDispute(uint256 disputeId)
    external
    view
    returns (Dispute memory dispute)
```

Get dispute details.

**Parameters:**
- `disputeId`: ID of the dispute

**Returns:**
- `dispute`: Dispute struct with all details

---

#### `hasActiveDispute`
```solidity
function hasActiveDispute(uint256 taskId, uint256 submissionId)
    external
    view
    returns (bool)
```

Check if a submission has an active dispute.

**Parameters:**
- `taskId`: ID of the task
- `submissionId`: ID of the submission

**Returns:**
- `bool`: True if there's an active dispute

---

#### `addArbitrator`
```solidity
function addArbitrator(address arbitrator) external
```

Add an arbitrator.

**Parameters:**
- `arbitrator`: Address to add as arbitrator

**Requirements:**
- Caller must be owner

**Emits:** `ArbitratorAdded`

---

#### `removeArbitrator`
```solidity
function removeArbitrator(address arbitrator) external
```

Remove an arbitrator.

**Parameters:**
- `arbitrator`: Address to remove as arbitrator

**Requirements:**
- Caller must be owner

**Emits:** `ArbitratorRemoved`

---

#### `transferOwnership`
```solidity
function transferOwnership(address newOwner) external
```

Transfer ownership.

**Parameters:**
- `newOwner`: Address of new owner

**Requirements:**
- Caller must be owner

**Emits:** `OwnershipTransferred`

---

## TaskBountyFactory

Factory for deploying TaskBounty instances.

### Functions

#### `deployBounty`
```solidity
function deployBounty(address arbitrator)
    external
    returns (address bountyAddress, address resolverAddress)
```

Deploy a new TaskBounty instance with dispute resolver.

**Parameters:**
- `arbitrator`: Initial arbitrator for the dispute resolver

**Returns:**
- `bountyAddress`: Address of deployed TaskBounty
- `resolverAddress`: Address of deployed DisputeResolver

**Emits:** `BountyDeployed`

**Example:**
```solidity
(address bounty, address resolver) = factory.deployBounty(arbitratorAddress);
```

---

#### `getAllBounties`
```solidity
function getAllBounties() external view returns (address[] memory)
```

Get all deployed bounty addresses.

**Returns:**
- `address[]`: Array of bounty addresses

---

#### `getBountiesByCreator`
```solidity
function getBountiesByCreator(address creator)
    external
    view
    returns (address[] memory)
```

Get bounties created by a specific address.

**Parameters:**
- `creator`: Creator address

**Returns:**
- `address[]`: Array of bounty addresses

---

#### `getTotalBounties`
```solidity
function getTotalBounties() external view returns (uint256)
```

Get total number of deployed bounties.

**Returns:**
- `uint256`: Total bounty count

---

## Events

### TaskBountyCore Events

#### `TaskCreated`
```solidity
event TaskCreated(
    uint256 indexed taskId,
    address indexed poster,
    string title,
    uint256 reward,
    uint256 deadline
)
```

Emitted when a new task is created.

---

#### `WorkSubmitted`
```solidity
event WorkSubmitted(
    uint256 indexed taskId,
    uint256 indexed submissionId,
    address indexed contributor,
    string workUrl
)
```

Emitted when work is submitted for a task.

---

#### `SubmissionApproved`
```solidity
event SubmissionApproved(
    uint256 indexed taskId,
    uint256 indexed submissionId,
    address indexed contributor,
    uint256 reward
)
```

Emitted when a submission is approved.

---

#### `SubmissionRejected`
```solidity
event SubmissionRejected(
    uint256 indexed taskId,
    uint256 indexed submissionId,
    address indexed contributor
)
```

Emitted when a submission is rejected.

---

#### `TaskCancelled`
```solidity
event TaskCancelled(uint256 indexed taskId, address indexed poster)
```

Emitted when a task is cancelled.

---

#### `DisputeRaised`
```solidity
event DisputeRaised(
    uint256 indexed taskId,
    uint256 indexed submissionId,
    address indexed raiser,
    string reason
)
```

Emitted when a dispute is raised.

---

### DisputeResolver Events

#### `DisputeCreated`
```solidity
event DisputeCreated(
    uint256 indexed disputeId,
    uint256 indexed taskId,
    uint256 indexed submissionId,
    address raiser,
    string reason
)
```

Emitted when a dispute is created.

---

#### `DisputeResolved`
```solidity
event DisputeResolved(
    uint256 indexed disputeId,
    address indexed resolver,
    bool favorContributor
)
```

Emitted when a dispute is resolved.

---

## Errors

### TaskBountyCore Errors

- `TaskNotFound()`: Task doesn't exist
- `SubmissionNotFound()`: Submission doesn't exist
- `Unauthorized()`: Caller not authorized
- `TaskExpired()`: Task deadline has passed
- `InvalidTaskStatus()`: Task not in correct status
- `InvalidSubmissionStatus()`: Submission not in correct status
- `InsufficientReward()`: Reward below minimum
- `InvalidDeadline()`: Deadline is invalid
- `InvalidMaxSubmissions()`: Max submissions is invalid
- `AlreadySubmitted()`: Contributor already submitted
- `MaxSubmissionsReached()`: Max submissions reached
- `PaymentFailed()`: Payment transfer failed
- `ReentrancyDetected()`: Reentrancy attempt detected

### DisputeResolver Errors

- `Unauthorized()`: Caller not authorized
- `DisputeNotFound()`: Dispute doesn't exist
- `InvalidDisputeStatus()`: Dispute not in correct status
- `DisputeAlreadyExists()`: Dispute already exists for submission

---

## Data Structures

### Task
```solidity
struct Task {
    uint256 id;              // Unique identifier
    address poster;          // Task creator
    string title;            // Short title
    string description;      // Detailed requirements
    uint256 reward;          // Escrowed payment
    uint256 deadline;        // Submission deadline
    uint256 maxSubmissions;  // Max allowed submissions
    uint256 submissionCount; // Current submission count
    TaskStatus status;       // Current state
    uint256 createdAt;       // Creation timestamp
}
```

### TaskStatus
```solidity
enum TaskStatus {
    Open,       // Task is open for submissions
    InProgress, // Work has been submitted
    Completed,  // Task completed and paid
    Cancelled,  // Task cancelled by poster
    Disputed    // Task is under dispute
}
```

### Submission
```solidity
struct Submission {
    uint256 id;              // Unique identifier
    uint256 taskId;          // Associated task
    address contributor;     // Submitter address
    string workUrl;          // Link to work
    string description;      // Work description
    uint256 submittedAt;     // Submission timestamp
    SubmissionStatus status; // Current state
}
```

### SubmissionStatus
```solidity
enum SubmissionStatus {
    Pending,  // Awaiting review
    Approved, // Approved and paid
    Rejected  // Rejected by task poster
}
```

### Dispute
```solidity
struct Dispute {
    uint256 id;              // Unique identifier
    uint256 taskId;          // Associated task
    uint256 submissionId;    // Associated submission
    address raiser;          // Who raised the dispute
    string reason;           // Dispute reason
    uint256 createdAt;       // Creation timestamp
    DisputeStatus status;    // Current state
    bool favorContributor;   // Resolution outcome
    address resolver;        // Arbitrator who resolved
}
```

### DisputeStatus
```solidity
enum DisputeStatus {
    Open,      // Dispute is open for resolution
    Resolved,  // Dispute has been resolved
    Cancelled  // Dispute was cancelled
}
```

---

## Usage Examples

### Complete Workflow

```solidity
// 1. Create task
uint256 taskId = bounty.createTask{value: 1 ether}(
    "Build DEX Interface",
    "Create a React frontend for Uniswap V3",
    block.timestamp + 30 days,
    3
);

// 2. Submit work
uint256 submissionId = bounty.submitWork(
    taskId,
    "https://github.com/user/dex-ui",
    "Completed interface"
);

// 3. Approve and pay
bounty.approveSubmission(taskId, submissionId);
```

### Dispute Workflow

```solidity
// 1. Reject submission
bounty.rejectSubmission(taskId, submissionId, "Incomplete");

// 2. Raise dispute
bounty.raiseDispute(taskId, submissionId, "Work is complete");

// 3. Resolve dispute (as arbitrator)
uint256 disputeId = resolver.getSubmissionDisputeId(taskId, submissionId);
resolver.resolveDispute(disputeId, true);
```

---

For more examples, see the [README.md](README.md) and test files in `test/`.
