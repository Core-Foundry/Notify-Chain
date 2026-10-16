# Implementation Plan: Slack Contract Events Integration

## Overview

This plan breaks down the Slack integration system into discrete implementation steps, organized by component dependency. Each task builds on previous tasks, ensuring dependencies are satisfied before implementation begins. The approach moves from infrastructure setup through component implementation to orchestration and testing.

## Phase 1: Project Setup and Infrastructure

- [ ] 1. Set up project structure, dependencies, and TypeScript configuration
  - Initialize npm project with TypeScript, Jest for unit testing, and fast-check for property-based testing
  - Create directory structure: `src/{components,adapters,utils,types,tests}`
  - Configure tsconfig.json for strict mode, ES2020 target
  - Configure Jest with TypeScript support and coverage thresholds (90% minimum)
  - Create .gitignore excluding .env, node_modules, dist, coverage
  - Create .env.example with required variables: SLACK_BOT_TOKEN, NODE_ENV, LOG_LEVEL
  - _Requirements: 8, 19_

- [ ] 2. Set up type definitions and core interfaces
  - Define ContractEvent, EventType, EventPayload union types
  - Define Slack Block Kit types: SlackMessage, Block, HeaderBlock, SectionBlock, ContextBlock, ActionBlock
  - Define text objects: PlainTextObject, RichTextObject, MarkdownTextObject
  - Create EventFormatter, FormatterRegistry, Validator, DeliveryAdapter interfaces
  - Create DeliveryStatus, DeliveryMetadata, DeliveryResult types
  - Create ChannelConfig, ChannelRoute, ChannelDestination types
  - _Requirements: 1, 2, 6, 9, 10_

- [ ] 3. Set up credential management infrastructure
  - Create CredentialConfig interface with slackBotToken, slackWebhookUrl, environment fields
  - Implement loadCredentials() function to read from environment variables
  - Add credential validation: token format check (xoxb- prefix), required field validation
  - Implement maskCredential() for logging safety
  - Add .env file loading for development (conditional on NODE_ENV)
  - Create startup credential validation that fails gracefully with clear error messages
  - _Requirements: 8, 19_

- [ ] 4. Set up structured logging infrastructure
  - Create LogEntry interface with timestamp, level, component, message, metadata fields
  - Implement StructuredLogger class with log() method
  - Add automatic credential masking in logs for sensitive fields (token, secret, key)
  - Configure JSON output format for structured logging
  - Add log level filtering (info, warn, error, debug)
  - _Requirements: 13, 19_

## Phase 2: Component Implementation - Formatter

- [ ] 5. Implement FormatterRegistry and base formatter infrastructure
  - Create FormatterRegistry class with getFormatter() and registerFormatter() methods
  - Implement base EventFormatter interface with format() and prettyPrint() methods
  - Create utility functions for common formatting tasks: formatTimestamp(), formatDate(), escapeSpecialCharacters()
  - Add helper for creating standard header blocks with emoji support
  - Add helper for creating standard footer blocks with links to contract system
  - _Requirements: 1, 2_

- [ ] 6. Implement TaskCreatedFormatter
  - Extract payload fields: taskId, creatorName, taskTitle, deadline, assignedRecipient, description
  - Build header block with "📋 New Task Created" text
  - Build metadata context block with event type and timestamp
  - Build content section with task details using mrkdwn fields
  - Conditionally include optional fields (assignedRecipient, description)
  - Build footer context block with system link
  - Return complete SlackMessage with blocks array
  - _Requirements: 2, 3_

  - [ ]* 6.1 Write property test for TaskCreatedFormatter round-trip consistency
    - **Property 1: Round-trip consistency**
    - **Validates: Requirements 3, 11, 17**

  - [ ]* 6.2 Write unit tests for TaskCreatedFormatter
    - Test valid event formatting with all fields present
    - Test event with optional fields omitted
    - Test idempotence: format same event twice, verify identical output
    - Test edge case: maximum-length task title (3000 chars)
    - Test special characters in task title
    - _Requirements: 3, 12_

