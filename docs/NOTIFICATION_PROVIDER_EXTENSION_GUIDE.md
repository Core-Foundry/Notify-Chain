# Notification Provider Extension Development Guide

This guide explains how to extend NotifyChain with a new notification
provider (delivery channel). It covers the provider interface contract,
required methods and configuration, a step-by-step walkthrough, a
representative implementation, payload transformation patterns, and
provider-specific error handling.

> Related reading:
> - [`NOTIFICATION_PROVIDER_IMPLEMENTATION.md`](../NOTIFICATION_PROVIDER_IMPLEMENTATION.md) — implementation summary of the dashboard abstraction.
> - [`dashboard/src/services/notificationProviders/README.md`](../dashboard/src/services/notificationProviders/README.md) — in-tree developer guide with usage examples.
> - [`docs/PROVIDER_CAPABILITIES.md`](PROVIDER_CAPABILITIES.md) — listener-side capability system.
> - [`NOTIFICATION_PAYLOAD_SCHEMA.md`](../NOTIFICATION_PAYLOAD_SCHEMA.md) — scheduled-notification payload schema.

NotifyChain has **two** provider systems. Know which one you are extending
before you start:

| System | Location | Interface | Used by | Dispatch unit |
|---|---|---|---|---|
| **Listener registry** (production delivery) | `listener/src/types/provider-capabilities.ts` | `NotificationProvider` with `metadata` / `deliver()` | `NotificationScheduler`, `ProviderRegistry` | `DeliveryPayload` → `DeliveryResult` |
| **Dashboard manager** (frontend fan-out) | `dashboard/src/services/notificationProviders/types.ts` | `NotificationProvider` with `send()` | `ProviderManager` | `BlockchainEvent` → `ProviderSendResult` |

---

## 1. Listener provider interface (production path)

The canonical extension point for server-side delivery is the
capability-based contract in
[`listener/src/types/provider-capabilities.ts`](../listener/src/types/provider-capabilities.ts):

```typescript
export interface NotificationProvider {
  readonly metadata: ProviderMetadata;

  hasCapability(capability: ProviderCapability): boolean;

  /** Returns true when the format is listed in metadata.supportedFormats. */
  supportsFormat(format: NotificationFormat): boolean;

  deliver(payload: DeliveryPayload): Promise<DeliveryResult>;

  /**
   * Optional. Must sanitize any external failure message to prevent
   * credential exposure.
   */
  checkHealth?(targetRecipient?: string): Promise<ProviderHealthResult>;
}
```

### Required metadata

`ProviderMetadata` (same file) is the registration identity — it is what the
registry keys on:

```typescript
export interface ProviderMetadata {
  readonly name: string;                              // human-readable display name
  readonly id: string;                                // registration key; must match a NotificationType
  readonly version: string;
  readonly capabilities: ReadonlySet<ProviderCapability>;
  readonly supportedFormats: ReadonlySet<NotificationFormat>;  // at least one entry
  readonly defaultFormat: NotificationFormat;         // must be a member of supportedFormats
}
```

- `ProviderCapability` values: `RICH_FORMATTING`, `ATTACHMENTS`,
  `MESSAGE_UPDATES`, `THREADING`, `INTERACTIVE_COMPONENTS`,
  `NATIVE_SCHEDULING` (`provider-capabilities.ts:9-16`).
- `NotificationFormat` values: `plain_text`, `markdown`, `embed`, `json`,
  `html` (`provider-capabilities.ts:27-33`). `plain_text` is universally safe
  and should always be listed unless the channel cannot render text.

### Required methods

| Method | Required | Purpose |
|---|---|---|
| `metadata` | Yes | Identity, capabilities, formats |
| `hasCapability(cap)` | Yes | Feature probe (usually a one-line set lookup) |
| `supportsFormat(format)` | Yes | Format probe (usually a one-line set lookup) |
| `deliver(payload)` | Yes | Performs the actual send; **returns** failures, does not throw |
| `checkHealth(targetRecipient?)` | Optional | Lightweight reachability probe |

### The `deliver()` contract

`deliver()` receives a `DeliveryPayload`:

```typescript
export interface DeliveryPayload {
  payload: Record<string, unknown>;   // free-form JSON stored with the scheduled notification
  targetRecipient: string;            // channel-specific recipient (webhook URL, email, chat id, ...)
  notificationType: string;
  requestedFeatures?: Set<ProviderCapability>;
  requestId?: string;
  formatPreference?: NotificationFormat;  // validated by the registry before your provider runs
}
```

