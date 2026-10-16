# Slack Integration for Contract Events - Technical Design

## Overview

The Slack integration system provides real-time delivery of contract lifecycle events to Slack channels. The architecture follows a modular, layered design with clear separation of concerns: event formatting, validation, delivery, credential management, and configuration routing.

**Core Objective**: Convert contract domain events into Slack Block Kit messages and reliably deliver them to configured channels with retry capability, graceful error handling, and comprehensive logging.

**Key Design Principles**:
- **Modularity**: Each component has a single responsibility (Formatter, Delivery Adapter, Validator, Router)
- **Resilience**: Exponential backoff retry logic, dead-letter channels, queue-based recovery
- **Security**: Credentials via environment variables only, no secrets in logs or version control
- **Testability**: Pure formatting functions, round-trip properties, property-based testing
- **Observability**: Detailed logging, delivery status tracking, metrics emission

---

## Architecture

### High-Level System Components

```
Contract Event
     |
     v
┌─────────────────────────────────────────────────────────┐
│                    Event Processor                       │
│  (routes events, manages lifecycle, orchestrates flow) │
└────────────────┬────────────────────────────────────────┘
                 |
     ┌───────────┴───────────┬──────────────┐
     |                       |              |
     v                       v              v
┌─────────────────┐   ┌──────────────┐   ┌───────────────┐
│   Formatter     │   │  Validator   │   │ Channel Router│
│                 │   │              │   │               │
│ (Events →       │   │ (Validates   │   │ (Maps event  │
│  Block Kits)    │   │  Block Kit   │   │  types to    │
│                 │   │  schema)     │   │  channels)   │
└────────┬────────┘   └──────────────┘   └───────────────┘
         |
         v
┌─────────────────────────────────────────────────────────┐
│            Delivery Adapter                              │
│  (sends to Slack, handles retries, tracks status)      │
└────────────────┬────────────────────────────────────────┘
                 |
                 | POST to Slack Web API
                 |
                 v
            Slack Channels
```

### Component Responsibilities

**Event Processor**
- Receives contract events from event bus
- Determines if event type is supported
- Orchestrates formatting → validation → delivery
- Manages overall lifecycle and error handling
- Logs all significant steps

**Formatter**
- Converts Contract_Event domain objects to Slack_Message_Block structures
- Implements Block Kit schema compliance
- Handles optional field omission
- Provides pretty-printer for testing
- Maintains idempotency

**Validator**
- Verifies Block Kit schema compliance
- Checks text field length limits (3000 plain_text, 2000 rich_text)
- Validates emoji and special character escaping
- Reports detailed validation errors

**Channel Router**
- Loads Channel_Config from JSON/YAML files
- Maps Event_Type → target channel(s)
- Validates channel identifiers
- Supports conditional routing based on contract properties
- Provides dead-letter channel support

**Delivery Adapter**
- Authenticates with Slack Web API using bot token
- Sends messages via chat.postMessage endpoint
- Implements exponential backoff retry strategy
- Distinguishes error types (auth, rate limit, transient)
- Tracks delivery status and metadata
- Sends failed messages to dead-letter channel

**Credential Manager**
- Loads credentials from environment variables
- Validates credentials at startup
- Supports .env file loading (development only)
- Prevents credential logging/echoing

**Logger**
- Structured logging in JSON format
- Tracks delivery attempts, retries, outcomes
- Provides tracing for event → message → delivery
- Supports filtering by event type, channel, time range

---

## Formatter Component Design

### TypeScript Interfaces

```typescript
// Core domain types
interface ContractEvent {
  id: string;
  type: EventType;
  timestamp: Date;
  contractId: string;
  metadata: Record<string, unknown>;
  payload: EventPayload;
}

type EventType =
  | 'TaskCreated'
  | 'WorkSubmitted'
  | 'CompletionAnnounced'
  | 'WorkRejected'
  | 'AssignmentUpdated'
  | 'DeadlineExtended'
  | 'ContractClosed';

// Slack Block Kit types
interface SlackMessage {
  blocks: Block[];
  thread_ts?: string;
}

type Block =
  | HeaderBlock
  | SectionBlock
  | ContextBlock
  | ActionBlock;

interface HeaderBlock {
  type: 'header';
  text: PlainTextObject;
  block_id: string;
}

interface SectionBlock {
  type: 'section';
  text?: RichTextObject | PlainTextObject;
  fields?: (PlainTextObject | RichTextObject)[];
  block_id: string;
}

interface ContextBlock {
  type: 'context';
  elements: ContextElement[];
  block_id: string;
}

interface ActionBlock {
  type: 'actions';
  elements: ActionElement[];
  block_id: string;
}

interface PlainTextObject {
  type: 'plain_text';
  text: string;
  emoji?: boolean;
}

interface RichTextObject {
  type: 'rich_text';
  elements: RichTextElement[];
}

// Formatter interface
interface EventFormatter {
  format(event: ContractEvent): SlackMessage;
  prettyPrint(message: SlackMessage): string;
}

interface FormatterRegistry {
  getFormatter(eventType: EventType): EventFormatter | null;
  registerFormatter(eventType: EventType, formatter: EventFormatter): void;
}
```

### Formatter Architecture

The formatter is implemented as a registry pattern with separate formatters for each event type:

```
FormatterRegistry
├── TaskCreatedFormatter
├── WorkSubmittedFormatter
├── CompletionAnnouncedFormatter
├── WorkRejectedFormatter
├── AssignmentUpdatedFormatter
├── DeadlineExtendedFormatter
└── ContractClosedFormatter
```

Each formatter:
1. Extracts relevant fields from the event payload
2. Builds standardized header and footer blocks
3. Constructs event-specific content blocks
4. Validates output against Block Kit schema
5. Returns SlackMessage

### TaskCreated Formatter Pseudocode

```typescript
class TaskCreatedFormatter implements EventFormatter {
  format(event: ContractEvent): SlackMessage {
    const {
      taskId,
      creatorName,
      taskTitle,
      deadline,
      assignedRecipient,
      description
    } = event.payload;

    const blocks = [
      // Header block
      {
        type: 'header',
        text: {
          type: 'plain_text',
          text: `📋 New Task Created`,
          emoji: true
        },
        block_id: 'header_task_created'
      },
      // Metadata block
      {
        type: 'context',
        elements: [
          {
            type: 'plain_text',
            text: `Event: TaskCreated | Time: ${formatTimestamp(event.timestamp)}`
          }
        ],
        block_id: 'context_metadata'
      },
      // Content section
      {
        type: 'section',
        fields: [
          { type: 'mrkdwn', text: `*Task ID:*\n${taskId}` },
          { type: 'mrkdwn', text: `*Created by:*\n${creatorName}` },
          { type: 'mrkdwn', text: `*Title:*\n${taskTitle}` },
          { type: 'mrkdwn', text: `*Deadline:*\n${formatDate(deadline)}` },
          ...(assignedRecipient ? [
            { type: 'mrkdwn', text: `*Assigned to:*\n${assignedRecipient}` }
          ] : []),
          ...(description ? [
            { type: 'mrkdwn', text: `*Description:*\n${description}` }
          ] : [])
        ],
        block_id: 'section_task_details'
      },
      // Footer block
      {
        type: 'context',
        elements: [
          {
            type: 'mrkdwn',
            text: `<${contractManagementSystemLink}|View in Contract System>`
          }
        ],
        block_id: 'context_footer'
      }
    ];

    return { blocks };
  }

  prettyPrint(message: SlackMessage): string {
    // Convert SlackMessage back to human-readable format for testing
    return message.blocks
      .map(block => this.blockToString(block))
      .join('\n');
  }
}
```

### Round-Trip Formatting

The formatter supports round-trip validation through:

