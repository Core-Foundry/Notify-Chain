# Webhook Key Rotation Requirements

## Introduction

This feature enables operators to securely rotate webhook signing keys without requiring all consumers to change their configuration simultaneously. The rotation procedure supports a transitional period where multiple signing keys are valid, allowing consumers to update at their own pace while maintaining webhook verification integrity. After the transition period, retired keys stop being accepted and are eligible for deletion.

## Glossary

- **Webhook_Operator**: The system entity responsible for generating, rotating, and managing webhook signing keys
- **Webhook_Consumer**: External system or service that receives and verifies webhook payloads using signing keys
- **Signing_Key**: Cryptographic key used to generate HMAC signatures for webhook payloads
- **Active_Key**: The current key used by the Webhook_Operator to sign outgoing webhook payloads
- **Verification_Key**: A key that can be used by the Webhook_Consumer to verify webhook payload signatures
- **Overlapping_Period**: Time window during rotation when multiple verification keys are valid simultaneously
- **Retired_Key**: A signing key that is no longer used to generate new signatures and is marked for deletion
- **Key_Rotation**: The process of transitioning from one active signing key to a new active signing key
- **Signature_Verification**: The process of validating that a webhook payload's signature matches its content using a verification key
- **Key_Metadata**: Associated information for each key including creation timestamp, activation timestamp, retirement timestamp, and status
- **Payload_Signature**: HMAC-based cryptographic signature appended to or transmitted with webhook payloads
- **Transition_Window**: Configurable time duration during which old and new keys both verify incoming webhooks

## Requirements

### Requirement 1: Webhook Operator Initiates Key Rotation

**User Story:** As a Webhook_Operator, I want to initiate a key rotation procedure, so that I can replace compromised or expired signing keys.

#### Acceptance Criteria

1. WHEN the Webhook_Operator invokes the rotate-key operation, THE Key_Rotation_Service SHALL validate that an Active_Key exists
2. WHEN the Webhook_Operator invokes the rotate-key operation, THE Key_Rotation_Service SHALL generate a new Signing_Key with a cryptographically secure random generator
3. WHEN a new Signing_Key is generated, THE Key_Rotation_Service SHALL assign it a universally unique identifier
4. WHEN a new Signing_Key is generated, THE Key_Rotation_Service SHALL record its creation timestamp in Key_Metadata
5. WHEN the rotate-key operation succeeds, THE Key_Rotation_Service SHALL return the new key identifier and an automatically calculated transition deadline timestamp (current_time + Transition_Window)
6. IF the rotate-key operation is invoked while a rotation is already in progress, THEN THE Key_Rotation_Service SHALL reject the request with error code ROTATION_IN_PROGRESS
7. WHEN the rotate-key operation is invoked, THE Key_Rotation_Service SHALL make the new Signing_Key available for webhook signing within 5 seconds

### Requirement 2: Multiple Verification Keys Support Overlapping Period

**User Story:** As a Webhook_Consumer, I want to verify webhook signatures using either the previous or current signing key during a rotation window, so that I can update my configuration at my own pace.

#### Acceptance Criteria

1. WHILE the Overlapping_Period is active, THE Webhook_Verification_Service SHALL accept Payload_Signature values verified by either the previous Active_Key or the newly rotated Active_Key
2. WHEN a Payload_Signature is verified, THE Webhook_Verification_Service SHALL attempt verification with the current Active_Key first, then the previous Active_Key if the first attempt fails
3. WHEN multiple Verification_Keys are stored for overlapping verification, THE Key_Storage SHALL maintain version metadata indicating which key is current and which is previous
4. WHEN Signature_Verification occurs during the Overlapping_Period, THE Webhook_Verification_Service SHALL log which key was used for successful verification (for audit purposes)
5. WHEN the Overlapping_Period ends, THE Webhook_Verification_Service SHALL stop accepting signatures verified by the previous Active_Key
6. WHERE a Webhook_Consumer has not updated their verification key by the end of the Overlapping_Period, THE Webhook_Verification_Service SHALL reject subsequent webhook signatures with error code SIGNATURE_VERIFICATION_FAILED

### Requirement 3: Overlapping Period Duration Is Configurable

**User Story:** As a Webhook_Operator, I want to configure the duration of the overlapping verification period, so that I can balance security with consumer migration time.

#### Acceptance Criteria