and must return a `DeliveryResult`:

```typescript
export interface DeliveryResult {
  success: boolean;
  degradedCapabilities: ProviderCapability[];   // features you could not honor this attempt
  errorMessage?: string;
  providerMessageId?: string;
  providerResponse?: Record<string, unknown>;  // persistence applies an allowlist
  errorCode?: string;                          // stable transport error code, e.g. 'HTTP_503'
  statusCode?: number;
}
```

**Rules for `deliver()`:**

1. **Return failures; never throw for expected transport problems.** The
   scheduler records a `DeliveryReceipt` and retry bookkeeping from the
   returned `DeliveryResult` (`listener/src/services/notification-scheduler.ts`).
   Throwing is reserved for genuinely unrecoverable programming errors.
2. **Never log secrets.** Route every log line and error message through
   `sanitizeCredentials` from
   [`listener/src/utils/credential-sanitizer.ts`](../listener/src/utils/credential-sanitizer.ts).
   The central redaction engine in
   [`listener/src/utils/redact.ts`](../listener/src/utils/redact.ts) also
   strips webhook tokens, `Bearer` tokens, and `whsec_…` values from
   structured logs automatically, but your provider's own `errorMessage`
   must be sanitized at the source.
3. **Set `degradedCapabilities`** when the payload requested a capability you
   could not honor (e.g. an embed was requested but you fell back to plain
   text). The scheduler logs degraded deliveries.
4. **Set a stable `errorCode`** for retry classification. The retry policy in
   [`listener/src/services/retry-policy.ts`](../listener/src/services/retry-policy.ts)
   classifies failures (`network_error`, `timeout`, `rate_limited`,
   `server_error`, `client_error`, `auth_error`, …) and by default retries
   everything except `auth_error`, `not_found`, `client_error`, and
   `configuration_error`.

### Dispatch flow

The scheduler's registry-first dispatch
(`notification-scheduler.ts:649-718`) works like this:

```typescript
// Registry-based dispatch (preferred path)
if (this.providerRegistry.has(type)) {
  const result = await this.providerRegistry.deliver(type, {
    payload,
    targetRecipient: notification.targetRecipient,
    notificationType: type,
    requestId,
  });
  return result;
}
// Legacy fallback: direct Discord service injection
```

If no provider is registered for the notification's `notificationType`
(`discord`, `email`, `webhook`, `sms` — see
[`listener/src/types/scheduled-notification.ts`](../listener/src/types/scheduled-notification.ts)),
the scheduler throws
`"<type> delivery not yet implemented. Register a <type> NotificationProvider in the ProviderRegistry."`
That message is your cue: **register a provider for the type at boot.**

### Registration

Providers register with the module-level `ProviderRegistry`
(`listener/src/services/provider-registry.ts`):

```typescript
import { getProviderRegistry } from '../services/provider-registry';
import { SlackNotificationProvider } from './providers/slack-provider';

const registry = getProviderRegistry();
registry.register(new SlackNotificationProvider(config)); // keyed by provider.metadata.id
```

- Registration is keyed on `provider.metadata.id`; registering the same id
  twice throws.
- `registry.deliver(providerId, payload)` validates unknown ids and
  unsupported `formatPreference` values for you and returns
  `{ success: false, errorCode: 'UNSUPPORTED_FORMAT' }` instead of throwing.
- Register providers **before** the scheduler starts so the first polled
  notification can be delivered.

For a complete working reference, read
`listener/src/services/providers/discord-provider.ts` and
`listener/src/services/providers/webhook-provider.ts`.

---

## 2. Dashboard provider interface (frontend fan-out)

The dashboard abstraction
([`dashboard/src/services/notificationProviders/types.ts`](../dashboard/src/services/notificationProviders/types.ts))
is a separate contract used to fan blockchain events out to client-side
providers through a `ProviderManager`.

