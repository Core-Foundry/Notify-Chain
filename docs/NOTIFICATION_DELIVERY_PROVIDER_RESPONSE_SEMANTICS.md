# Notification Delivery and Provider Response Semantics

> Defines what constitutes a successful, failed, or uncertain notification delivery in Notify-Chain. Traced against the actual listener and dashboard provider implementations so examples reflect real backend responses.

## 1. Purpose

Integrators need a shared vocabulary for delivery outcomes so they can:

- Distinguish **provider acceptance** (the channel accepted the message) from **final recipient delivery** (the recipient actually received/read it).
- Classify a provider response as successful, failed, or uncertain.
- Understand when a delivery will be retried versus treated as permanent.
- Query delivery attempt records for auditing and compliance.

This document covers both provider systems in the repository:

| System | Location | Dispatch unit | Result type |
|--------|----------|---------------|-------------|
| Listener (production delivery) | `listener/src/` | `DeliveryPayload` → `DeliveryResult` | `DeliveryResult` / `DeliveryReceipt` |
| Dashboard (frontend fan-out) | `dashboard/src/services/notificationProviders/` | `BlockchainEvent` → `ProviderSendResult` | `ProviderSendResult` |

## 2. Delivery outcomes

### 2.1 Listener (production) — `DeliveryOutcome`

Defined in `listener/src/types/delivery-receipt.ts:2`:

```typescript
export type DeliveryOutcome = 'ACCEPTED' | 'REJECTED' | 'UNKNOWN';
```

Each delivery attempt is classified by `determineDeliveryOutcome()` (`listener/src/types/delivery-receipt.ts:99`). The invariants from the code comment:

> - **ACCEPTED**: Provider explicitly confirms acceptance of the notification. (Does NOT imply final recipient delivery).
> - **REJECTED**: Provider explicitly rejects the notification (e.g. 400, 401, 403, 404, 413, 422, or explicit client rejection errors).
> - **UNKNOWN**: Timeouts, network drops, missing responses, 5xx server errors, or 429 rate limits where receipt/acceptance cannot be established with certainty.

| Outcome | Meaning | Retry? | Example |
|---------|---------|--------|---------|
| `ACCEPTED` | Provider returned 2xx and explicitly accepted the payload | No (treated as delivered) | Discord webhook `204 No Content` |
| `REJECTED` | Provider explicitly inspected and rejected the request (4xx client errors, invalid/auth/forbidden/not_found signatures) | No (permanent by default) | Webhook `400 Bad Request`, Slack `401 Unauthorized` |
| `UNKNOWN` | Acceptance cannot be established — timeouts, network errors, 5xx, 429 rate limits | Yes (by default) | `503 Service Unavailable`, `ETIMEDOUT`, `ECONNRESET` |

The scheduler maps outcomes to `DeliveryReceiptStatus` (`listener/src/services/notification-scheduler.ts:827`):

- `ACCEPTED` → `delivered`
- `REJECTED` → `rejected`
- `UNKNOWN` → `failed`

### 2.2 Dashboard (frontend) — `ProviderStatus`

Defined in `dashboard/src/services/notificationProviders/types.ts:14`:

```typescript
export enum ProviderStatus {
  Success = 'success',
  Failure = 'failure',
  Retry = 'retry',
  Skipped = 'skipped',
}
```

| Status | Meaning |
|--------|---------|
| `success` | Provider accepted and dispatched the notification |
| `failure` | Provider could not complete the send (permanent or unexpected) |
| `retry` | Transient failure; the caller may retry |
| `skipped` | Event not relevant to this provider; not counted as failure |

## 3. Provider acceptance vs final recipient delivery

A key distinction integrators must make:

- **Provider acceptance** = the channel (Discord, email API, webhook endpoint) returned a successful response and took responsibility for the message. This is what `success: true` / `ACCEPTED` / HTTP 2xx means.
- **Final recipient delivery** = the end recipient (a Discord user, an email inbox, a webhook consumer) actually received, processed, or acknowledged the message. The provider system does **not** observe this.

Consequences:

- A `2xx` response from Discord means Discord accepted the webhook payload, not that a user saw the message.
- A `providerMessageId` (e.g. Discord `x-message-id` header, email `data.id`) is a **provider tracking reference**, not a delivery confirmation.
- `DeliveryReceipt.outcome === 'ACCEPTED'` means the provider accepted the notification; `deliveredAt` is set at acceptance time. It is not proof of end-user consumption.

This is captured explicitly in `listener/src/types/delivery-receipt.ts:91-93`:

```typescript
// ACCEPTED: Provider explicitly confirms acceptance of the notification.
//   (Does NOT imply final recipient delivery).
```

## 4. Provider response handling

Every listener provider returns `DeliveryResult` (`listener/src/types/provider-capabilities.ts:113-129`) and must **return failures, never throw** for expected transport problems:

```typescript
export interface DeliveryResult {
  success: boolean;
  degradedCapabilities: ProviderCapability[];
  errorMessage?: string;
  providerMessageId?: string;
  providerResponse?: Record<string, unknown>;
  errorCode?: string;
  statusCode?: number;
}
```

The dashboard equivalent is `ProviderSendResult` (`dashboard/src/services/notificationProviders/types.ts:24-49`).

### 4.1 Discord provider — `listener/src/services/providers/discord-provider.ts`

Maps Discord webhook HTTP responses to `DeliveryResult`:

- HTTP `2xx` → `{ success: true, providerMessageId: <x-message-id>, providerResponse: { statusCode } }`
- HTTP non-OK → `{ success: false, errorCode: 'HTTP_<status>', statusCode: <status>, errorMessage: 'HTTP <status>: <body>' }`
- Thrown/network error → `{ success: false, errorMessage: <sanitized> }` (no `statusCode`)

Representative success response:

```json
{
  "success": true,
  "degradedCapabilities": [],
  "providerMessageId": "123456789012345678",
  "providerResponse": { "statusCode": 204 },
  "statusCode": 204
}
```

Representative rejection (Discord returns 400 for a malformed embed):

```json
{
  "success": false,
  "degradedCapabilities": [],
  "errorMessage": "HTTP 400: Invalid embed",
  "errorCode": "HTTP_400",
  "statusCode": 400,
  "providerResponse": { "statusCode": 400 },
  "providerMessageId": null
}
```

Representative network failure (timeout):

```json
{
  "success": false,
  "degradedCapabilities": [],
  "errorMessage": "Fetch failed: ...",
  "providerMessageId": null
}
```

### 4.2 Webhook provider — `listener/src/services/providers/webhook-provider.ts`

Maps generic HTTP webhook responses:

- HTTP `2xx` → `{ success: true, degradedCapabilities: [] }`
- HTTP non-OK → `{ success: false, errorMessage: 'HTTP <status>: <body>' }` (no `errorCode`/`statusCode` set)
- Thrown/network error → `{ success: false, errorMessage: <sanitized> }`

### 4.3 Email provider — `dashboard/src/services/notificationProviders/emailProvider.ts`

Maps email service API HTTP responses to `ProviderSendResult`:

- HTTP `4xx` → `{ status: 'failure', error: { code: 'EMAIL_<status>' } }` (client error — permanent)
- HTTP `5xx` → `{ status: 'retry', error: { code: 'EMAIL_SERVICE_ERROR' } }` (transient — retryable)
- `AbortError` (timeout) → `{ status: 'retry', error: { code: 'EMAIL_TIMEOUT' } }`
- Other thrown error → `{ status: 'failure', error: { code: 'EMAIL_FAILED' } }`
- Success → `{ status: 'success', metadata: { durationMs, deliveryId: <id|messageId|eventId> } }`

### 4.4 Console provider — `dashboard/src/services/notificationProviders/consoleProvider.ts`

- Always `{ status: 'success', metadata: { durationMs, deliveryId: event.eventId } }` when available; `{ status: 'skipped' }` when disabled; `{ status: 'failure' }` on console output error.

### 4.5 Manager-level synthesis — `dashboard/src/services/notificationProviders/manager.ts`

`ProviderManager.send()` (`manager.ts:113`):