1. WHEN the system is initialized, THE Key_Rotation_Configuration SHALL have a default Transition_Window value of 30 days
2. WHERE the Transition_Window configuration is set, THE Key_Rotation_Service SHALL use the specified duration for all future key rotations (measured in seconds with minimum 3600 and maximum 7776000)
3. WHEN a new key rotation is initiated, THE Key_Rotation_Service SHALL calculate the transition deadline as creation_timestamp + Transition_Window
4. IF an operator attempts to set Transition_Window to a value less than 3600 seconds, THEN THE Key_Rotation_Service SHALL reject the request with error code INVALID_TRANSITION_WINDOW
5. IF an operator attempts to set Transition_Window to a value greater than 7776000 seconds, THEN THE Key_Rotation_Service SHALL reject the request with error code INVALID_TRANSITION_WINDOW
6. WHEN Transition_Window configuration is updated, THE Key_Rotation_Service SHALL apply it only to key rotations initiated after the update; existing rotations SHALL retain their original deadline

### Requirement 4: Retired Keys Stop Being Accepted After Transition

**User Story:** As a Webhook_Operator, I want retired keys to stop being accepted after their transition period expires, so that compromised keys cannot be used to forge valid webhook signatures.

#### Acceptance Criteria

1. WHEN the Overlapping_Period expires for a Retired_Key, THE Webhook_Verification_Service SHALL reject any Payload_Signature that can only be verified using the Retired_Key
2. WHEN current_timestamp exceeds the key's retirement deadline, THE Key_Rotation_Service SHALL mark the key as EXPIRED in Key_Metadata
3. WHEN a Payload_Signature verification attempt is made after key expiration, THE Webhook_Verification_Service SHALL not attempt verification using the EXPIRED key
4. WHEN a Webhook_Consumer attempts to verify a signature with an EXPIRED key after its deadline, THE Webhook_Verification_Service SHALL return error code SIGNATURE_KEY_EXPIRED with a message indicating the key's expiration timestamp
5. WHEN a key reaches EXPIRED status, THE Key_Rotation_Service SHALL emit a KeyExpired event containing the expired key identifier and expiration timestamp
6. IF verification fails because all available keys are expired or invalid, THEN THE Webhook_Verification_Service SHALL return error code NO_VALID_KEYS_FOR_VERIFICATION

### Requirement 5: Key Metadata Tracks All Lifecycle Events

**User Story:** As a Webhook_Operator, I want complete visibility into key lifecycle events, so that I can audit rotation history and troubleshoot verification issues.

#### Acceptance Criteria

1. THE Key_Storage SHALL maintain Key_Metadata for each Signing_Key containing: key_id, status, created_at, rotated_to_active_at, retired_at, expires_at, and algorithm
2. WHEN a Signing_Key is generated, THE Key_Metadata SHALL record the created_at timestamp (UTC, ISO 8601 format)
3. WHEN a Signing_Key becomes Active_Key, THE Key_Metadata SHALL record the rotated_to_active_at timestamp
4. WHEN a Signing_Key is marked as Retired_Key, THE Key_Metadata SHALL record the retired_at timestamp
5. WHEN a Signing_Key reaches expiration, THE Key_Metadata SHALL record the expires_at timestamp
6. WHEN Key_Metadata is queried, THE Key_Storage SHALL return all metadata fields with the current status (GENERATED, ACTIVE, RETIRED, EXPIRED, DELETED)
7. WHEN Key_Metadata expires, THE Key_Metadata record SHALL remain queryable for audit purposes for a minimum of 90 days before becoming eligible for deletion

### Requirement 6: Operators Retrieve Active and Previous Keys

**User Story:** As a Webhook_Operator, I want to retrieve the current Active_Key and previous Verification_Keys, so that I can monitor rotation status and provide guidance to consumers.

#### Acceptance Criteria

1. WHEN the list-active-keys operation is invoked, THE Key_Rotation_Service SHALL return the currently Active_Key and all keys within the Overlapping_Period
2. WHEN list-active-keys is invoked, THE Key_Rotation_Service SHALL include Key_Metadata for each returned key with status, created_at, and expires_at timestamps
3. WHEN list-active-keys is invoked, THE Key_Rotation_Service SHALL indicate which key is the primary Active_Key and which are legacy Verification_Keys
4. WHEN the system has no active key rotation in progress, THE list-active-keys operation SHALL return exactly one key with status ACTIVE
5. WHEN a rotation is in the Overlapping_Period, THE list-active-keys operation SHALL return two keys: one with status ACTIVE and one with status RETIRED (but not yet expired)