- [ ] 7. Implement WorkSubmittedFormatter
  - Extract payload fields: submissionTimestamp, submitterName, workSummary, completionPercentage, metrics
  - Build header block with "✅ Work Submitted" text
  - Build metadata context block
  - Build content section with submission details and metrics
  - Conditionally include optional fields
  - Build footer context block
  - _Requirements: 2, 4_

  - [ ]* 7.1 Write property test for WorkSubmittedFormatter round-trip consistency
    - **Property 1: Round-trip consistency**
    - **Validates: Requirements 4, 11, 17**

  - [ ]* 7.2 Write unit tests for WorkSubmittedFormatter
    - Test valid event with all fields
    - Test various completion percentages (0%, 50%, 100%)
    - Test idempotence property
    - _Requirements: 4, 12_

- [ ] 8. Implement CompletionAnnouncedFormatter, WorkRejectedFormatter, AssignmentUpdatedFormatter
  - CompletionAnnouncedFormatter: Extract completionStatus, completionNotes, finalMetrics; build message blocks
  - WorkRejectedFormatter: Extract rejectionReason, remediationGuidance; build message blocks
  - AssignmentUpdatedFormatter: Extract oldAssignment, newAssignment; show old/new details
  - Build header, metadata, content, and footer blocks for each
  - _Requirements: 2, 5_

  - [ ]* 8.1 Write property tests for completion/status formatters round-trip consistency
    - **Property 1: Round-trip consistency for CompletionAnnouncedFormatter**
    - **Property 2: Round-trip consistency for WorkRejectedFormatter**
    - **Property 3: Round-trip consistency for AssignmentUpdatedFormatter**
    - **Validates: Requirements 5, 11, 17**

  - [ ]* 8.2 Write unit tests for completion/status formatters
    - Test each formatter with valid events
    - Test idempotence for each
    - Test optional fields omission
    - _Requirements: 5, 12_

- [ ] 9. Implement DeadlineExtendedFormatter and ContractClosedFormatter
  - DeadlineExtendedFormatter: Extract oldDeadline, newDeadline, extension reason; build message blocks
  - ContractClosedFormatter: Extract closureReason, closureNotes, finalStatus; build message blocks
  - _Requirements: 1, 2_

  - [ ]* 9.1 Write unit tests for remaining formatters
    - Test DeadlineExtendedFormatter with various deadline ranges
    - Test ContractClosedFormatter with different closure reasons
    - _Requirements: 1, 12_

- [ ] 10. Implement prettyPrint() for all formatters
  - Create helper function blockToString() to convert Block to human-readable format
  - Implement prettyPrint() returning formatted text representation of SlackMessage
  - Support visual hierarchy (headers, sections, context)
  - Include block_id for debugging
  - _Requirements: 2, 11_

- [ ] 11. Checkpoint - All formatters complete with tests passing
  - Ensure all formatter tests pass
  - Verify 90% code coverage for formatter module
  - Ask user if questions arise

## Phase 3: Component Implementation - Validator

- [ ] 12. Implement SlackBlockKitValidator
  - Create Validator interface and ValidationResult, ValidationError types
  - Implement validate() method checking blocks exist and are non-empty
  - Implement validateBlock() for type-specific validation
  - Implement validateHeaderBlock(): verify plain_text type, text length ≤ 3000 chars
  - Implement validateSectionBlock(): verify text length limits (3000 plain_text, 2000 rich_text)
  - Implement validateContextBlock(): verify at least one element exists
  - Return ValidationResult with valid flag and detailed error array
  - _Requirements: 9, 18_

  - [ ]* 12.1 Write unit tests for SlackBlockKitValidator
    - Test valid SlackMessage accepts
    - Test missing block_id rejection
    - Test oversized text field rejection (4000+ chars)
    - Test missing required fields
    - Test emoji and special character validation
    - _Requirements: 9, 12, 18_

- [ ] 13. Add text field length validation and special character escaping
  - Implement validateTextLength() checking against max limits
  - Implement escapeSpecialCharacters() for Slack's requirements (backslashes, angle brackets)
  - Add emoji validation helpers
  - Add Unicode content support validation
  - _Requirements: 9_

  - [ ]* 13.1 Write unit tests for text validation edge cases
    - Test maximum-length fields (3000, 2000 chars)
    - Test oversized field rejection with specific error message
    - Test special character handling
    - Test Unicode content acceptance
    - _Requirements: 12_