- Runs each provider through `sendWithTimeout()` (`manager.ts:158`), racing `provider.send()` against `config.timeoutMs ?? 30000`.
- A timeout produces a synthetic `{ status: 'failure', error: { code: 'TIMEOUT' } }`.
- Thrown errors are converted to `{ status: 'failure', error: { code: 'UNEXPECTED_ERROR' } }`.
- Providers run concurrently via `Promise.all`; unavailable providers are skipped.

## 5. Delivery attempt records

### 5.1 `DeliveryReceipt` — listener

Defined in `listener/src/types/delivery-receipt.ts:4-22`. Every executed delivery attempt is persisted:

| Field | Meaning |
|-------|---------|
| `status` | `delivered` | `failed` | `rejected` | `pending` |
| `outcome` | `ACCEPTED` | `REJECTED` | `UNKNOWN` |
| `providerStatus` | HTTP status code from the provider, when available |
| `providerMessageId` | Provider-assigned message/tracking ID |
| `providerResponse` | Sanitized structured response subset |
| `errorCode` | Stable provider/transport error code |
| `errorMessage` | Sanitized human-readable error |
| `attemptCount` | 1-based attempt number |
| `attemptTimestamp` / `deliveredAt` | Timing of the attempt and acceptance |
| `channel` | Notification type (`discord`, `email`, `webhook`, `sms`) |

Receipts are created in `NotificationScheduler.recordDeliveryReceipt()` (`listener/src/services/notification-scheduler.ts:790`), which classifies the outcome via `determineDeliveryOutcome()` and persists through `DeliveryReceiptRepository.create()` (`listener/src/services/delivery-receipt-repository.ts:138`). The repository sanitizes provider responses and error codes before storage (`delivery-receipt-repository.ts:173-174`).

### 5.2 `notification_execution_log` — scheduled notifications

Defined in `listener/src/types/scheduled-notification.ts:128-137`. Logged alongside receipts in `processNotification()` (`notification-scheduler.ts:485-491`):

| Field | Meaning |
|-------|---------|
| `status` | `SUCCESS` | `FAILED` | `RETRY` | `DEAD_LETTERED` |
| `executionAttempt` | Attempt number |
| `errorMessage` | Failure reason, when applicable |
| `responseData` | Raw provider response, when available |
| `durationMs` | Attempt duration |

### 5.3 Querying delivery history

`DeliveryHistoryQueryOptions` (`listener/src/types/delivery-receipt.ts:61-72`) supports filtering receipts by `eventId`, `contractAddress`, `notificationId`, `outcome`, `status`, `channel`, and date range (`DeliveryReceiptRepository.findBy...` methods in `delivery-receipt-repository.ts:192-328`).

## 6. Retry-related response behavior

Retry policy is the single source of truth: `listener/src/services/retry-policy.ts`.

### 6.1 Failure classification

`RetryFailureType` enum (`retry-policy.ts:27-46`):

| Type | Meaning | Typically retried by default? |
|------|---------|-------------------------------|
| `network_error` | DNS/socket failure (ECONNRESET, ECONNREFUSED, ENOTFOUND, …) | Yes |
| `timeout` | Request exceeded deadline (`AbortError`, `TimeoutError`) | Yes |
| `rate_limited` | HTTP 429 from the channel | Yes |
| `server_error` | HTTP 5xx from the channel | Yes |
| `client_error` | HTTP 4xx (bad request) | No |
| `not_found` | HTTP 404 / deleted target | No |
| `auth_error` | HTTP 401/403 invalid or expired credentials | No |
| `configuration_error` | Missing target URL / unsupported channel / bad payload | No |
| `unknown` | Unclassified failure | Yes (default) |

Classification functions:
- `classifyHttpStatus(status)` (`retry-policy.ts:164`) — maps HTTP status to a failure type. `429 → rate_limited`, `408 → timeout`, `401/403 → auth_error`, `404/410 → not_found`, `≥500 → server_error`, other `4xx → client_error`.
- `classifyError(error)` (`retry-policy.ts:186`) — maps thrown values via `DeliveryError`, `AbortError`/`TimeoutError` names, Node `code` (`ETIMEDOUT`, `ECONNRESET`, …), and message inspection.
- `classifyDeliveryFailure({ statusCode, error })` (`retry-policy.ts:280`) — status code takes precedence when present.