### Requirement 7: Consumers Access Public Verification Keys

**User Story:** As a Webhook_Consumer, I want to retrieve the public component of the current Active_Key and previous keys, so that I can verify webhook signatures without storing secrets.

#### Acceptance Criteria

1. WHEN the get-public-keys endpoint is accessed by a Webhook_Consumer, THE Key_Rotation_Service SHALL return all currently valid Verification_Keys' public components
2. WHEN get-public-keys is invoked, THE Key_Rotation_Service SHALL include the key identifier and status for each returned key
3. WHEN get-public-keys is invoked, THE Key_Rotation_Service SHALL NOT include any private key material
4. WHEN get-public-keys is invoked during an Overlapping_Period, THE Key_Rotation_Service SHALL return both the Active_Key and the previous key's public components
5. WHEN get-public-keys is invoked after a key has expired, THE Key_Rotation_Service SHALL exclude the expired key from the response
6. WHEN the get-public-keys endpoint is accessed, THE Key_Rotation_Service SHALL respond within 100 milliseconds
7. WHERE the Webhook_Consumer implements response caching, THE Key_Rotation_Service SHALL include cache control headers indicating a maximum age of 3600 seconds (1 hour)

### Requirement 8: Key Rotation Documentation

**User Story:** As a Webhook_Operator, I want clear documentation of the key rotation procedure, so that my team can execute rotations correctly and consumers understand the process.

#### Acceptance Criteria

1. THE Rotation_Documentation SHALL include step-by-step procedures for initiating a key rotation
2. THE Rotation_Documentation SHALL describe the Overlapping_Period and its duration, including how to calculate the transition deadline
3. THE Rotation_Documentation SHALL explain what actions Webhook_Consumers must take to migrate to the new key
4. THE Rotation_Documentation SHALL document the default Transition_Window value and how operators can modify it
5. THE Rotation_Documentation SHALL include examples of Signature_Verification code for common languages (at minimum: Python, JavaScript, Go)
6. THE Rotation_Documentation SHALL explain the impact of expired keys and provide troubleshooting guidance for verification failures
7. THE Rotation_Documentation SHALL document all error codes that may be returned during verification (SIGNATURE_VERIFICATION_FAILED, SIGNATURE_KEY_EXPIRED, NO_VALID_KEYS_FOR_VERIFICATION, ROTATION_IN_PROGRESS)

### Requirement 9: Signature Verification Remains Deterministic

**User Story:** As a Webhook_Consumer, I want webhook signature verification to be deterministic and reliable, so that I can implement verification logic with confidence.

#### Acceptance Criteria

1. WHEN the same Payload_Signature is verified multiple times using the same Verification_Key, THE Webhook_Verification_Service SHALL return identical results
2. WHEN a Payload_Signature is verified, THE verification result SHALL depend only on: the payload content, the Payload_Signature value, and the key used for verification
3. WHEN verification is performed, THE Webhook_Verification_Service SHALL use constant-time comparison to prevent timing attacks
4. WHEN a Payload_Signature is created with a specific Signing_Key, THE Payload_Signature SHALL only be verified successfully by the corresponding Verification_Key from that Signing_Key pair
5. IF payload content is modified after signature creation, THEN THE Webhook_Verification_Service SHALL reject the Payload_Signature with error code SIGNATURE_VERIFICATION_FAILED
6. WHERE a Webhook_Consumer has multiple verification implementations, THE verification result SHALL be identical across all implementations when using the same Signing_Key and payload

### Requirement 10: Key Storage Provides Durable Persistence

**User Story:** As a Webhook_Operator, I want webhook signing keys to be durably persisted, so that key rotation state remains consistent across system restarts.

#### Acceptance Criteria

1. WHEN a Signing_Key is generated and marked ACTIVE, THE Key_Storage SHALL persist the key to durable storage within 1 second
2. WHEN Key_Metadata is updated, THE Key_Storage SHALL durably persist the update within 1 second
3. WHEN the system is restarted, THE Key_Rotation_Service SHALL retrieve the Active_Key and Retired_Keys from durable storage and be ready to verify signatures within 5 seconds
4. WHEN multiple consecutive key rotations occur, THE Key_Storage SHALL maintain the complete history of all generated, active, retired, and expired keys
5. IF a storage failure occurs during key persistence, THE Key_Rotation_Service SHALL return error code STORAGE_ERROR and not mark the key as successfully activated until persistence succeeds

### Requirement 11: Key Rotation Emits Lifecycle Events