1. **Deterministic Output**: Each formatter produces identical output for identical input
2. **No Generated IDs**: Block IDs are derived from event type and field name, not random
3. **Deterministic Ordering**: All collections are sorted consistently
4. **Time Formatting**: Timestamps use fixed format (ISO 8601)

**Round-Trip Test Pattern**:
```typescript
property('format → prettyPrint → format round-trip', (event: ContractEvent) => {
  const message1 = formatter.format(event);
  const prettyText = formatter.prettyPrint(message1);
  const message2 = formatter.format(event); // Re-format from same event

  // message1 should equal message2 (idempotency)
  return deepEqual(message1, message2);
});
```

---

## Delivery Adapter Design

### Slack Web API Integration

```typescript
interface SlackClient {
  postMessage(
    channelId: string,
    message: SlackMessage,
    options?: PostMessageOptions
  ): Promise<PostMessageResponse>;
}

interface PostMessageOptions {
  thread_ts?: string;
  reply_broadcast?: boolean;
  unfurl_links?: boolean;
  unfurl_media?: boolean;
  metadata?: Record<string, unknown>;
}

interface PostMessageResponse {
  ok: boolean;
  channel: string;
  ts: string;
  message: {
    type: string;
    user: string;
    text: string;
    ts: string;
  };
  error?: string;
  error_code?: string;
}

interface DeliveryAdapter {
  send(
    channelId: string,
    message: SlackMessage,
    metadata: DeliveryMetadata
  ): Promise<DeliveryResult>;
}

interface DeliveryMetadata {
  eventId: string;
  eventType: EventType;
  deliveryId: string;
  timestamp: Date;
}

type DeliveryResult =
  | { status: 'success'; messageId: string }
  | { status: 'retry'; reason: string; nextRetry: Date }
  | { status: 'failed'; reason: string; finalAttempt: number };
```

### Retry Strategy with Exponential Backoff

```typescript
interface RetryStrategy {
  maxAttempts: number;
  initialDelayMs: number;
  maxDelayMs: number;
  jitterFactor: number;
}

// Default strategy
const DEFAULT_RETRY_STRATEGY: RetryStrategy = {
  maxAttempts: 3,
  initialDelayMs: 1000,      // 1 second
  maxDelayMs: 32000,         // 32 seconds
  jitterFactor: 0.1          // ±10% random jitter
};

// Calculate retry delay with exponential backoff + jitter
function calculateBackoffDelay(
  attempt: number,
  strategy: RetryStrategy
): number {
  const exponentialDelay = strategy.initialDelayMs * Math.pow(2, attempt);
  const cappedDelay = Math.min(exponentialDelay, strategy.maxDelayMs);
  
  // Add jitter: ±jitterFactor of delay
  const jitter = cappedDelay * strategy.jitterFactor * (Math.random() * 2 - 1);
  
  return Math.max(0, cappedDelay + jitter);
}

// Retry timeline example (default strategy):
// Attempt 0: immediate
// Attempt 1: ~1s + jitter (2^0 * 1000ms)
// Attempt 2: ~2s + jitter (2^1 * 1000ms)
// Attempt 3: ~4s + jitter (2^2 * 1000ms)
// Total possible wait: ~7 seconds
```

### Error Classification

```typescript
type SlackErrorType =
  | 'authentication_failed'    // 401, invalid_token, token_revoked
  | 'rate_limited'             // 429 Too Many Requests
  | 'transient_error'          // 500, 503, connection timeout
  | 'invalid_channel'          // 404 Channel not found
  | 'validation_error'         // Malformed request
  | 'unknown_error';           // Unmapped error

function classifyError(
  response: PostMessageResponse | Error
): SlackErrorType {
  if (response instanceof Error) {
    if (response.message.includes('timeout')) return 'transient_error';
    return 'unknown_error';
  }

  if (!response.ok) {
    const code = response.error_code;
    if (code === 'invalid_token' || code === 'token_revoked') {
      return 'authentication_failed';
    }
    if (code === 'channel_not_found') {
      return 'invalid_channel';
    }
    if (code === 'not_in_channel') {
      return 'invalid_channel';
    }
    return 'validation_error';
  }

  return 'unknown_error';
}

// Retry decision logic
function shouldRetry(
  errorType: SlackErrorType,
  attemptCount: number,
  maxAttempts: number
): boolean {
  if (attemptCount >= maxAttempts) return false;

  switch (errorType) {
    case 'rate_limited':
    case 'transient_error':
      return true;

    case 'authentication_failed':
    case 'invalid_channel':
    case 'validation_error':
      return false;

    default:
      return attemptCount < maxAttempts - 1;
  }
}
```

### Delivery Status Tracking

```typescript
interface DeliveryStatus {
  deliveryId: string;
  eventId: string;
  eventType: EventType;
  channelId: string;
  status: 'pending' | 'success' | 'failed' | 'queued';
  messageId?: string;
  attempts: AttemptRecord[];
  createdAt: Date;
  completedAt?: Date;
  lastError?: string;
}

interface AttemptRecord {
  attemptNumber: number;
  timestamp: Date;
  result: 'success' | 'retry' | 'failed';
  reason?: string;
  nextRetryTime?: Date;
}
```

---

## Credential Management

### Environment Variable Schema

```typescript
interface CredentialConfig {
  slackBotToken: string;        // SLACK_BOT_TOKEN
  slackWebhookUrl?: string;     // SLACK_WEBHOOK_URL (optional)
  environment: 'development' | 'staging' | 'production';
  logCredentialMask: boolean;   // Default: true (prevent logging)
}

// Load credentials at startup
async function loadCredentials(): Promise<CredentialConfig> {
  const token = process.env.SLACK_BOT_TOKEN;
  
  if (!token) {
    throw new Error(
      'SLACK_BOT_TOKEN environment variable is required but not set. ' +
      'Please set it before starting the application.'
    );
  }

  if (!token.startsWith('xoxb-')) {
    throw new Error(
      'SLACK_BOT_TOKEN appears invalid (must start with xoxb-). ' +
      'Please verify the token format.'
    );
  }

  return {
    slackBotToken: token,
    slackWebhookUrl: process.env.SLACK_WEBHOOK_URL,
    environment: (process.env.NODE_ENV as any) || 'development',
    logCredentialMask: process.env.SLACK_LOG_CREDENTIAL_MASK !== 'false'
  };
}

// Mask credentials in logs
function maskCredential(value: string): string {
  if (value.length <= 8) return '***';
  return value.substring(0, 4) + '***' + value.substring(value.length - 4);
}
```

### .env File Support (Development)

```typescript
// Load .env during development
if (process.env.NODE_ENV !== 'production') {
  try {
    const envPath = path.join(process.cwd(), '.env');
    const envContent = fs.readFileSync(envPath, 'utf-8');
    const lines = envContent.split('\n');
    
    for (const line of lines) {
      const match = line.match(/^([^=]+)=(.+)$/);
      if (match) {
        const key = match[1].trim();
        const value = match[2].trim();
        if (!process.env[key]) {
          process.env[key] = value;
        }
      }
    }
  } catch (e) {
    // .env file is optional
  }
}

// Note: .env file MUST be in .gitignore
// .gitignore entry: .env
```

---

## Channel Router

### Configuration Schema

