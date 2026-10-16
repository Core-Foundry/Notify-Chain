# Email Provider Adapter - Technical Design

## Overview

The Email Provider Adapter provides decoupled email delivery capabilities behind the Notification_Dispatch abstraction. The design follows the provider pattern, isolating provider-specific logic (SMTP, SES, SendGrid) from event ingestion. All providers implement a common interface and return standardized failure results.

**Key Design Principles**:
- **Modularity**: Each provider implementation is independent
- **Abstraction**: Providers hidden behind common interface
- **Isolation**: Configuration stored in environment variables only
- **Consistency**: Standardized error classification and failure reporting
- **Testability**: Mock provider for unit testing

## Architecture

```
Notification_Event
     |
     v
┌─────────────────────────────────┐
│  Email_Provider_Adapter         │
│  (orchestrates full flow)       │
└────────┬──────────────┬─────────┘
         |              |
    ┌────v────┐   ┌────v───────┐
    │ Formatter│   │  Router    │
    │(event→   │   │(selects    │
    │ message) │   │ provider)  │
    └────┬─────┘   └────┬───────┘
         |              |
         └──────┬───────┘
                |
                v
        ┌──────────────────┐
        │  Validator       │
        │(validates        │
        │ message format)  │
        └────────┬─────────┘
                 |
                 v
        ┌──────────────────────────────┐
        │  Provider Interface          │
        │  (abstraction layer)         │
        └────────┬─────────────────────┘
                 |
    ┌────────────┼────────────┬──────────────┐
    |            |            |              |
    v            v            v              v
┌────────┐  ┌────────┐  ┌──────────┐  ┌──────────┐
│  SMTP  │  │  SES   │  │ SendGrid │  │  Mock    │
│Provider│  │Provider│  │ Provider │  │ Provider │
└────────┘  └────────┘  └──────────┘  └──────────┘
    |            |            |              |
    └────────────┴────────────┴──────────────┘
                 |
                 v
         Email Service
```

## Provider Interface

```typescript
interface Email_Provider {
  // Send email message
  sendEmail(message: Email_Message): Promise<DeliveryResult>;
  
  // Validate provider configuration at startup
  validateConfiguration(): Promise<ValidationResult>;
  
  // Get provider identifier
  getProviderName(): string;
  
  // Get provider capabilities
  getCapabilities(): ProviderCapabilities;
  
  // Get metrics
  getMetrics(): ProviderMetrics;
}

interface Email_Message {
  recipient_email: string;
  subject: string;
  body_text: string;
  body_html?: string;
  headers?: Record<string, string>;
  metadata?: Record<string, unknown>;
  idempotency_key: string;
  attachments?: EmailAttachment[];
}

type DeliveryResult = 
  | { status: 'success'; provider_message_id: string; timestamp: Date }
  | { status: 'retry'; error_code: string; next_retry: Date; reason: string }
  | { status: 'failed'; error_code: string; reason: string; error_category: ErrorCategory };

type ErrorCategory = 'transient' | 'permanent' | 'configuration' | 'authentication' | 'rate_limit';
```

## Provider Implementations

### SMTP Provider

```typescript
class SmtpProvider implements Email_Provider {
  private nodemailer: Transporter;
  
  async validateConfiguration(): Promise<ValidationResult> {
    // Verify: HOST, PORT, USERNAME, PASSWORD, FROM_ADDRESS
    // Test SMTP connection
    // Return validation result
  }
  
  async sendEmail(message: Email_Message): Promise<DeliveryResult> {
    try {
      const result = await this.nodemailer.sendMail({
        from: this.config.from,
        to: message.recipient_email,
        subject: message.subject,
        text: message.body_text,
        html: message.body_html,
        headers: this.sanitizeHeaders(message.headers)
      });
      
      return {
        status: 'success',
        provider_message_id: result.messageId,
        timestamp: new Date()
      };
    } catch (error) {
      return this.classifySmtpError(error);
    }
  }
  
  private classifySmtpError(error: Error): DeliveryResult {
    // Map SMTP error codes to categories
    // Return appropriate DeliveryResult
  }
}
```