### 6.2 Default retryable types

`DEFAULT_RETRYABLE_FAILURE_TYPES` (`retry-policy.ts:61-67`):

```typescript
[NetworkError, Timeout, RateLimited, ServerError, Unknown]
```

Everything unambiguously permanent (`auth_error`, `not_found`, `client_error`, `configuration_error`) is excluded. `Unknown` is deliberately included to preserve historical behavior of retrying unclassified failures.

### 6.3 Backoff

`RETRY_POLICY_DEFAULTS` (`retry-policy.ts:116-123`):

- `maxAttempts`: undefined (caller budget authoritative; `1` disables retries)
- `baseDelayMs`: 5000
- `multiplier`: 2
- `maxDelayMs`: 3600000 (1 hour)
- `jitter`: true (±25%)

Delay formula (`computeBackoffDelay`, `retry-policy.ts:332`):

```
delay = min(baseDelayMs * multiplier^attempt, maxDelayMs)
delay *= (0.75 + Math.random() * 0.5)   // when jitter enabled
```

`attempt` is the 0-based index of the attempt that just failed.

### 6.4 Retry decision

`RetryPolicy.evaluate(failureType, attempt, preferredMaxAttempts)` (`retry-policy.ts:433`):

- Permanent failure type → `{ shouldRetry: false, reason: 'permanent' }` (budget not consulted).
- Attempt budget exhausted → `{ shouldRetry: false, reason: 'exhausted' }`.
- Otherwise → `{ shouldRetry: true, reason: 'retryable', delayMs: ... }`.

Deliveries that exhaust retries move to the dead-letter queue (`listener/src/services/dead-letter-manager.ts`) or, in the real-time path, are dropped from the in-memory `NotificationRetryQueue`.

## 7. Representative response examples

All examples below reflect actual response shapes produced by the code.

### 7.1 Listener `DeliveryResult` examples

**Accepted (Discord 204):**
```json
{
  "success": true,
  "degradedCapabilities": [],
  "providerMessageId": "123456789012345678",
  "providerResponse": { "statusCode": 204 },
  "statusCode": 204
}
```

**Rejected (webhook 400):**
```json
{
  "success": false,
  "degradedCapabilities": [],
  "errorMessage": "HTTP 400: Invalid payload",
  "statusCode": 400,
  "providerMessageId": null
}
```

**Uncertain — server error (503):**
```json
{
  "success": false,
  "degradedCapabilities": [],
  "errorMessage": "HTTP 503: Service Unavailable",
  "statusCode": 503
}
```

**Uncertain — network timeout:**
```json
{
  "success": false,
  "degradedCapabilities": [],
  "errorMessage": "Fetch failed: socket hang up",
  "providerMessageId": null
}
```

**Uncertain — rate limit (429):**
```json
{
  "success": false,
  "degradedCapabilities": [],
  "errorMessage": "HTTP 429: Too Many Requests",
  "statusCode": 429
}
```

### 7.2 Dashboard `ProviderSendResult` examples

**Success (email):**
```json
{
  "status": "success",
  "message": "Email sent successfully",
  "metadata": {
    "durationMs": 412,
    "deliveryId": "msg_abc123"
  }
}
```

**Failure (email 4xx client error):**
```json
{
  "status": "failure",
  "message": "Email service rejected the request (400)",
  "error": { "code": "EMAIL_400", "message": "HTTP 400" },
  "metadata": { "durationMs": 89 }
}
```

**Retry (email 5xx):**
```json
{
  "status": "retry",
  "message": "Email service returned 503",
  "error": { "code": "EMAIL_SERVICE_ERROR", "message": "HTTP 503" },
  "metadata": { "durationMs": 1204 }
}
```

**Retry (timeout):**
```json
{
  "status": "retry",
  "message": "Email request timed out",
  "error": { "code": "EMAIL_TIMEOUT", "message": "...AbortError..." }
}
```

**Skipped (provider disabled / event not relevant):**
```json
{
  "status": "skipped",
  "message": "Console provider is not available"
}
```

### 7.3 `DeliveryReceipt` persisted example