```typescript
interface ChannelConfig {
  routes: ChannelRoute[];
  defaultChannel?: string;
  deadLetterChannel?: string;
}

interface ChannelRoute {
  eventType: EventType;
  channels: ChannelDestination[];
  conditions?: RouteCondition[];
  threadId?: string;
  replyBroadcast?: boolean;
}

interface ChannelDestination {
  id: string;                    // e.g., #channel-name or @U12345678
  team?: string;
  threadsSupported?: boolean;
  metadata?: Record<string, unknown>;
}

interface RouteCondition {
  field: string;                 // e.g., 'contractValue', 'teamId'
  operator: 'eq' | 'gt' | 'lt' | 'in' | 'contains';
  value: unknown;
}

// Load configuration
function loadChannelConfig(filePath: string): ChannelConfig {
  const content = fs.readFileSync(filePath, 'utf-8');
  const ext = path.extname(filePath);
  
  let config: ChannelConfig;
  if (ext === '.json') {
    config = JSON.parse(content);
  } else if (ext === '.yaml' || ext === '.yml') {
    config = YAML.parse(content);
  } else {
    throw new Error(`Unsupported config format: ${ext}`);
  }

  validateChannelConfig(config);
  return config;
}

// Validate channel identifiers
function validateChannelConfig(config: ChannelConfig): void {
  const channelRegex = /^[#@][A-Z0-9]+$/i;

  for (const route of config.routes) {
    for (const dest of route.channels) {
      if (!channelRegex.test(dest.id)) {
        throw new Error(
          `Invalid channel ID "${dest.id}": ` +
          `must start with # or @ and contain only alphanumeric characters`
        );
      }
    }
  }

  if (config.deadLetterChannel && !channelRegex.test(config.deadLetterChannel)) {
    throw new Error(`Invalid dead-letter channel ID`);
  }
}

// Route event to channels
function routeEvent(event: ContractEvent, config: ChannelConfig): string[] {
  const route = config.routes.find(r => r.eventType === event.type);

  if (!route) {
    if (config.defaultChannel) {
      return [config.defaultChannel];
    }
    return [];
  }

  // Filter destinations by conditions if present
  let destinations = route.channels;

  if (route.conditions && route.conditions.length > 0) {
    destinations = destinations.filter(dest =>
      route.conditions!.every(cond => evaluateCondition(cond, event.payload))
    );
  }

  return destinations.map(d => d.id);
}

function evaluateCondition(
  condition: RouteCondition,
  payload: Record<string, unknown>
): boolean {
  const fieldValue = payload[condition.field];

  switch (condition.operator) {
    case 'eq':
      return fieldValue === condition.value;
    case 'gt':
      return (fieldValue as number) > (condition.value as number);
    case 'lt':
      return (fieldValue as number) < (condition.value as number);
    case 'in':
      return (condition.value as unknown[]).includes(fieldValue);
    case 'contains':
      return String(fieldValue).includes(String(condition.value));
    default:
      return false;
  }
}
```

### Example Channel Configuration

```yaml
# config/channels.yaml
routes:
  - eventType: TaskCreated
    channels:
      - id: "#task-notifications"
        team: "engineering"
      - id: "#all-events"
    conditions:
      - field: contractValue
        operator: gt
        value: 100000

  - eventType: WorkSubmitted
    channels:
      - id: "#work-updates"
        threadsSupported: true
    threadId: "${event.contractId}"

  - eventType: CompletionAnnounced
    channels:
      - id: "#completions"

  - eventType: WorkRejected
    channels:
      - id: "#rejections"

defaultChannel: "#general-notifications"
deadLetterChannel: "#alerts-dead-letter"
```

---

## Validator Component

### Schema Validation

```typescript
interface Validator {
  validate(message: SlackMessage): ValidationResult;
}

interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
}

interface ValidationError {
  path: string;        // e.g., "blocks[0].text.text"
  message: string;
  severity: 'error' | 'warning';
}

class SlackBlockKitValidator implements Validator {
  validate(message: SlackMessage): ValidationResult {
    const errors: ValidationError[] = [];

    // Validate blocks exist and are non-empty
    if (!message.blocks || message.blocks.length === 0) {
      errors.push({
        path: 'blocks',
        message: 'At least one block is required',
        severity: 'error'
      });
      return { valid: false, errors };
    }

    // Validate each block
    for (let i = 0; i < message.blocks.length; i++) {
      const block = message.blocks[i];
      const blockErrors = this.validateBlock(block, `blocks[${i}]`);
      errors.push(...blockErrors);
    }

    return {
      valid: errors.filter(e => e.severity === 'error').length === 0,
      errors
    };
  }

  private validateBlock(block: Block, path: string): ValidationError[] {
    const errors: ValidationError[] = [];

    // Validate block_id
    if (!block.block_id) {
      errors.push({
        path: `${path}.block_id`,
        message: 'block_id is required',
        severity: 'error'
      });
    }

    // Type-specific validation
    switch (block.type) {
      case 'header':
        errors.push(...this.validateHeaderBlock(block as HeaderBlock, path));
        break;
      case 'section':
        errors.push(...this.validateSectionBlock(block as SectionBlock, path));
        break;
      case 'context':
        errors.push(...this.validateContextBlock(block as ContextBlock, path));
        break;
    }

    return errors;
  }

  private validateHeaderBlock(block: HeaderBlock, path: string): ValidationError[] {
    const errors: ValidationError[] = [];

    if (!block.text || block.text.type !== 'plain_text') {
      errors.push({
        path: `${path}.text`,
        message: 'Header must have plain_text text object',
        severity: 'error'
      });
    } else {
      errors.push(...this.validateTextLength(
        block.text.text,
        3000,
        `${path}.text.text`
      ));
    }

    return errors;
  }

  private validateSectionBlock(block: SectionBlock, path: string): ValidationError[] {
    const errors: ValidationError[] = [];

    if (block.text) {
      if (block.text.type === 'mrkdwn' || block.text.type === 'plain_text') {
        errors.push(...this.validateTextLength(
          block.text.text || '',
          3000,
          `${path}.text.text`
        ));
      }
    }

    if (block.fields) {
      for (let i = 0; i < block.fields.length; i++) {
        const field = block.fields[i];
        const limit = field.type === 'plain_text' ? 2000 : 3000;
        errors.push(...this.validateTextLength(
          field.text || '',
          limit,
          `${path}.fields[${i}].text`
        ));
      }
    }

    return errors;
  }

  private validateContextBlock(block: ContextBlock, path: string): ValidationError[] {
    const errors: ValidationError[] = [];

    if (!block.elements || block.elements.length === 0) {
      errors.push({
        path: `${path}.elements`,
        message: 'Context block must have at least one element',
        severity: 'error'
      });
    }

    return errors;
  }

  private validateTextLength(
    text: string,
    maxLength: number,
    path: string
  ): ValidationError[] {
    if (text.length > maxLength) {
      return [{
        path,
        message: `Text exceeds maximum length of ${maxLength} characters (got ${text.length})`,
        severity: 'error'
      }];
    }
    return [];
  }
}
```

---

## Logging and Observability

### Structured Logging

```typescript
interface LogEntry {
  timestamp: Date;
  level: 'info' | 'warn' | 'error' | 'debug';
  component: string;
  message: string;
  eventId?: string;
  eventType?: EventType;
  channelId?: string;
  deliveryId?: string;
  attemptNumber?: number;
  errorCode?: string;
  statusCode?: number;
  metadata?: Record<string, unknown>;
}

class StructuredLogger {
  log(entry: Omit<LogEntry, 'timestamp'>): void {
    const logEntry: LogEntry = {
      ...entry,
      timestamp: new Date()
    };

    // Mask credentials if present
    if (entry.metadata) {
      logEntry.metadata = this.maskSensitiveFields(entry.metadata);
    }

    // Output as JSON
    console.log(JSON.stringify(logEntry));
  }

  private maskSensitiveFields(obj: Record<string, unknown>): Record<string, unknown> {
    const masked = { ...obj };

    for (const key in masked) {
      if (key.toLowerCase().includes('token') || 
          key.toLowerCase().includes('secret') ||
          key.toLowerCase().includes('key')) {
        masked[key] = '***REDACTED***';
      }
    }

    return masked;
  }
}