### SES Provider

```typescript
class SesProvider implements Email_Provider {
  private sesClient: SESClient;
  
  async validateConfiguration(): Promise<ValidationResult> {
    // Verify: ACCESS_KEY, SECRET_KEY, REGION
    // List verified email identities
    // Check FROM_ADDRESS is verified
    // Return validation result
  }
  
  async sendEmail(message: Email_Message): Promise<DeliveryResult> {
    try {
      const result = await this.sesClient.send(new SendEmailCommand({
        Source: this.config.from,
        Destination: { ToAddresses: [message.recipient_email] },
        Message: {
          Subject: { Data: message.subject },
          Body: {
            Text: { Data: message.body_text },
            Html: { Data: message.body_html }
          }
        }
      }));
      
      return {
        status: 'success',
        provider_message_id: result.MessageId,
        timestamp: new Date()
      };
    } catch (error) {
      return this.classifySesError(error);
    }
  }
}
```

### SendGrid Provider

```typescript
class SendGridProvider implements Email_Provider {
  private sgMail: any; // sendgrid/mail
  
  async validateConfiguration(): Promise<ValidationResult> {
    // Verify: API_KEY (69 characters)
    // Test API connectivity
    // Return validation result
  }
  
  async sendEmail(message: Email_Message): Promise<DeliveryResult> {
    try {
      const result = await sgMail.send({
        to: message.recipient_email,
        from: this.config.from,
        subject: message.subject,
        text: message.body_text,
        html: message.body_html,
        headers: this.sanitizeHeaders(message.headers),
        categories: this.config.categories
      });
      
      return {
        status: 'success',
        provider_message_id: result[0].headers['x-message-id'],
        timestamp: new Date()
      };
    } catch (error) {
      return this.classifySendGridError(error);
    }
  }
}
```

### Mock Provider (for testing)

```typescript
class MockProvider implements Email_Provider {
  private messages: Email_Message[] = [];
  private failureConfig: { count: number; remaining: number } | null = null;
  
  async sendEmail(message: Email_Message): Promise<DeliveryResult> {
    if (this.failureConfig && this.failureConfig.remaining > 0) {
      this.failureConfig.remaining--;
      return {
        status: 'retry',
        error_code: 'MOCK_FAILURE',
        reason: 'Simulated failure',
        next_retry: new Date(Date.now() + 1000)
      };
    }
    
    this.messages.push(message);
    return {
      status: 'success',
      provider_message_id: `mock-${this.messages.length}`,
      timestamp: new Date()
    };
  }
  
  getMessages(): Email_Message[] {
    return this.messages;
  }
  
  simulateFailure(count: number): void {
    this.failureConfig = { count, remaining: count };
  }
}
```

## Message Formatting

```typescript
class MessageFormatter {
  format(event: Notification_Event): Email_Message | FormattingError {
    // Extract recipient_email, subject from event
    // Apply template based on event type
    // Substitute variables
    // Validate email format
    // Generate idempotency_key
    
    return {
      recipient_email,
      subject,
      body_text,
      body_html,
      headers: {},
      idempotency_key: generateIdempotencyKey(event)
    };
  }
  
  private validateEmailAddress(email: string): boolean {
    // RFC 5322 validation
  }
  
  private applyTemplate(event: Notification_Event): TemplateResult {
    // Load template by event type
    // Substitute variables
    // Return formatted body_text and body_html
  }
}
```

## Error Classification

```typescript
function classifyError(
  error: any,
  provider: string
): ErrorCategory {
  if (provider === 'smtp') {
    if (error.code === 535) return 'authentication';
    if (error.code >= 550) return 'permanent';
    if (error.code >= 400) return 'transient';
  } else if (provider === 'ses') {
    if (error.name === 'ThrottlingException') return 'rate_limit';
    if (error.name === 'ConfigurationSetDoesNotExist') return 'configuration';
    if (error.name === 'InvalidParameterValue') return 'permanent';
  } else if (provider === 'sendgrid') {
    if (error.status === 429) return 'rate_limit';
    if (error.status === 401 || error.status === 403) return 'authentication';
    if (error.status === 400) return 'permanent';
    if (error.status >= 500) return 'transient';
  }
  return 'transient'; // Default
}
```