```typescript
export interface NotificationProvider {
  getName(): string;                                   // unique identifier, e.g. 'SlackProvider'
  isAvailable(): boolean;                              // true when configured and usable
  send(event: BlockchainEvent): Promise<ProviderSendResult>;
  sendBatch?(events: BlockchainEvent[]): Promise<ProviderSendResult[]>;  // optional optimization
  getConfig(): ProviderConfig;
  updateConfig(config: Partial<ProviderConfig>): void;
  healthCheck?(): Promise<{ healthy: boolean; reason?: string }>;
  dispose?(): Promise<void>;
}
```

### Result and status types

```typescript
export enum ProviderStatus {
  Success = 'success',
  Failure = 'failure',
  Retry = 'retry',
  Skipped = 'skipped',
}

export interface ProviderSendResult {
  status: ProviderStatus;
  message: string;
  error?: { code: string; message: string; details?: Record<string, unknown> };
  metadata?: {
    durationMs?: number;
    deliveryId?: string;
    retryAttempts?: number;
    [key: string]: unknown;
  };
}

export interface ProviderConfig {
  enabled: boolean;
  maxRetries?: number;
  timeoutMs?: number;
  [key: string]: unknown;   // provider-specific configuration
}
```

The event your `send()` receives is `BlockchainEvent`
(`dashboard/src/types/event.ts`): `eventId`, `contractAddress`,
`eventName`, `ledger`, `type`, `topic: string[]`, `value`, `txHash?`,
`receivedAt`, plus optional dashboard bookkeeping fields.

### Manager behavior you must design for

`ProviderManager` (`dashboard/src/services/notificationProviders/manager.ts`)
handles orchestration for you:

- **Registration** is keyed on `getName()`; duplicates warn and replace.
- **Timeouts**: `send` runs through `sendWithTimeout`, which races your
  `send()` against `config.timeoutMs ?? 30000` and produces a synthetic
  `failure` result with `error.code: 'TIMEOUT'` if you overrun it.
- **Thrown errors** are converted to
  `{ status: 'failure', error: { code: 'UNEXPECTED_ERROR' } }` — but it is
  still better to return a `failure`/`retry` result yourself so you control
  the `code`.
- **`sendAll` / `send(event, providerNames?)`** dispatch concurrently with
  `Promise.all` and skip providers whose `isAvailable()` is `false`.
- **`onFailure` / `onSuccess`** callbacks let host code observe results.
- **`unregister`** calls your `dispose()`; implement it if you hold timers,
  connections, or file handles.

Existing reference implementations: `consoleProvider.ts` (minimal, with
`sendBatch` and `healthCheck`) and `emailProvider.ts` (full-featured, with
validation, retries, digests, and health probing).

---

## 3. Configuration

### Listener providers

Listener provider configuration follows the repository convention: **parse
from environment variables in `listener/src/config.ts`, validate at startup,
and fail fast with a `ConfigError`.** Examples already in the code:

| Provider | Variables (`listener/.env.example`) | Notes |
|---|---|---|
| Discord | `DISCORD_WEBHOOK_URL`, `DISCORD_WEBHOOK_ID`, `DISCORD_RETRY_COUNT`, `DISCORD_BACKOFF_BASE_SECONDS` | URL + id must be provided **together** (`loadDiscordConfig()` throws otherwise); URL must start with `https://discord.com/api/webhooks/` |
| Webhook (outbound) | `WEBHOOK_SECRETS`, `WEBHOOK_TIMEOUT_MS`, `PAYLOAD_INTEGRITY_SECRET` | `WEBHOOK_SECRETS` is a JSON array of `{id, secret}` used for HMAC signing |
| Generic retry knobs | `RETRY_BASE_DELAY_MS`, `RETRY_MAX_RETRIES`, `RETRY_MULTIPLIER`, `RETRY_MAX_DELAY_MS`, `RETRY_JITTER`, `RETRY_POLICY_MAX_ATTEMPTS`, `RETRY_POLICY_RETRYABLE_FAILURE_TYPES` | Single source of truth: `listener/src/services/retry-policy.ts` |

For a new provider:

1. Add its variables to `listener/.env.example` with a comment block,
   marking secrets with `⚠️ SECRETS: inject via a secrets manager, never
   commit actual values.`
2. Add a `loadXxxConfig()` function in `listener/src/config.ts` that throws
   `ConfigError` on malformed input, and validate the loaded values in the
   existing validation section.
3. Document the variable in
   [`ENVIRONMENT_VARIABLES_AND_SECRETS.md`](../ENVIRONMENT_VARIABLES_AND_SECRETS.md).