// Usage examples
logger.log({
  level: 'info',
  component: 'DeliveryAdapter',
  message: 'Sending message to Slack',
  eventId: event.id,
  eventType: event.type,
  channelId: channel.id,
  deliveryId: delivery.id
});

logger.log({
  level: 'error',
  component: 'DeliveryAdapter',
  message: 'Slack API request failed',
  eventId: event.id,
  channelId: channel.id,
  errorCode: response.error_code,
  statusCode: statusCode,
  metadata: { errorMessage: response.error }
});

logger.log({
  level: 'info',
  component: 'RetryManager',
  message: 'Scheduling retry attempt',
  deliveryId: delivery.id,
  attemptNumber: attemptNumber,
  metadata: {
    nextRetryTime: nextRetryDate.toISOString(),
    delayMs: delayMs
  }
});
```

---

## Testing Strategy

### Testing Approach: Dual Testing Model

This design uses **property-based testing (PBT)** for universal properties and **unit tests** for specific examples and edge cases.

**Property-Based Testing**: Generates random valid contract events and verifies properties hold
**Unit Testing**: Tests specific examples, edge cases, and integration points

### Unit Test Structure

```typescript
describe('Formatter', () => {
  describe('TaskCreatedFormatter', () => {
    it('should format valid TaskCreated event', () => {
      // Specific example test
      const event = createSampleTaskCreatedEvent();
      const message = formatter.format(event);

      expect(message.blocks.length).toBeGreaterThan(0);
      expect(message.blocks[0].type).toBe('header');
    });

    it('should omit optional fields when not present', () => {
      // Edge case: omit optional fields
      const event = createTaskCreatedEventWithoutDescription();
      const message = formatter.format(event);

      const descriptionField = message.blocks[2].fields?.find(
        f => f.text?.includes('Description')
      );
      expect(descriptionField).toBeUndefined();
    });

    it('should handle maximum-length task title', () => {
      // Edge case: max length
      const event = createTaskCreatedEventWithMaxLengthTitle(3000);
      const message = formatter.format(event);
      const result = validator.validate(message);

      expect(result.valid).toBe(true);
    });

    it('should escape special characters in text', () => {
      // Edge case: special characters
      const event = createTaskCreatedEventWithSpecialCharacters();
      const message = formatter.format(event);
      const result = validator.validate(message);

      expect(result.valid).toBe(true);
    });

    it('should handle Unicode content', () => {
      // Edge case: Unicode
      const event = createTaskCreatedEventWithUnicodeContent();
      const message = formatter.format(event);
      const result = validator.validate(message);

      expect(result.valid).toBe(true);
    });
  });

  describe('Validator', () => {
    it('should accept valid Slack messages', () => {
      const message = createValidSlackMessage();
      const result = validator.validate(message);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should reject messages with oversized text fields', () => {
      const message = createMessageWithOversizedText(4000);
      const result = validator.validate(message);

      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual(
        expect.objectContaining({
          severity: 'error',
          message: expect.stringContaining('exceeds maximum length')
        })
      );
    });

    it('should reject messages missing required fields', () => {
      const message = createMessageMissingBlockId();
      const result = validator.validate(message);

      expect(result.valid).toBe(false);
    });
  });

  describe('DeliveryAdapter', () => {
    it('should successfully deliver message and return message ID', async () => {
      // Mock Slack API success response
      mockSlackClient.postMessage.mockResolvedValueOnce({
        ok: true,
        ts: '1234567890.123456',
        channel: 'C12345'
      });

      const result = await adapter.send(
        'C12345',
        validMessage,
        metadata
      );

      expect(result.status).toBe('success');
      expect(result.messageId).toBe('1234567890.123456');
    });

    it('should NOT retry authentication failures', async () => {
      mockSlackClient.postMessage.mockResolvedValueOnce({
        ok: false,
        error_code: 'invalid_token'
      });

      const result = await adapter.send(
        'C12345',
        validMessage,
        metadata
      );

      expect(result.status).toBe('failed');
      expect(mockSlackClient.postMessage).toHaveBeenCalledTimes(1);
    });

    it('should retry rate limiting with exponential backoff', async () => {
      // First call returns rate limit, second succeeds
      mockSlackClient.postMessage
        .mockResolvedValueOnce({ ok: false, error_code: 'rate_limited' })
        .mockResolvedValueOnce({ ok: true, ts: '1234567890' });

      const result = await adapter.send(
        'C12345',
        validMessage,
        metadata
      );

      expect(result.status).toBe('retry');
      expect(mockSlackClient.postMessage).toHaveBeenCalledTimes(1);
      // Second attempt happens asynchronously
    });

    it('should send failed delivery to dead-letter channel', async () => {
      // All retry attempts fail
      mockSlackClient.postMessage.mockResolvedValue({
        ok: false,
        error_code: 'internal_error'
      });

      await adapter.send('C12345', validMessage, metadata);
      
      // After max retries, dead-letter message sent
      await wait(5000);
      
      expect(mockSlackClient.postMessage).toHaveBeenCalledWith(
        'C_DEAD_LETTER',
        expect.objectContaining({
          blocks: expect.arrayContaining([
            expect.objectContaining({
              text: expect.objectContaining({
                text: expect.stringContaining('Failed delivery')
              })
            })
          ])
        })
      );
    });
  });
});
```

### Property-Based Test Examples

Property-based tests use generators to create random valid inputs and verify properties hold universally.

```typescript
describe('Formatter - Property Based Tests', () => {
  // Property 1: Format round-trip idempotency
  property('formatting identical events produces identical output', (event: ContractEvent) => {
    const message1 = formatter.format(event);
    const message2 = formatter.format(event);

    return deepEqual(message1, message2);
  });

  // Property 2: All formatted messages must be valid
  property('all formatted messages pass validation', (event: ContractEvent) => {
    const message = formatter.format(event);
    const result = validator.validate(message);

    return result.valid === true;
  });

  // Property 3: Pretty-printed messages can be distinguished
  property('pretty-printing produces human-readable output', (event: ContractEvent) => {
    const message = formatter.format(event);
    const prettyText = formatter.prettyPrint(message);

    return prettyText.length > 0 && !prettyText.includes('undefined');
  });

  // Property 4: No optional fields cause formatting failure
  property('omitting optional fields does not break formatting', (event: ContractEvent) => {
    const eventWithoutOptionals = removeOptionalFields(event);
    const message = formatter.format(eventWithoutOptionals);
    const result = validator.validate(message);

    return result.valid === true;
  });
});

describe('DeliveryAdapter - Property Based Tests', () => {
  // Property 5: Delivery always completes or queues (no hangs)
  property('every delivery attempt completes', (message: SlackMessage, channelId: string) => {
    const promise = adapter.send(channelId, message, metadata);

    return promiseCompletes(promise, 10000); // Within 10 seconds
  });

  // Property 6: Retry logic respects maximum attempts
  property('retries never exceed maximum attempts', (message: SlackMessage) => {
    mockSlackClient.postMessage.mockResolvedValue({
      ok: false,
      error_code: 'internal_error'
    });

    const result = adapter.send('C12345', message, metadata);
    
    return mockSlackClient.postMessage.mock.calls.length <= 3;
  });

  // Property 7: Successful delivery ends retries
  property('successful delivery stops retry attempts', (message: SlackMessage) => {
    mockSlackClient.postMessage
      .mockResolvedValueOnce({ ok: false, error_code: 'internal_error' })
      .mockResolvedValueOnce({ ok: true, ts: '1234567890' })
      .mockResolvedValueOnce({ ok: false, error_code: 'internal_error' });

    const result = adapter.send('C12345', message, metadata);
    
    // Should stop at second call (success)
    return mockSlackClient.postMessage.mock.calls.length === 2;
  });
});