- [ ] 14. Checkpoint - Validator complete and tested
  - Ensure all validator tests pass
  - Verify no integration issues with formatters
  - Ask user if questions arise

## Phase 4: Component Implementation - Credential Management

- [ ] 15. Implement CredentialManager with environment variable loading
  - Create loadCredentials() reading SLACK_BOT_TOKEN and SLACK_WEBHOOK_URL
  - Implement token format validation (xoxb- prefix for bot tokens)
  - Throw descriptive error if SLACK_BOT_TOKEN missing
  - Throw descriptive error if token format invalid
  - Load environment (NODE_ENV) and logging preference
  - Set logCredentialMask default to true
  - _Requirements: 8, 19_

- [ ] 16. Add .env file support for development
  - Implement loadDotEnv() function conditional on NODE_ENV !== 'production'
  - Parse .env file line-by-line extracting KEY=VALUE pairs
  - Skip loading if .env file doesn't exist (optional for production)
  - Only load env vars not already set in process.env
  - Add documentation that .env must be in .gitignore
  - _Requirements: 8, 19_

  - [ ]* 16.1 Write unit tests for credential management
    - Test successful credential loading from env vars
    - Test error when SLACK_BOT_TOKEN missing
    - Test error when token format invalid
    - Test .env file loading in development
    - Test credential masking in logs
    - _Requirements: 8_

- [ ] 17. Checkpoint - Credentials loading and validation complete
  - Verify credentials validate at startup
  - Ensure no credentials leak in logs
  - Ask user if questions arise

## Phase 5: Component Implementation - Channel Router