**User Story:** As a Webhook_Operator, I want to receive notifications when key lifecycle events occur, so that I can automate rotation monitoring and alerting.

#### Acceptance Criteria

1. WHEN a new Signing_Key is generated, THE Key_Rotation_Service SHALL emit a KeyGenerated event containing: key_id, created_at, and status=GENERATED
2. WHEN a Signing_Key becomes Active_Key, THE Key_Rotation_Service SHALL emit a KeyActivated event containing: key_id, activated_at, and transition_deadline
3. WHEN a Signing_Key is marked as Retired_Key, THE Key_Rotation_Service SHALL emit a KeyRetired event containing: key_id, retired_at, and expires_at
4. WHEN a Signing_Key reaches expiration, THE Key_Rotation_Service SHALL emit a KeyExpired event containing: key_id, expired_at, and the reason (TRANSITION_WINDOW_EXPIRED)
5. WHERE event listeners are subscribed to key lifecycle events, THE Key_Rotation_Service SHALL deliver events within 5 seconds of the triggering action
6. WHEN a key lifecycle event is emitted, THE Event_Log SHALL durably persist the event for audit purposes

### Requirement 12: Security Implications Are Documented

**User Story:** As a Webhook_Operator, I want security implications and best practices documented, so that I can deploy key rotation safely.

#### Acceptance Criteria

1. THE Security_Guidance SHALL document that Signing_Keys are cryptographically sensitive material and should never be transmitted over unencrypted channels
2. THE Security_Guidance SHALL explain the security implications of the Overlapping_Period and recommend keeping it as short as operationally feasible
3. THE Security_Guidance SHALL document that after key expiration, signatures created with expired keys will be rejected, causing webhook delivery failures for consumers who have not migrated
4. THE Security_Guidance SHALL recommend that operators monitor KeyExpired events and proactively notify consumers before keys expire
5. THE Security_Guidance SHALL document that Retired_Keys should be securely deleted after the retention period expires and they are no longer needed for audit purposes
6. THE Security_Guidance SHALL recommend using separate signing keys for different webhook categories or consumer groups where isolation is required
7. THE Security_Guidance SHALL explain the importance of constant-time verification to prevent timing-based attacks on Signature_Verification

### Requirement 13: Rotation Procedure Does Not Interrupt Webhook Delivery

**User Story:** As a Webhook_Operator, I want webhook delivery to continue uninterrupted during key rotations, so that consumers receive webhooks reliably.

#### Acceptance Criteria

1. WHEN a key rotation is initiated, THE Webhook_Delivery_Service SHALL continue sending webhooks without interruption
2. WHILE a key rotation is in progress, THE Webhook_Delivery_Service SHALL sign new webhooks with the newly Active_Key within 5 seconds of activation
3. WHEN webhooks are signed during an Overlapping_Period, THE Webhook_Delivery_Service SHALL use only the new Active_Key (not the previous key) for new signatures
4. IF a Webhook_Consumer's verification fails during the Overlapping_Period because they are still using the old key, THE Webhook_Delivery_Service SHALL continue attempting delivery (retry logic remains unchanged)
5. WHEN a key rotation is being initiated, THE Key_Rotation_Service SHALL reject concurrent rotation requests to ensure consistency
6. WHEN the Overlapping_Period expires, THE Key_Rotation_Service SHALL emit a warning event if consumers are still using the retired key (detected through verification attempt logs)

### Requirement 14: Configuration and Deployment Aspects

**User Story:** As a Webhook_Operator, I want webhook key rotation to be configurable and deployable in multiple environments, so that I can manage rotations safely across staging and production.

#### Acceptance Criteria

1. WHEN the system is deployed, THE Key_Rotation_Configuration SHALL support environment-specific settings for Transition_Window
2. THE Key_Rotation_Configuration SHALL be loadable from configuration files, environment variables, or a configuration service
3. WHEN Transition_Window is configured differently across environments, THE configuration change SHALL NOT affect already-initiated rotations in other environments
4. WHERE the Key_Rotation_Service is deployed as a distributed system, THE Key_Storage SHALL maintain consistency such that all instances see the same Active_Key and Verification_Keys
5. WHEN the Key_Rotation_Service is deployed, THE system SHALL support graceful startup where rotations in progress are correctly resumed
6. WHEN multiple instances of the Webhook_Delivery_Service are running, THE Webhook_Delivery_Service instances SHALL coordinate to ensure all use the same Active_Key for new signatures (within 5 seconds of activation)