describe('ChannelRouter - Property Based Tests', () => {
  // Property 8: Router always produces valid channel list
  property('routing produces only valid channel IDs', (event: ContractEvent) => {
    const channels = router.route(event, config);
    const channelRegex = /^[#@][A-Z0-9]+$/i;

    return channels.every(ch => channelRegex.test(ch));
  });

  // Property 9: Default channel used when no explicit routing
  property('unmapped event types use default channel', (event: ContractEvent) => {
    const unmappedEvent = createEventOfUnmappedType();
    const channels = router.route(unmappedEvent, configWithDefault);

    return channels.includes(config.defaultChannel);
  });
});
```

### Integration Test Approach

```typescript
describe('End-to-End Integration', () => {
  it('should handle complete event → message → delivery flow', async () => {
    // Create sample event
    const event = createSampleTaskCreatedEvent();

    // Format event
    const message = formatter.format(event);
    expect(message.blocks.length).toBeGreaterThan(0);

    // Validate formatted message
    const validationResult = validator.validate(message);
    expect(validationResult.valid).toBe(true);

    // Route to channels
    const channels = router.route(event, testConfig);
    expect(channels.length).toBeGreaterThan(0);

    // Deliver to each channel
    for (const channel of channels) {
      mockSlackClient.postMessage.mockResolvedValueOnce({
        ok: true,
        ts: '1234567890',
        channel
      });

      const result = await adapter.send(channel, message, metadata);
      expect(result.status).toBe('success');
    }
  });

  it('should handle graceful degradation when Slack is unavailable', async () => {
    // Simulate Slack unreachable
    mockSlackClient.postMessage.mockRejectedValue(
      new Error('Connection timeout')
    );

    const deliveryPromise = processor.processEvent(sampleEvent);
    await wait(100);

    // Should queue for later retry
    expect(queueSize()).toBeGreaterThan(0);

    // When Slack recovers
    mockSlackClient.postMessage.mockResolvedValue({
      ok: true,
      ts: '1234567890'
    });

    // Queue should be processed
    await processor.flushQueue();
    expect(queueSize()).toBe(0);
  });
});
```

---

## Error Handling and Recovery

### Error Handling Flow

```
Event Received
    |
    v
[Format Event]
    |---Error---> Log Format Error
    |             (no retry, log and skip)
    |
    v
[Validate Format]
    |---Invalid---> Log Validation Error
    |               (no retry, log and skip)
    |
    v
[Route to Channels]
    |---No Routes---> Log Warning
    |                 (use default or skip)
    |
    v
[For Each Channel]
    |
    +---> [Send to Slack API]
    |           |
    |           +---Success---> Record Success
    |           |               (done)
    |           |
    |           +---Auth Error---> Record Failed
    |           |                  (no retry, log)
    |           |
    |           +---Rate Limit---> Schedule Retry
    |           |                  with exponential backoff
    |           |
    |           +---Transient---> Schedule Retry
    |                              with exponential backoff
    |
    v
[Max Retries Exceeded]
    |
    +---> [Send to Dead-Letter Channel]
    |     (if configured)
    |
    v
[Log Failure with Metadata]
    (for investigation)
```

### Dead-Letter Channel Processing

```typescript
async function handleDeliveryFailure(
  delivery: DeliveryStatus,
  config: ChannelConfig
): Promise<void> {
  if (!config.deadLetterChannel) {
    logger.log({
      level: 'error',
      component: 'DeliveryAdapter',
      message: 'Message delivery exhausted retries',
      deliveryId: delivery.deliveryId,
      metadata: delivery
    });
    return;
  }

  // Create dead-letter message
  const deadLetterMessage = createDeadLetterMessage({
    eventId: delivery.eventId,
    eventType: delivery.eventType,
    channelId: delivery.channelId,
    failureReason: delivery.lastError,
    attemptCount: delivery.attempts.length,
    originalDeliveryId: delivery.deliveryId
  });

  // Send to dead-letter channel
  try {
    const dlResult = await slackClient.postMessage(
      config.deadLetterChannel,
      deadLetterMessage
    );

    if (dlResult.ok) {
      logger.log({
        level: 'warn',
        component: 'DeliveryAdapter',
        message: 'Sent failed delivery to dead-letter channel',
        deliveryId: delivery.deliveryId,
        deadLetterChannelId: config.deadLetterChannel,
        deadLetterMessageId: dlResult.ts
      });
    }
  } catch (error) {
    logger.log({
      level: 'error',
      component: 'DeliveryAdapter',
      message: 'Failed to send dead-letter message',
      deliveryId: delivery.deliveryId,
      metadata: { error: error.message }
    });
  }
}
```

---

## File Structure and Organization

```
.
├── src/
│   ├── formatters/
│   │   ├── index.ts
│   │   ├── EventFormatter.ts          (interface)
│   │   ├── FormatterRegistry.ts
│   │   ├── TaskCreatedFormatter.ts
│   │   ├── WorkSubmittedFormatter.ts
│   │   ├── CompletionAnnouncedFormatter.ts
│   │   ├── WorkRejectedFormatter.ts
│   │   ├── AssignmentUpdatedFormatter.ts
│   │   ├── DeadlineExtendedFormatter.ts
│   │   └── ContractClosedFormatter.ts
│   │
│   ├── adapter/
│   │   ├── DeliveryAdapter.ts         (interface)
│   │   ├── SlackDeliveryAdapter.ts    (impl)
│   │   ├── SlackClient.ts             (Slack API wrapper)
│   │   └── RetryManager.ts
│   │
│   ├── validator/
│   │   ├── Validator.ts               (interface)
│   │   ├── SlackBlockKitValidator.ts  (impl)
│   │   └── ValidationError.ts
│   │
│   ├── router/
│   │   ├── ChannelRouter.ts           (interface)
│   │   ├── StaticChannelRouter.ts     (impl)
│   │   ├── ConfigLoader.ts
│   │   └── RouteConditionEvaluator.ts
│   │
│   ├── credentials/
│   │   ├── CredentialManager.ts
│   │   ├── EnvCredentialProvider.ts
│   │   ├── DotEnvLoader.ts
│   │   └── CredentialValidator.ts
│   │
│   ├── logger/
│   │   ├── Logger.ts                  (interface)
│   │   ├── StructuredJsonLogger.ts    (impl)
│   │   └── LogEntry.ts
│   │
│   ├── processor/
│   │   ├── EventProcessor.ts
│   │   ├── DeliveryLifecycleManager.ts
│   │   └── DeliveryStatusStore.ts
│   │
│   ├── types/
│   │   ├── ContractEvent.ts
│   │   ├── SlackMessage.ts
│   │   ├── DeliveryStatus.ts
│   │   └── ChannelConfig.ts
│   │
│   └── index.ts                       (main export)
│
├── test/
│   ├── formatters/
│   │   ├── TaskCreatedFormatter.test.ts
│   │   ├── WorkSubmittedFormatter.test.ts
│   │   ├── formatter.properties.test.ts
│   │   └── fixtures/
│   │
│   ├── adapter/
│   │   ├── SlackDeliveryAdapter.test.ts
│   │   ├── RetryManager.test.ts
│   │   ├── adapter.properties.test.ts
│   │   └── mocks/
│   │
│   ├── router/
│   │   ├── ChannelRouter.test.ts
│   │   ├── ConfigLoader.test.ts
│   │   └── router.properties.test.ts
│   │
│   ├── validator/
│   │   ├── SlackBlockKitValidator.test.ts
│   │   └── validator.properties.test.ts
│   │
│   ├── integration/
│   │   ├── end-to-end.test.ts
│   │   └── graceful-degradation.test.ts
│   │
│   └── helpers/
│       ├── fixtures.ts
│       ├── generators.ts               (PBT generators)
│       └── mocks.ts
│
├── config/
│   ├── channels.yaml                  (example)
│   ├── channels.staging.yaml
│   └── channels.production.yaml
│
├── .env.example
├── .gitignore                         (.env ignored)
├── package.json
├── tsconfig.json
└── README.md
```

---

## Dependencies and Libraries

```json
{
  "dependencies": {
    "@slack/web-api": "^6.x",           // Official Slack client
    "dotenv": "^16.x",                  // .env file loading (dev only)
    "js-yaml": "^4.x"                   // YAML parsing
  },
  "devDependencies": {
    "@types/jest": "^29.x",
    "@types/node": "^18.x",
    "fast-check": "^3.x",               // Property-based testing
    "jest": "^29.x",
    "typescript": "^5.x"
  }
}
```

---

## Deployment Considerations

### Environment Configuration

```bash
# Production
export SLACK_BOT_TOKEN="xoxb-..."      # Required
export NODE_ENV="production"
export CHANNELS_CONFIG="/etc/app/channels.yaml"
export SLACK_MAX_RETRIES="3"
export SLACK_INITIAL_BACKOFF_MS="1000"
export SLACK_LOG_CREDENTIAL_MASK="true"

# Development
export SLACK_BOT_TOKEN="xoxb-..."      # Required
export NODE_ENV="development"
# .env file loaded automatically
```

### Docker Deployment

```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --production
COPY dist/ ./dist/
COPY config/ ./config/
EXPOSE 3000
CMD ["node", "dist/index.js"]
```

### Kubernetes Secrets

```yaml
apiVersion: v1
kind: Secret
metadata:
  name: slack-integration
type: Opaque
stringData:
  SLACK_BOT_TOKEN: xoxb-...
---
apiVersion: v1
kind: ConfigMap
metadata:
  name: slack-channels-config
data:
  channels.yaml: |
    routes:
      - eventType: TaskCreated
        channels:
          - id: "#task-notifications"
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: slack-integration
spec:
  template:
    spec:
      containers:
      - name: app
        env:
        - name: SLACK_BOT_TOKEN
          valueFrom:
            secretKeyRef:
              name: slack-integration
              key: SLACK_BOT_TOKEN
        volumeMounts:
        - name: channels-config
          mountPath: /etc/config
      volumes:
      - name: channels-config
        configMap:
          name: slack-channels-config
```

---

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system-essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: All Supported Event Types Format Successfully

*For any* supported contract event type (TaskCreated, WorkSubmitted, CompletionAnnounced, WorkRejected, AssignmentUpdated, DeadlineExtended, ContractClosed), the formatter registry must return a non-null formatter that produces valid Slack message blocks.

**Validates: Requirements 1.1, 1.2**

### Property 2: Event Type Included in Formatted Message

*For any* contract event, the formatted Slack message blocks must include the event type in a standardized location (header or metadata block) for identification and debugging.

**Validates: Requirements 1.4, 2.5**

### Property 3: Block Kit Schema Compliance

*For any* supported contract event, when formatted into Slack message blocks, the output must conform to Slack Block Kit JSON schema with all required fields present and valid.

**Validates: Requirements 2.1, 9.1**

### Property 4: TaskCreated Messages Contain Required Fields

*For any* TaskCreated contract event, the formatted message must include task identifier, creator name, task title, deadline, and assigned recipient (when present).

**Validates: Requirements 2.2, 3.1**

### Property 5: WorkSubmitted Messages Contain Required Fields

*For any* WorkSubmitted contract event, the formatted message must include submission timestamp, submitter name, work summary, and completion percentage.

**Validates: Requirements 2.3, 4.1**

### Property 6: Completion and Status Messages Contain Required Fields

*For any* completion or status event (CompletionAnnounced, WorkRejected, AssignmentUpdated), the formatted message must include all event-specific required fields such as status, reason, or assignment details.

**Validates: Requirements 2.4, 5.1, 5.2, 5.3**

### Property 7: Standardized Header and Footer Blocks

*For any* formatted message, the blocks list must begin with a header block containing event type and timestamp, and end with a footer block containing a link to the contract management system.

**Validates: Requirements 2.5, 2.6**

### Property 8: Optional Fields Omitted When Absent

*For any* contract event with missing or null optional fields, the formatted message must not include placeholder text for those fields; instead, they must be omitted entirely.

**Validates: Requirements 2.7**

### Property 9: Formatting Idempotency

*For any* contract event, formatting that same event multiple times must produce identical Slack message blocks (bit-for-bit equivalence).

**Validates: Requirements 3.4, 4.3, 17.1, 17.4**

### Property 10: Formatter Round-Trip Preservation

*For any* contract event, formatting to Slack blocks, pretty-printing to text, then reformatting from the same event must produce equivalent message block structures (semantically equivalent, though block IDs and metadata may differ).

**Validates: Requirements 3.3, 4.2, 5.4, 11.1, 11.4**

### Property 11: No Non-Deterministic Elements in Output

*For any* contract event, the formatted Slack blocks must not contain randomly generated IDs, timestamps derived from current time, or other non-deterministic elements that would differ between formatting attempts.

**Validates: Requirements 17.2, 17.3**

### Property 12: Text Field Length Validation

*For any* formatted message block, text fields must not exceed Slack's documented limits (3000 characters for plain_text, 2000 for rich_text), and validation must detect and reject oversized text.

**Validates: Requirements 9.5**

### Property 13: Special Characters and Emoji Handling

*For any* contract event containing special characters, emoji, or non-ASCII content, the formatter must produce properly escaped output that passes Block Kit schema validation.

**Validates: Requirements 9.6**

### Property 14: Messages Deliver to Correct Channels

*For any* contract event and channel configuration, the router must determine the correct target channel(s) based on event type, and all valid messages must be POSTed to those channels via Slack Web API.

**Validates: Requirements 6.2, 10.1, 10.2**

### Property 15: Multi-Channel Delivery

*For any* event type configured with multiple target channels, the system must deliver the message to all configured channels (except for failures that trigger retry or dead-letter logic).

**Validates: Requirements 10.3**

### Property 16: Conditional Route Evaluation

*For any* channel routing rule with conditions, the router must correctly evaluate those conditions against the event payload and only deliver to channels whose conditions are satisfied.

**Validates: Requirements 10.4**

### Property 17: Unmapped Event Types Not Delivered

*For any* event type with no configured channel routing and no default channel, the system must log a warning and skip delivery entirely (no message sent to Slack).

**Validates: Requirements 10.5**

### Property 18: Unsupported Event Types Not Delivered

*For any* event type that is not in the supported list (TaskCreated, WorkSubmitted, etc.), the system must log that it is unsupported and not attempt formatting or delivery.

**Validates: Requirements 1.3**

### Property 19: Authentication Errors Not Retried

*For any* Slack API response indicating authentication failure (invalid token, token revoked, etc.), the delivery adapter must record the failure, log it, and not attempt retry.

**Validates: Requirements 6.4**

### Property 20: Rate Limit Errors Trigger Retry

*For any* Slack API response indicating rate limiting (HTTP 429 or rate_limited error), the delivery adapter must schedule a retry with exponential backoff.

**Validates: Requirements 6.5**

### Property 21: Transient Errors Trigger Retry

*For any* transient Slack API error (connection timeout, 500 internal error, 503 service unavailable), the delivery adapter must schedule a retry with configured retry strategy.

**Validates: Requirements 6.6, 20.1**

### Property 22: Exponential Backoff Calculation

*For any* retry attempt N, the calculated backoff delay must follow the formula: `delay = initial_interval * (2 ^ N) + random_jitter`, where jitter is bounded within ±jitterFactor of the base delay.

**Validates: Requirements 7.2**

### Property 23: Retry Attempts Respect Maximum

*For any* delivery failure, the system must not exceed the configured maximum retry attempts (default: 3), and after exhausting retries must record delivery status as Failed.

**Validates: Requirements 7.1, 7.3**

### Property 24: Successful Retry Stops Further Attempts

*For any* retry sequence, if a retry attempt succeeds, the system must record delivery status as Success immediately and not perform any further retry attempts.

**Validates: Requirements 7.4**

### Property 25: Format Errors Not Retried

*For any* delivery failure caused by invalid message format or schema violation, the system must not retry and instead log the formatting error and skip delivery.

**Validates: Requirements 7.5**

### Property 26: Dead-Letter Channel Delivery

*For any* delivery that exhausts all retry attempts and is configured with a dead-letter channel, the system must deliver a summary message to the dead-letter channel including event type, failure reason, and reference ID.

**Validates: Requirements 7.7, 16.2, 16.3**

### Property 27: Credentials Required at Startup

*For any* application startup, if the required SLACK_BOT_TOKEN environment variable is missing, the system must fail gracefully with a clear error message and not attempt any deliveries.

**Validates: Requirements 8.2, 8.4, 8.5**

### Property 28: Credentials Loaded from Environment

*For any* startup, the system must successfully load Slack credentials from SLACK_BOT_TOKEN and SLACK_WEBHOOK_URL environment variables, and use them for all subsequent API calls.

**Validates: Requirements 8.2, 8.3**

### Property 29: Credentials Not Logged

*For any* log entry or error message, Slack credentials (bot token, webhook URL, API key) must not appear in plaintext; instead, they must be masked or redacted (e.g., showing only first 4 and last 4 characters).

**Validates: Requirements 8.6**

### Property 30: .env File Loading (Development)

*For any* application startup in development mode, if a `.env` file exists in the application root with SLACK_BOT_TOKEN or other environment variables defined, those variables must be loaded and available to the application.

**Validates: Requirements 8.7**

### Property 31: Request Headers Include Tracking

*For any* Slack Web API request, the request headers must include version information and integration identifier for tracking and debugging purposes.

**Validates: Requirements 6.7**

### Property 32: Successful Delivery Records Message ID

*For any* successful Slack API response, the delivery status must be recorded as Success with the Slack message timestamp (ts), and that timestamp must be logged for audit purposes.

**Validates: Requirements 6.3, 13.2**

### Property 33: Validation Errors Reported Specifically

*For any* message validation failure, the validator must report specific validation errors including the field path, expected format, and severity level (error vs warning).

**Validates: Requirements 9.2**

### Property 34: Invalid Messages Not Delivered

*For any* message that fails validation, the system must not attempt delivery to Slack and instead log the validation error with details.

**Validates: Requirements 9.3**

### Property 35: Required Block Kit Properties Present

*For any* formatted Slack message block, all required Block Kit properties (type, block_id, text/fields as appropriate) must be present and properly structured.

**Validates: Requirements 9.4**

### Property 36: Channel Configuration Loaded from Files

*For any* channel configuration file in JSON or YAML format, the system must successfully parse it, validate all channel identifiers, and make the routing configuration available for event processing.

**Validates: Requirements 14.1**

### Property 37: Invalid Channel Identifiers Detected

*For any* channel configuration containing invalid channel identifiers (not matching #channel or @userid format), the system must log validation errors and skip those invalid entries.

**Validates: Requirements 14.3, 14.4**

### Property 38: Optional Config Metadata Supported

*For any* channel configuration entry with optional metadata (thread_id, reaction_type, team scope), the system must preserve and apply that metadata during message delivery.

**Validates: Requirements 14.2, 14.5**

### Property 39: Unique Delivery IDs Assigned

*For any* message delivery, the system must assign a unique delivery ID that is distinct from all other delivery IDs in the system (at least within a reasonable time window).

**Validates: Requirements 15.1**

### Property 40: Delivery Status Lifecycle

*For any* delivery, the status must progress through a valid lifecycle: Pending → (Success or Failed), and intermediate retry states must be logged but not persisted as final status.

**Validates: Requirements 15.2, 15.3, 15.4**

### Property 41: Delivery Status Queryable

*For any* delivery ID, event type, or channel, the system must support queries that return the delivery status including success/failure, timestamps, retry attempts, and final error if applicable.

**Validates: Requirements 15.5, 15.6**

### Property 42: Retry Metadata Tracked

*For any* delivery attempt that triggers a retry, the system must track attempt count, failure reason, and timestamp for each attempt, and make that metadata queryable.

**Validates: Requirements 7.6**

### Property 43: All Delivery Attempts Logged

*For any* delivery attempt (including retries), the system must log the attempt with timestamp, event type, channel ID, attempt number, and result (success, retry, or failed).

**Validates: Requirements 13.1, 13.4**

### Property 44: Delivery Failures Logged with Details

*For any* delivery failure, the system must log the failure reason, Slack API error code, and retry status, enabling investigation of why the delivery failed.

**Validates: Requirements 13.3**

### Property 45: Logs Include Event Tracing

*For any* log entry, the logs must include sufficient context (event ID, delivery ID, channel ID) to trace a delivery attempt back to the original contract event.

**Validates: Requirements 13.5**

### Property 46: Structured JSON Logging

*For any* log entry, the system must emit logs in JSON format with standardized field names (timestamp, level, component, message, etc.), enabling parsing and analysis by log aggregation tools.

**Validates: Requirements 13.7**

### Property 47: Service Continues After Single Event Failure

*For any* single delivery failure, the system must not crash or stop processing; instead, it must log the failure and continue processing subsequent events.

**Validates: Requirements 16.4, 16.5**

### Property 48: Error Handler Invoked on Exhausted Retries

*For any* delivery that exhausts all retry attempts, the configured error handling strategy must be invoked, which may include dead-letter delivery or alert emission.

**Validates: Requirements 16.1**

### Property 49: Performance: Formatting Completes Quickly

*For any* supported contract event of standard size, formatting to Slack blocks must complete within 100 milliseconds.

**Validates: Requirements 12.4**

### Property 50: API Responses Validated

*For any* Slack Web API response, the system must validate that all expected fields are present (ok, ts, channel, etc.) before using the response data.

**Validates: Requirements 18.1**

### Property 51: API Error Responses Classified

*For any* Slack API error response, the system must classify the error type (authentication, rate limit, transient, etc.) and apply the appropriate handling strategy (retry or fail).

**Validates: Requirements 18.3**

### Property 52: Malformed API Responses Handled

*For any* malformed or invalid Slack API response, the system must log the raw response and treat it as a delivery failure rather than attempting to process it.

**Validates: Requirements 18.4**

### Property 53: Queue Processing on Service Recovery

*For any* message queued while Slack was unavailable, when Slack service recovers and becomes reachable again, the system must attempt delivery of queued messages in order.

**Validates: Requirements 20.2, 20.3**

### Property 54: Queue State Logged and Visible

*For any* delivery that gets queued, the system must log the queue state (size, oldest message timestamp, etc.) and provide visibility into queued messages.

**Validates: Requirements 20.4**

### Property 55: Queue Overflow Warning

*For any* queue size exceeding the configured threshold (default: 1000 messages), the system must invoke configured warning procedures (logging, metrics, alerts).

**Validates: Requirements 20.5**

---

## Testing Strategy

### Testing Approach: Dual Model

This design employs a complementary two-tiered testing approach:

1. **Property-Based Testing (PBT)**: Validates universal properties across all inputs
2. **Unit Testing**: Validates specific examples, edge cases, and error conditions

**Why Both Are Necessary**:
- Unit tests catch concrete bugs and validate specific examples
- Property tests verify that general correctness properties hold universally across many generated inputs
- Together they provide comprehensive coverage: specific correctness (units) + universal correctness (properties)

### Property-Based Testing Configuration

**Framework**: `fast-check` (JavaScript/TypeScript)

**Test Structure**:
```typescript
import * as fc from 'fast-check';

describe('Formatter - Property Based Tests', () => {
  it('Property 1: All supported event types format successfully', () => {
    fc.assert(
      fc.property(fc.sampled(SUPPORTED_EVENT_TYPES), (eventType: EventType) => {
        const event = generateValidEventOfType(eventType);
        const formatter = formatterRegistry.getFormatter(eventType);
        const message = formatter.format(event);
        
        return message.blocks && message.blocks.length > 0;
      }),
      { numRuns: 100 }
    );
  });

  it('Property 3: Block Kit schema compliance', () => {
    fc.assert(
      fc.property(arbitraryContractEvent(), (event: ContractEvent) => {
        const formatter = formatterRegistry.getFormatter(event.type);
        const message = formatter.format(event);
        const validation = validator.validate(message);
        
        return validation.valid === true;
      }),
      { numRuns: 100 }
    );
  });

  it('Property 9: Formatting idempotency', () => {
    fc.assert(
      fc.property(arbitraryContractEvent(), (event: ContractEvent) => {
        const formatter = formatterRegistry.getFormatter(event.type);
        const result1 = formatter.format(event);
        const result2 = formatter.format(event);
        
        return deepEqual(result1, result2);
      }),
      { numRuns: 100 }
    );
  });
});
```

**Configuration**: Minimum 100 iterations per property test due to randomization

**Tagging**: Each PBT includes a comment referencing the design property:
```typescript
// Feature: slack-contract-events-integration, Property 1: All supported event types format successfully
```

### Unit Test Examples

```typescript
describe('Formatter - Unit Tests', () => {
  describe('TaskCreatedFormatter', () => {
    it('should format valid TaskCreated event with all required fields', () => {
      const event = {
        type: 'TaskCreated',
        taskId: 'task123',
        creatorName: 'Alice',
        taskTitle: 'Review Contract',
        deadline: new Date('2024-12-31'),
        assignedRecipient: 'Bob'
      };
      
      const message = formatter.format(event);
      expect(message.blocks.length).toBeGreaterThan(0);
      expect(message.blocks[0].type).toBe('header');
    });

    it('should omit optional fields when not present', () => {
      const event = {
        type: 'TaskCreated',
        taskId: 'task123',
        creatorName: 'Alice',
        taskTitle: 'Review',
        deadline: new Date('2024-12-31')
        // assignedRecipient omitted
      };
      
      const message = formatter.format(event);
      const descriptionField = findFieldByLabel(message, 'Description');
      expect(descriptionField).toBeUndefined();
    });

    it('should handle maximum-length task title (edge case)', () => {
      const event = {
        ...baseEvent,
        taskTitle: 'x'.repeat(3000)
      };
      
      const message = formatter.format(event);
      const result = validator.validate(message);
      expect(result.valid).toBe(true);
    });
  });

  describe('DeliveryAdapter', () => {
    it('should NOT retry on authentication failure', async () => {
      mockSlackClient.postMessage.mockResolvedValueOnce({
        ok: false,
        error_code: 'invalid_token'
      });

      const result = await adapter.send(channel, message, metadata);

      expect(result.status).toBe('failed');
      expect(mockSlackClient.postMessage).toHaveBeenCalledTimes(1);
    });

    it('should retry on rate limit with exponential backoff', async () => {
      mockSlackClient.postMessage
        .mockResolvedValueOnce({ ok: false, error_code: 'rate_limited' })
        .mockResolvedValueOnce({ ok: true, ts: '1234567890' });

      const promise = adapter.send(channel, message, metadata);
      
      expect(mockSlackClient.postMessage).toHaveBeenCalledTimes(1);
      
      // Async retry happens
      await wait(1500);
      expect(mockSlackClient.postMessage).toHaveBeenCalledTimes(2);
    });
  });

  describe('ChannelRouter', () => {
    it('should route event to configured channels', () => {
      const event = { type: 'TaskCreated', ...rest };
      const config = {
        routes: [
          {
            eventType: 'TaskCreated',
            channels: [{ id: '#tasks' }, { id: '#general' }]
          }
        ]
      };

      const channels = router.route(event, config);
      expect(channels).toEqual(['#tasks', '#general']);
    });

    it('should skip invalid channel identifiers', () => {
      const config = {
        routes: [
          {
            eventType: 'TaskCreated',
            channels: [
              { id: '#valid' },
              { id: 'invalid' },  // Missing #
              { id: '@U123456' }
            ]
          }
        ]
      };

      expect(() => router.loadConfig(config)).toThrow();
    });
  });
});
```

### Test Coverage Requirements

- **Formatter Module**: ≥90% code coverage
- **DeliveryAdapter**: ≥85% code coverage including retry logic
- **Validator**: 100% coverage of validation rules
- **Router**: ≥90% coverage including conditional routing
- **Integration**: End-to-end flow from event to Slack delivery

### CI/CD Integration

```yaml
# .github/workflows/test.yml
test:
  runs-on: ubuntu-latest
  steps:
    - uses: actions/checkout@v3
    - uses: actions/setup-node@v3
      with:
        node-version: 18
    - run: npm ci
    - run: npm run test:unit
    - run: npm run test:properties
    - run: npm run test:integration
    - run: npm run coverage
      # Coverage report must show ≥90% for Formatter
```

### Test Data Generators

```typescript
// test/helpers/generators.ts
export const arbitraryContractEvent = (): fc.Arbitrary<ContractEvent> => {
  return fc.record({
    id: fc.uuid(),
    type: fc.sampled(SUPPORTED_EVENT_TYPES),
    timestamp: fc.date(),
    contractId: fc.uuid(),
    payload: fc.object()
  });
};

export const arbitraryTaskCreatedEvent = (): fc.Arbitrary<ContractEvent> => {
  return fc.record({
    id: fc.uuid(),
    type: fc.constant('TaskCreated'),
    timestamp: fc.date(),
    contractId: fc.uuid(),
    payload: fc.record({
      taskId: fc.uuid(),
      creatorName: fc.string(),
      taskTitle: fc.string(),
      deadline: fc.date(),
      assignedRecipient: fc.option(fc.string())
    })
  });
};

export const arbitrarySlackMessage = (): fc.Arbitrary<SlackMessage> => {
  return fc.record({
    blocks: fc.array(arbitraryBlock(), { minLength: 1 })
  });
};
```

---

## Summary

This technical design provides a complete blueprint for implementing the Slack integration for contract events:

**Architecture**: Modular, layered design with clear separation between Formatter, Validator, Router, Delivery Adapter, and Credential Manager components.

**Formatting**: Round-trip capable, deterministic, idempotent formatting with support for 7 event types and 55 correctness properties.

**Delivery**: Reliable delivery with exponential backoff retry strategy, error classification, dead-letter channels, and graceful degradation when Slack is unavailable.

**Security**: Credentials managed via environment variables only, never logged or stored in version control.

**Testing**: Comprehensive dual-model testing combining property-based testing (100+ iterations per property) with targeted unit tests for edge cases.

**Observability**: Structured JSON logging with tracing support, delivery status tracking, and query capability for investigation and monitoring.

**Implementation**: Ready for development with TypeScript interfaces, clear file structure, and dependencies defined.