**Never read credentials inside `deliver()` from `process.env` on every
call** — inject them through the constructor from the validated config so
missing configuration surfaces at startup, not mid-delivery.

### Dashboard providers

Dashboard providers receive configuration at construction time (see
`emailProvider.ts`, which throws in the constructor when `apiKey`, `apiUrl`,
`fromAddress`, or `toAddresses` are missing). There are no dashboard-specific
provider environment variables in `dashboard/.env.example`; pass credentials
explicitly where you instantiate the provider.

---

## 4. Step-by-step walkthrough: a new listener provider

Suppose you are adding a Slack provider (`notificationType: 'slack'`).

### Step 1 — Define the metadata

```typescript
// listener/src/services/providers/slack-provider.ts
import {
  NotificationFormat,
  ProviderCapability,
} from '../../types/provider-capabilities';

const metadata = {
  name: 'Slack',
  id: 'slack',
  version: '1.0.0',
  capabilities: new Set<ProviderCapability>([
    ProviderCapability.RICH_FORMATTING,
    ProviderCapability.MESSAGE_UPDATES,
  ]),
  supportedFormats: new Set<NotificationFormat>([
    NotificationFormat.PLAIN_TEXT,
    NotificationFormat.MARKDOWN,
  ]),
  defaultFormat: NotificationFormat.MARKDOWN,
} as const;
```

### Step 2 — Validate configuration in the constructor

```typescript
export interface SlackConfig {
  botToken: string;      // from validated config, never read per-call
  timeoutMs?: number;    // default 5000
}

export class SlackNotificationProvider implements NotificationProvider {
  readonly metadata = metadata;

  constructor(private readonly config: SlackConfig) {
    if (!config.botToken) {
      throw new Error('SlackNotificationProvider requires a bot token');
    }
  }

  hasCapability(capability: ProviderCapability): boolean {
    return this.metadata.capabilities.has(capability);
  }

  supportsFormat(format: NotificationFormat): boolean {
    return this.metadata.supportedFormats.has(format);
  }
  // deliver() and checkHealth() below
}
```

### Step 3 — Implement `deliver()`