- [ ] 18. Implement ChannelRouter with configuration loading
  - Create loadChannelConfig() supporting JSON and YAML formats
  - Detect file format by extension (.json, .yaml, .yml)
  - Parse JSON directly, use yaml library for YAML
  - Implement validateChannelConfig() checking channel ID format (#channel or @Uxxxxxx)
  - Implement routeEvent() mapping EventType to target channels
  - Support default channel routing when EventType not configured
  - _Requirements: 10, 14_

- [ ] 19. Add channel routing conditions and filtering
  - Implement evaluateCondition() supporting operators: eq, gt, lt, in, contains
  - Filter channel destinations by route conditions based on event payload
  - Support conditional routing (e.g., only high-value contracts to specific channel)
  - Return empty array if no conditions match
  - _Requirements: 10, 14_

  - [ ]* 19.1 Write unit tests for ChannelRouter
    - Test loading valid JSON and YAML config files
    - Test invalid channel ID rejection
    - Test event routing to single channel
    - Test event routing to multiple channels
    - Test conditional routing based on payload values
    - Test default channel fallback
    - _Requirements: 10, 14_

- [ ] 20. Add dead-letter channel support
  - Add deadLetterChannel field to ChannelConfig
  - Store dead-letter channel ID in configuration
  - Implement getDeadLetterChannel() returning configured dead-letter or null
  - Document dead-letter channel usage
  - _Requirements: 7, 16_

- [ ] 21. Checkpoint - Channel Router complete
  - Verify routing logic works correctly
  - Test with various configuration scenarios
  - Ask user if questions arise

## Phase 6: Component Implementation - Delivery Adapter

- [ ] 22. Implement SlackClient wrapper for Slack Web API
  - Create SlackClient interface with postMessage() method
  - Implement HTTP client using node-fetch or axios
  - Add authentication header with Bearer token
  - Add version and integration identifier headers for tracking
  - Implement postMessage(channelId, message, options) posting to chat.postMessage endpoint
  - Return PostMessageResponse with ok, ts, channel, error fields
  - _Requirements: 6, 18_

- [ ] 23. Implement exponential backoff retry logic
  - Create RetryStrategy interface: maxAttempts, initialDelayMs, maxDelayMs, jitterFactor
  - Implement calculateBackoffDelay(attempt, strategy) with exponential backoff formula
  - Add jitter: ±jitterFactor * delay to randomize retry timing
  - Default strategy: 3 attempts, 1s initial, 32s max, 0.1 jitter
  - Document retry timeline: ~1s, ~2s, ~4s with jitter
  - _Requirements: 7_

  - [ ]* 23.1 Write unit tests for retry logic
    - Test delay calculation for each attempt number
    - Test jitter randomness (values within expected range)
    - Test max delay cap
    - _Requirements: 7_

- [ ] 24. Implement error classification and retry decision logic
  - Create SlackErrorType enum: authentication_failed, rate_limited, transient_error, invalid_channel, validation_error, unknown_error
  - Implement classifyError() mapping response codes to error types
  - Implement shouldRetry() determining if error is retryable
  - Retry rate_limited and transient_error; don't retry auth/validation/channel errors
  - Log classification for debugging
  - _Requirements: 6, 7, 18_

  - [ ]* 24.1 Write unit tests for error classification
    - Test authentication error detection (invalid_token, token_revoked)
    - Test rate limiting detection (429 status)
    - Test transient error detection (500, 503, timeout)
    - Test channel not found detection
    - Test validation error detection
    - _Requirements: 18_

- [ ] 25. Implement DeliveryAdapter with retry and status tracking
  - Create DeliveryAdapter class implementing send() method
  - Implement retry loop: attempt, classify error, decide retry, schedule next attempt
  - Track delivery attempts in AttemptRecord array
  - Update DeliveryStatus after each attempt
  - Return DeliveryResult: {status, messageId} on success
  - Return DeliveryResult: {status, reason, nextRetry} on retry
  - Return DeliveryResult: {status, reason, finalAttempt} on failure
  - Log all significant delivery events (send, retry, success, failure)
  - _Requirements: 6, 7, 15_

  - [ ]* 25.1 Write unit tests for DeliveryAdapter
    - Mock successful delivery: verify status=success, messageId recorded
    - Mock auth failure: verify no retry attempt
    - Mock rate limiting: verify retry scheduled
    - Mock transient error: verify retry with backoff
    - Test all retry attempts exhausted: verify final failure status
    - _Requirements: 6, 7, 15_

- [ ] 26. Add delivery status persistence and querying
  - Create DeliveryStatusStore interface with save(), findById(), findByEventType(), findByChannel() methods
  - Implement in-memory store for development (Map-based)
  - Store DeliveryStatus with all metadata and AttemptRecord history
  - Support querying by deliveryId, eventType, channelId, timestamp range
  - Document interface for future database implementations
  - _Requirements: 15_

  - [ ]* 26.1 Write unit tests for delivery status tracking
    - Test storing delivery status with metadata
    - Test querying by delivery ID
    - Test querying by event type
    - Test querying by channel
    - _Requirements: 15_

- [ ] 27. Checkpoint - Delivery Adapter complete with retry and tracking
  - Verify all retry scenarios work correctly
  - Test with mock Slack API responses
  - Ask user if questions arise

## Phase 7: Event Processor and Orchestration

- [ ] 28. Implement EventProcessor orchestrating formatter → validator → router → delivery
  - Create EventProcessor class with process(event) method
  - Step 1: Check if EventType is supported by FormatterRegistry
  - Step 2: Format event using appropriate formatter (skip if unsupported)
  - Step 3: Validate formatted message using Validator
  - Step 4: Route event to channels using ChannelRouter
  - Step 5: Create delivery task for each channel
  - Handle errors at each step: log, don't propagate (graceful degradation)
  - Return ProcessingResult with status and delivery IDs
  - _Requirements: 1, 6, 10_

- [ ] 29. Add dead-letter handling in EventProcessor
  - When delivery fails after retries: check if deadLetterChannel configured
  - Create dead-letter notification summarizing failure
  - Include original EventType, failure reason, reference ID
  - Send dead-letter notification to deadLetterChannel using same delivery pipeline
  - Log dead-letter delivery status
  - _Requirements: 7, 16_

- [ ] 30. Add queue management for graceful degradation
  - Create MessageQueue interface for pending/queued messages
  - Implement in-memory queue for development (Array-based with max size)
  - When Slack unavailable: queue messages instead of failing
  - Implement queue drain when Slack recovers
  - Track queue size and emit warnings when exceeding threshold (default: 1000)
  - _Requirements: 20_

  - [ ]* 30.1 Write unit tests for event processing
    - Test successful end-to-end flow: format → validate → route → deliver
    - Test unsupported event type: verify logged, not delivered
    - Test validation failure: verify logged, not delivered
    - Test dead-letter delivery on final failure
    - Test queue management with unavailable Slack
    - _Requirements: 1, 16, 20_

- [ ] 31. Checkpoint - EventProcessor complete and integrated
  - Test full flow with mock formatters, validators, router, delivery adapter
  - Verify error handling and graceful degradation
  - Ask user if questions arise

## Phase 8: Integration Tests and End-to-End Verification

- [ ] 32. Write integration test suite
  - Create test utilities: createSampleEvent(), mockSlackClient(), mockChannelConfig()
  - Test complete flow: TaskCreated event → formatted → validated → routed → delivered
  - Test error scenarios: auth failure, validation failure, routing failure
  - Test queue and retry scenarios
  - Test with multiple event types and channels
  - Verify logging output contains expected information
  - _Requirements: 1, 6, 12, 13_

- [ ] 33. Write property-based test suite
  - Generate random valid ContractEvents for each EventType
  - Verify round-trip property: format → parse → format yields equivalent result
  - Verify idempotence: format(event) === format(event)
  - Run 100+ property test cases per event type
  - Log failing examples for debugging
  - _Requirements: 3, 4, 5, 11, 17_

- [ ] 34. Verify coverage and create coverage report
  - Run Jest with coverage reporting (html and lcov formats)
  - Generate coverage report showing line, branch, function coverage
  - Verify all modules meet 90% threshold
  - Identify and document any untested error paths
  - _Requirements: 12_

- [ ] 35. Checkpoint - Integration tests complete and passing
  - Ensure all tests pass with >90% coverage
  - Ask user if questions arise

## Phase 9: Documentation and Configuration Examples

- [ ] 36. Create comprehensive README
  - Document system overview and architecture
  - List all environment variables required
  - Include quick-start setup instructions
  - Document all component interfaces and responsibilities
  - Include troubleshooting section for common issues
  - Document how to add new event type formatters
  - _Requirements: 19_

- [ ] 37. Create environment configuration templates
  - Create .env.example with all required variables
  - Create config/channels.development.yaml with sample routes
  - Create config/channels.staging.yaml with production-like configuration
  - Create config/channels.production.yaml with example high-value routing
  - Document each configuration option
  - _Requirements: 10, 14, 19_

- [ ] 38. Create deployment guides
  - Document Docker deployment with environment variable setup
  - Document Kubernetes deployment with secret management
  - Document Lambda deployment with environment variables via SAM/CloudFormation
  - Document local development setup with .env file
  - _Requirements: 19_

- [ ] 39. Create troubleshooting guide
  - Document common errors: missing credentials, invalid channel IDs, validation failures
  - Document retry logic and backoff behavior
  - Document logging and how to enable debug logging
  - Document how to query delivery status for investigation
  - _Requirements: 13, 19_

- [ ] 40. Checkpoint - Documentation complete
  - Review all documentation for accuracy and completeness
  - Ask user if questions arise

## Phase 10: Final Verification and Cleanup

- [ ] 41. Final integration test run
  - Run complete test suite: unit, integration, property-based tests
  - Verify all tests pass
  - Verify coverage meets 90% threshold
  - Clean up any temporary test files
  - Ensure no credentials or secrets in test outputs
  - _Requirements: All_

- [ ] 42. Final checkpoint - All tasks complete
  - Ensure all tests pass, ask the user if questions arise.

## Summary

This implementation plan provides a complete roadmap for the Slack integration system:
- **12 tasks** for setup, infrastructure, and configuration
- **10 tasks** for component implementation (Formatter, Validator, Credentials, Router)
- **6 tasks** for delivery and orchestration
- **8 tasks** for integration, testing, and documentation
- **Property-based tests** embedded throughout for correctness verification
- **Checkpoint tasks** for incremental validation and user feedback
- **90% code coverage** requirement throughout