## Retry Logic

```typescript
function calculateBackoffDelay(
  attempt: number,
  config: RetryConfig
): number {
  const exponentialDelay = config.initialDelayMs * Math.pow(2, attempt);
  const cappedDelay = Math.min(exponentialDelay, config.maxDelayMs);
  const jitter = cappedDelay * config.jitterFactor * (Math.random() * 2 - 1);
  
  return Math.max(0, cappedDelay + jitter);
}

function shouldRetry(category: ErrorCategory, attempt: number, max: number): boolean {
  if (attempt >= max) return false;
  
  switch (category) {
    case 'transient':
    case 'rate_limit':
      return true;
    case 'authentication':
    case 'configuration':
    case 'permanent':
      return false;
    default:
      return attempt < max - 1;
  }
}
```

## Delivery Status Tracking

```typescript
interface DeliveryRecord {
  delivery_id: string;
  idempotency_key: string;
  event_id?: string;
  recipient_email: string;
  subject: string;
  provider_name: string;
  status: 'pending' | 'success' | 'retry' | 'failed';
  attempts: AttemptRecord[];
  created_at: Date;
  completed_at?: Date;
  final_error?: string;
}

interface AttemptRecord {
  attempt_number: number;
  timestamp: Date;
  result: 'success' | 'retry' | 'failed';
  error_category?: ErrorCategory;
  error_code?: string;
  error_reason?: string;
  next_retry_time?: Date;
}
```

## Configuration Management

```typescript
interface ProviderConfig {
  provider_type: 'smtp' | 'ses' | 'sendgrid' | 'mock';
  
  // SMTP specific
  smtp_host?: string;
  smtp_port?: number;
  smtp_username?: string;
  smtp_password?: string;
  smtp_from_address?: string;
  smtp_use_tls?: boolean;
  smtp_pool_size?: number;
  
  // SES specific
  ses_access_key_id?: string;
  ses_secret_access_key?: string;
  ses_region?: string;
  ses_from_address?: string;
  
  // SendGrid specific
  sendgrid_api_key?: string;
  sendgrid_tracking_categories?: string[];
  
  // Common retry config
  retry_max_attempts: number;
  retry_initial_interval_ms: number;
  retry_max_interval_ms: number;
  retry_jitter_factor: number;
}

function loadConfig(): ProviderConfig {
  const provider_type = process.env.EMAIL_PROVIDER_TYPE;
  
  if (provider_type === 'smtp') {
    return {
      provider_type: 'smtp',
      smtp_host: process.env.EMAIL_SMTP_HOST,
      smtp_port: parseInt(process.env.EMAIL_SMTP_PORT || '587'),
      smtp_username: process.env.EMAIL_SMTP_USERNAME,
      smtp_password: process.env.EMAIL_SMTP_PASSWORD,
      smtp_from_address: process.env.EMAIL_SMTP_FROM_ADDRESS,
      smtp_use_tls: process.env.EMAIL_SMTP_USE_TLS !== 'false',
      retry_max_attempts: 3,
      retry_initial_interval_ms: 1000,
      retry_max_interval_ms: 32000,
      retry_jitter_factor: 0.1
    };
  }
  
  // Similar for SES, SendGrid
}
```

## Testing Strategy

**Mock Provider Tests**:
- Send and verify message storage
- Simulate failures and verify retry scheduling
- Verify success results

**Provider Integration Tests** (with mocked network):
- SMTP: Mock SMTP server, test connection, authentication, sending
- SES: Mock AWS SDK, test API calls, error handling
- SendGrid: Mock HTTP client, test API v3 endpoint

**Property-Based Tests**:
- Round-trip: format event → send → verify format integrity
- Idempotency: sending identical events produces identical results
- Error classification: all provider errors classified correctly

**End-to-End Tests** (with mock provider):
- Event → Format → Validate → Send → Track status
- Retry scenarios: transient failure → retry → success
- Dead-letter: permanent failure → dead-letter queue