```typescript
async deliver(payload: DeliveryPayload): Promise<DeliveryResult> {
  const startedAt = Date.now();
  const text = typeof payload.payload.message === 'string'
    ? payload.payload.message
    : JSON.stringify(payload.payload);

  try {
    const response = await fetch('https://slack.com/api/chat.postMessage', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.config.botToken}`,
      },
      body: JSON.stringify({
        channel: payload.targetRecipient,
        text,
      }),
      signal: AbortSignal.timeout(this.config.timeoutMs ?? 5_000),
    });

    if (!response.ok) {
      return {
        success: false,
        degradedCapabilities: [],
        errorCode: `HTTP_${response.status}`,
        statusCode: response.status,
        errorMessage: sanitizeCredentials(`Slack delivery failed: ${response.status}`),
      };
    }

    return {
      success: true,
      degradedCapabilities: [],
      providerMessageId: /* read from response body if available */ undefined,
      statusCode: response.status,
    };
  } catch (error) {
    // Network/timeout errors: report, do not throw.
    return {
      success: false,
      degradedCapabilities: [],
      errorCode: error instanceof Error && error.name === 'TimeoutError'
        ? 'TIMEOUT'
        : 'NETWORK_ERROR',
      errorMessage: sanitizeCredentials(
        error instanceof Error ? error.message : String(error),
      ),
    };
  }
}
```

### Step 4 — (Optional) Implement `checkHealth()`

```typescript
async checkHealth(targetRecipient?: string): Promise<ProviderHealthResult> {
  const checkedAt = new Date().toISOString();
  const startedAt = Date.now();
  try {
    const response = await fetch('https://slack.com/api/auth.test', {
      headers: { Authorization: `Bearer ${this.config.botToken}` },
      signal: AbortSignal.timeout(3_000),
    });
    return {
      providerId: this.metadata.id,
      providerName: this.metadata.name,
      status: response.ok ? 'ok' : 'degraded',
      latencyMs: Date.now() - startedAt,
      checkedAt,
    };
  } catch (error) {
    return {
      providerId: this.metadata.id,
      providerName: this.metadata.name,
      status: 'error',
      detail: sanitizeCredentials(error instanceof Error ? error.message : String(error)),
      checkedAt,
    };
  }
}
```

The contract invariant applies: **health-check detail strings must be
sanitized** (`provider-capabilities.ts:129-132`).

### Step 5 — Register and configure

1. Add the notification type to the schema/enum where notification types are
   validated (`listener/src/types/scheduled-notification.ts` and the
   `notification_type` CHECK constraint in
   `listener/src/database/schema.sql`).
2. Load `SLACK_BOT_TOKEN` in `listener/src/config.ts` (validated at startup).
3. Register the provider before the scheduler starts, as shown in §1.
4. Test: extend the pattern used by
   `listener/src/services/mock-notification-provider.ts` and the existing
   provider tests.

### Step 6 — Document

Add the provider to `docs/PROVIDER_CAPABILITIES.md` and, if it has new
configuration, to `listener/.env.example` and
`ENVIRONMENT_VARIABLES_AND_SECRETS.md`.

---

## 5. Payload transformation examples

### 5.1 Blockchain event → Discord embed (listener reference)

The Discord service converts a raw Stellar event into an embed:
`formatEventMessage` → `createEventEmbed`
(`listener/src/services/discord-notification.ts:345-396`):

- Title from the i18n key `discord.event.title`; fields for contract,
  ledger, event type, and value.
- `formatValue()` converts `ScVal` XDR values to human-readable strings.
- `sanitizeForDiscord` strips `@everyone` / `@here`, mention payloads, and
  escapes Markdown; `sanitizeEmbed` truncates to Discord's 6000-character
  embed limit.

If your channel has message-length or escaping constraints, follow this
pattern: **sanitize and truncate inside the provider, in a private method**,
not in the scheduler.

### 5.2 Scheduled notification → channel message

The scheduler hands your provider a free-form `payload` object. Convert it
to the channel format with small, pure helper functions (see
`buildMessage` in `listener/src/services/providers/discord-provider.ts:171`,
which handles three shapes — a passthrough `message` object, an `embeds`
array, or a `content`/`text`/JSON-stringified fallback):

```typescript
private buildMessage(payload: Record<string, unknown>): SlackMessageBody {
  if (payload.blocks) return { blocks: payload.blocks, text: 'Notification' };
  if (typeof payload.text === 'string') return { text: payload.text };
  return { text: JSON.stringify(payload) };
}
```

### 5.3 Version-stamped outbound payloads (webhook provider reference)

Outbound webhook payloads are stamped with a schema version before delivery:
`stampWebhookPayloadVersion()` adds a `schemaVersion: '1.0'` body field and
an `x-notifychain-payload-version` header
(`listener/src/utils/webhook-payload-version.ts:173-191`,
`listener/src/services/providers/webhook-provider.ts:61`).

If your provider has its own wire format, consider the same practice: stamp
a version so consumers can evolve safely. The versioning rules (additive
only; consumers reject unknown major versions) are documented in
`listener/docs/WEBHOOK_PAYLOAD_VERSIONING.md`.

### 5.4 Blockchain event → channel text (dashboard reference)

Dashboard providers format `BlockchainEvent` themselves. See
`consoleProvider.ts` `formatEvent()` (single-line text) and
`emailProvider.ts` `formatSubject` / `formatPlainText` / `formatHtml`
(`dashboard/src/services/notificationProviders/emailProvider.ts:262-354`)
for the three-tier (subject/plain/HTML) transformation pattern.

### 5.5 Template rendering (optional, server-side)

For user-authored message templates, use `TemplateRenderer`
(`listener/src/services/template-renderer.ts`): `{{variable}}`
interpolation with HTML escaping and an injection-safe strict variable
pattern; `renderTemplate()` returns
`{ subject, body, variables }`. Render **before** calling the provider and
pass the result in `DeliveryPayload.payload`.

---

## 6. Error handling

### 6.1 Transient vs. permanent failures

Classify every failure before returning. The listener retry policy
(`listener/src/services/retry-policy.ts`) defines the failure taxonomy:

| Failure type | Default retryable? | Typical cause |
|---|---|---|
| `network_error` | Yes | DNS/socket failure |
| `timeout` | Yes | Request exceeded timeout |
| `rate_limited` | Yes | HTTP 429 from the channel |
| `server_error` | Yes | HTTP 5xx from the channel |
| `client_error` | No | HTTP 4xx (bad request) |
| `auth_error` | No | Invalid/expired credentials |
| `not_found` | No | Missing recipient/resource |
| `configuration_error` | No | Provider misconfigured |
| `unknown` | Yes | Unclassified |

Retry behavior is configurable via
`RETRY_POLICY_RETRYABLE_FAILURE_TYPES`; backoff defaults to 5 s with ×2
exponential growth, a 1 h cap, and ±25 % jitter
(`RETRY_POLICY_DEFAULTS`). Persisted retries run through
`RetryScheduler` / `webhook-delivery-service.ts`; in-memory retries use
`notification-retry-queue.ts`. Deliveries that exhaust retries land in the
dead-letter queue (`listener/src/services/dead-letter-manager.ts`), where
recipient strings are redacted via `redactString` before isolation.

### 6.2 Returning the right `DeliveryResult`

```typescript
// Rate limited → retryable
return { success: false, errorCode: 'HTTP_429', statusCode: 429,
         degradedCapabilities: [], errorMessage: 'Slack rate limited' };