```json
{
  "id": 42,
  "notificationId": 17,
  "eventId": "evt_001",
  "contractAddress": "Cabc123",
  "channel": "discord",
  "status": "delivered",
  "outcome": "ACCEPTED",
  "providerStatus": 204,
  "attemptCount": 1,
  "attemptTimestamp": "2026-11-26T11:00:00.000Z",
  "deliveredAt": "2026-11-26T11:00:00.000Z",
  "providerMessageId": "123456789012345678",
  "providerResponse": { "statusCode": 204 },
  "errorCode": null,
  "errorMessage": null,
  "createdAt": "2026-11-26T11:00:00.000Z",
  "updatedAt": "2026-11-26T11:00:00.000Z"
}
```

## 8. Uncertain delivery outcomes

Uncertain outcomes (`UNKNOWN`) arise when the provider cannot confirm acceptance with certainty. They are documented here because integrators must treat them differently from rejections:

| Situation | Example signal | Outcome | Default retry handling |
|-----------|----------------|---------|------------------------|
| Upstream timeout | `AbortError`, `TimeoutError`, HTTP 408 | `UNKNOWN` | Retryable |
| Network drop | `ECONNRESET`, `ECONNREFUSED`, `ENOTFOUND`, `ETIMEDOUT` | `UNKNOWN` | Retryable |
| No response / missing status | `success` without `statusCode`, or empty catch block | `UNKNOWN` | Retryable |
| Server error | HTTP 500–599 | `UNKNOWN` | Retryable |
| Rate limit | HTTP 429 | `UNKNOWN` | Retryable |
| Ambiguous proxy states | HTTP 408, 499 | `UNKNOWN` | Retryable |
| Unclassified error | No usable signal | `UNKNOWN` | Retryable (default) |

`determineDeliveryOutcome()` (`listener/src/types/delivery-receipt.ts:99-165`) encodes this: any path that does not produce a definitive `success`/2xx acceptance or an explicit client rejection falls through to `UNKNOWN`. Uncertain receipts are stored with `status: 'failed'` and `outcome: 'UNKNOWN'`, and are eligible for retry under the default policy until the attempt budget is exhausted, after which they are dead-lettered.

## 9. Source map

| Concern | File |
|---------|------|
| Listener `DeliveryResult` / `NotificationProvider` | `listener/src/types/provider-capabilities.ts` |
| Listener `DeliveryReceipt`, `DeliveryOutcome`, `determineDeliveryOutcome` | `listener/src/types/delivery-receipt.ts` |
| Discord provider responses | `listener/src/services/providers/discord-provider.ts` |
| Webhook provider responses | `listener/src/services/providers/webhook-provider.ts` |
| Delivery receipt persistence + sanitization | `listener/src/services/delivery-receipt-repository.ts` |
| Scheduler receipt recording + execution log | `listener/src/services/notification-scheduler.ts` (`recordDeliveryReceipt`) |
| Retry policy, failure types, backoff | `listener/src/services/retry-policy.ts` |
| Dashboard `ProviderStatus` / `ProviderSendResult` | `dashboard/src/services/notificationProviders/types.ts` |
| Dashboard manager (timeouts, unexpected errors) | `dashboard/src/services/notificationProviders/manager.ts` |
| Dashboard email provider responses | `dashboard/src/services/notificationProviders/emailProvider.ts` |
| Dashboard console provider responses | `dashboard/src/services/notificationProviders/consoleProvider.ts` |
| Scheduled notification state machine | `docs/notifications/lifecycle.md` |
| Notification processing flow | `docs/NOTIFICATION-FLOW.md` |
| Failure recovery / retry monitoring | `NOTIFICATION_FAILURE_RECOVERY.md` |

## 10. Acceptance criteria status

- Delivery outcomes are clearly defined — `ACCEPTED` / `REJECTED` / `UNKNOWN` (listener) and `success` / `failure` / `retry` / `skipped` (dashboard), with classification rules.
- Provider-specific behavior is explained — Discord, webhook, email, and console provider response mapping.
- Examples reflect actual backend responses — examples drawn from the provider implementations above.
- Uncertain delivery outcomes are documented — `UNKNOWN` outcomes and their retry handling in §8.