// Bad token → not retryable by default (auth_error)
return { success: false, errorCode: 'HTTP_401', statusCode: 401,
         degradedCapabilities: [], errorMessage: 'Slack auth failed' };
```

Use error codes the policy can map: an `HTTP_<status>` code derived from the
response status is the pattern used by the existing providers
(`discord-provider.ts` returns `HTTP_<status>` on non-OK responses).

### 6.3 Returning the right `ProviderSendResult` (dashboard)

- Return `ProviderStatus.Retry` for transient errors (see
  `emailProvider.ts:112-143`: HTTP 4xx → `failure`; 5xx/abort → `retry`).
- Return `ProviderStatus.Skipped` when the event is not relevant to your
  provider (e.g. event-type filtering) so the manager does not count it as
  a failure.
- Include `metadata.durationMs` and, when available, `deliveryId` —
  dashboards and tests use these for observability.
- Errors thrown inside your provider become `UNEXPECTED_ERROR` results;
  prefer explicit codes like `EMAIL_400`, `EMAIL_TIMEOUT` (existing
  convention) so callers can classify.

### 6.4 Credential hygiene in errors

Every string that might end up in a log, a `DeliveryResult.errorMessage`,
a `providerResponse`, or a receipt must be sanitized:

```typescript
import { sanitizeCredentials } from '../../utils/credential-sanitizer';

errorMessage: sanitizeCredentials(`Delivery failed: ${err.message}`),
```

The redaction engine (`listener/src/utils/redact.ts`) additionally guards
all structured log metadata — it strips Discord/Slack webhook tokens,
`Bearer` tokens, `whsec_…` secrets, Stellar seeds (`S[A-Z2-7]{55}`), and
signature headers. Do not rely on it alone; sanitize at the source.

---

## 7. Testing checklist

- Unit-test `deliver()` for: success, each failure class (4xx → non-retryable,
  5xx/timeout → retryable), unsupported `formatPreference` (registry
  returns `UNSUPPORTED_FORMAT` without calling you), and payload variants
  (`message` object / text / fallback).
- Test `checkHealth()` sanitization: assert no secret appears in `detail`.
- Use `MockNotificationProvider` (`listener/src/services/mock-notification-provider.ts`)
  and `setProviderRegistry()` (`provider-registry.ts:202`) for scheduler
  integration tests.
- For dashboard providers, follow
  `dashboard/src/services/notificationProviders/__tests__/` (manager +
  integration suites).

---

## 8. Best practices summary

1. **Match `metadata.id` to a valid `NotificationType`** — that is the join
   key the scheduler dispatches on.
2. **Return, don't throw**, for expected transport failures.
3. **Sanitize every error message** with `sanitizeCredentials`.
4. **Validate configuration at startup** (`ConfigError`), not per call.
5. **Always list `plain_text`** in `supportedFormats` unless impossible.
6. **Report degraded capabilities** instead of silently dropping features.
7. **Stamp wire-format versions** if your provider defines its own payload
   schema.
8. **Register before the scheduler starts** and keep registration
   idempotent.
9. **Document new env vars** in `listener/.env.example` and
   `ENVIRONMENT_VARIABLES_AND_SECRETS.md`.
10. **Never log or persist raw credentials** — redaction helpers are a
    safety net, not a substitute.
