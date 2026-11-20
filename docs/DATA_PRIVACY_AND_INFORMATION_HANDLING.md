# Data Privacy and Information Handling Guide

This guide describes what information NotifyChain stores, how sensitive and
non-sensitive data is handled differently, how event payloads flow through
the system, where credentials live, what happens to data over time
(retention and deletion), and what the API exposes. It reflects the actual
implementation as of this writing; file and line references are given so you
can verify each claim in code.

> Related reading:
> - [`ENVIRONMENT_VARIABLES_AND_SECRETS.md`](../ENVIRONMENT_VARIABLES_AND_SECRETS.md) — the authoritative env-var and secrets reference.
> - [`docs/security.md`](security.md) — API hardening overview.
> - [`NOTIFICATION_PAYLOAD_SCHEMA.md`](../NOTIFICATION_PAYLOAD_SCHEMA.md) — scheduled-notification payload fields.
> - [`docs/NOTIFICATION_EXPORT_FORMAT.md`](NOTIFICATION_EXPORT_FORMAT.md) — admin export format and redaction.

---

## 1. Stored information categories

The listener persists everything in SQLite. The schema lives in
[`listener/src/database/schema.sql`](../listener/src/database/schema.sql)
(plus `archive-schema.sql` and `template-schema.sql`), applied by the
migration system (`listener/src/database/migration-system.ts`).

| Category | Where | Contains |
|---|---|---|
| Scheduled notifications | `scheduled_notifications` (schema.sql:5-48) | `payload` (JSON), `target_recipient`, `notification_type`, schedule/execute/expiry timestamps, retry bookkeeping, `event_id`, `contract_address`, `metadata`, `last_error`, `error_details` |
| Dead-letter entries | `dead_letter_queue` (schema.sql:83-95) | Payload, recipient, failure reason of exhausted notifications |
| Delivery audit trail | `notification_execution_log` (schema.sql:104-115), `delivery_receipts` (schema.sql:127-144) | Per-attempt status, provider response subset, error codes/messages, durations |
| Ingested blockchain events | `processed_events` (schema.sql:235-258) | `event_id`, `contract_address`, fingerprint, `ledger_number`, `tx_hash`, event type, reorg bookkeeping |
| Rate-limiting audit | `rate_limit_events` (schema.sql:159-168) | Client identifier (IP or hashed API-key id), endpoint, method, timestamp |
| Templates | `notification_templates` (schema.sql:177-187) + immutable audit log (schema.sql:202-231) | Template name/type/subject/body, variables, audit history |
| Idempotency / backpressure / metrics | `idempotency_keys` (schema.sql:301-329), `backpressure_events` (schema.sql:332-355), `notification_metrics_snapshots` (schema.sql:358-369) | Request hashes, response references, operational counters |
| Archives | `notification_archive` (schema.sql:371-388) | Archived copies of terminal notifications incl. payload and recipient |
| Security audit | `security_audit_log` (`listener/src/migrations/003-add-security-audit-log.sql`) | Action, actor, source IP, request/correlation ids, outcome |
| Schedule audit | `schedule_audit_log` (schema.sql:465-499) | Identifiers only — by design "do not store full notification payloads here" (schema.sql:473) |

**There is no user/account table.** Identity in NotifyChain consists of:

- On-chain: Stellar account addresses (`G…`) appearing in contract event
  topics and payloads.
- Off-chain: recipient strings supplied by API callers — Discord webhook
  URLs, email addresses, HTTPS webhook URLs, or E.164 phone numbers
  (`listener/src/types/scheduled-notification.ts`).

---

## 2. Sensitive vs. non-sensitive data

### Sensitive (must never be logged, exported raw, or committed)

| Item | Where it lives | Handling |
|---|---|---|
| `API_KEYS` static keys | Env only (`listener/.env.example:123-130`) | Timing-safe compare via SHA-256 in `listener/src/api/api-key-auth.ts:27-29`; never stored in the database |
| Scoped `nck_` credential secrets | Env/database as **scrypt hash only** | `hashSecret()` in `listener/src/services/api-credential-service.ts:275-280` (`scrypt$N=16384$r=8$p=1$...`); full key returned exactly once at creation (api-credential-service.ts:362-380) |
| `WEBHOOK_SECRETS` (HMAC signing keys) | Env only | Used for outbound signature computation; never persisted with payloads |
| `PAYLOAD_INTEGRITY_SECRET` | Env only | HMAC-SHA256 payload integrity hash (`listener/src/utils/payload-integrity.ts`); verified before delivery (`notification-scheduler.ts:406-414`) |
| Discord webhook URLs (contain an embedded token) | `target_recipient` column | Redacted in exports, logs, and dead-letter records |
| Email addresses, phone numbers | `target_recipient` column | Masked in exports (`sanitizeRecipient`, §6) |

### Non-sensitive (operational data)

Blockchain event data (contract addresses, ledger numbers, transaction
hashes, event names/topics), delivery statuses, durations, retry counts,
rate-limit windows, and template definitions. These are stored and exposed
by the API without redaction (§7), except where noted.

### Account addresses: a special case

Stellar account IDs are public on-chain data, but they can still be
pseudonymous identifiers. The API returns them in full (§7); only the
dashboard UI shortens them for display (`first6...last4` via
`shortenAddress()` in `dashboard/src/components/EventRow.tsx:10-15` and
`EventCard.tsx:15`). Do not treat API responses as address-masked.

---

## 3. Event payload processing

An event flows through these stages; each stage's data handling matters for
privacy:

1. **Ingestion** — the listener polls the Stellar RPC and normalizes raw
   events (`listener/src/services/event-normalization.ts`), extracting the
   `payload_version` from event data (`listener/src/utils/event-utils.ts`).
   Contract addresses, topics, and values land in `processed_events`.
2. **Deduplication** — fingerprint-based; duplicate deliveries are recorded
   but never re-sent (ADR `docs/adr/0005-event-deduplication-strategy.md`).
3. **Scheduling** — `POST /api/schedule` requests pass through validation
   (`InputValidator`, `validateScheduleInput`, `validatePayloadSize`,
   `validateNotificationMetadata` in
   `listener/src/services/notification-api.ts:111-214`) and are versioned
   via `ensureNotificationVersion()`
   (`listener/src/utils/notification-version.ts`).
4. **Integrity stamping** — on insert, the repository computes an HMAC over
   the payload with `PAYLOAD_INTEGRITY_SECRET`
   (`scheduled-notification-repository.ts:52-58`); the scheduler re-verifies
   it before delivery.
5. **Delivery** — the scheduler parses the stored `payload` JSON and hands
   it to the provider registry (`notification-scheduler.ts:649-718`).
6. **Audit** — every attempt is written to `notification_execution_log`
   and `delivery_receipts`; failures go to `dead_letter_queue` with the
   recipient redacted (§6).

**What you put in `payload` and `metadata` is your responsibility.** The
payload is free-form JSON stored verbatim in the database and returned by
several read endpoints. Avoid embedding secrets or personal data that the
recipient channel does not already know. The schema guide
(`NOTIFICATION_PAYLOAD_SCHEMA.md`) shows the expected shape; `metadata`
examples include neutral keys such as `userId` and `taskId`.

Event data emitted by the contracts (topics and values, e.g. Stellar
addresses in `AutoshareCreated` topics — see
[`CONTRACT_EVENT_REFERENCE.md`](../CONTRACT_EVENT_REFERENCE.md)) is public
on-chain data by definition, but once indexed it becomes a persistent record
subject to the retention rules below.

---

## 4. Credential storage practices

### Where credentials may live

1. **Environment variables, injected via a secrets manager.** This is the
   only sanctioned server-side store. Secrets-bearing variables:
   `API_KEYS`, `WEBHOOK_SECRETS`, `PAYLOAD_INTEGRITY_SECRET`,
   `DISCORD_WEBHOOK_URL` / `DISCORD_WEBHOOK_ID`. Startup validation lives in
   `listener/src/config.ts` and `listener/src/config/validate-secrets.ts`
   (wired in `listener/src/index.ts:33`).
2. **Never in the database in plaintext.** The one exception pattern is
   scoped credentials, whose secret component is stored only as a scrypt
   hash with a per-credential salt (§2). Verification is timing-safe
   (`secretMatches`, api-credential-service.ts:282-292), and lookups for
   unknown ids burn a dummy hash to defeat timing enumeration
   (api-credential-service.ts:427-431).

### How keys are compared and attributed

- Static API keys are compared by hashing both sides with SHA-256 and using
  `crypto.timingSafeEqual` — the comparison cannot short-circuit on length
  or content (`api-key-auth.ts:19-29`).
- Usage attribution uses **non-reversible client ids**:
  `legacy:<sha256-prefix>` for static keys (`api-key-auth.ts:96-98`) and
  `credential:<id>` for scoped credentials. Raw keys are explicitly rejected
  as identifiers (`fingerprintClient` throws —
  api-credential-service.ts:137-145).
- Rate-limit metrics mask client identifiers to the first 8 characters
  (`rate-limiter.ts:177-179`).

### Rotation and logging rules

- Rotation procedure: add the new secret **alongside** the old, deploy,
  verify, then remove the old. `WEBHOOK_SECRETS` entries are keyed by their
  `id` field so both generations can be verified during the overlap
  (`ENVIRONMENT_VARIABLES_AND_SECRETS.md` §8.4).
- `ENVIRONMENT_VARIABLES_AND_SECRETS.md` §8.3: never log `process.env`.
- All outbound log metadata passes through the redaction engine
  (`listener/src/utils/redact.ts`), which strips `password`, `secret`,
  `apikey`, `token`, `authorization`, `webhook_url`, `whsec…`, `seed`,
  `mnemonic`, and similar keys, plus embedded URL credentials and
  `Bearer`/`sha256=…` values (`SENSITIVE_KEYS`, redact.ts:38-83;
  `redactString`, redact.ts:139-150).

---

## 5. Retention and deletion behavior

Retention is enforced by the background cleanup job
(`listener/src/services/cleanup-service.ts`, started by
`DatabaseCleanupJob` — `listener/src/index.ts:90-93`). Defaults
(`listener/.env.example:341-385`):

| Table | Rule | Default |
|---|---|---|
| `scheduled_notifications` (terminal statuses) | deleted when `processing_completed_at < cutoff` | **7 days** (`NOTIFICATION_RETENTION_MS`) |
| `rate_limit_events` | deleted after | **24 hours** (`RATE_LIMIT_EVENT_RETENTION_MS`) |
| `notification_execution_log` | deleted after | **90 days** (`EXECUTION_LOG_RETENTION_MS`) |
| `processed_events` | deleted after | **30 days** (`PROCESSED_EVENT_RETENTION_MS`) |

The job runs every `CLEANUP_INTERVAL_MS` (default 1 hour) when
`CLEANUP_ENABLED=true`.

### Archives

The archive service (`listener/src/services/archive-service.ts`) moves
terminal notifications to `notification_archive` after `ARCHIVE_AFTER_MS`
(7 days), then **permanently deletes** them after `ARCHIVE_DELETE_AFTER_MS`
(90 days; `0` disables deletion), in batches of `ARCHIVE_BATCH_SIZE=500`,
every `ARCHIVE_INTERVAL_MS` (6 hours). Archived records therefore outlive
the live table but are still eventually erased.

### Expiration

- On-chain: notifications have `expires_at` and transition
  ACTIVE → EXPIRED/REVOKED (see
  [`NOTIFICATION_EXPIRATION_GUIDE.md`](../NOTIFICATION_EXPIRATION_GUIDE.md)).
- Off-chain: the scheduler expires due notifications (`expires_at` column)
  and marks them `EXPIRED`; the expiration window defaults to 24 hours
  (`EXPIRATION_DEFAULT_MS = 86400000`, `EXPIRATION_ENABLED` in
  `listener/src/config.ts:381-408`, consumed by
  `listener/src/services/notification-expiration.ts`).

### Explicit deletion surfaces

- `DELETE /api/templates/:id` (events-server.ts) removes a template.
- `DELETE /api/credentials/:id` revokes a scoped credential
  (`listener/src/api/credentials-api.ts:198-207`) and clears its verification
  cache.
- Scheduled notifications are cancelled (not deleted) via
  `POST /api/schedule/:id/cancel`; physical deletion happens through the
  retention/archive pipeline above.
- Immutable audit tables (`schedule_audit_log`,
  `notification_template_audit_log`, `security_audit_log`) are **not**
  deletable through normal operation — they are append-only by trigger
  (`RAISE(ABORT)` on mutation) and exist for compliance.

---

## 6. Sensitive-data redaction on export and failure paths

Two service-level layers redact sensitive strings:

1. **Log redaction** — `listener/src/utils/redact.ts` wraps all structured
   log metadata (§4).
2. **Export redaction** — `listener/src/services/data-export-service.ts`:
   - `sanitizeRecipient()` (lines 75-96) masks the Discord webhook token
     after `/api/webhooks/<id>/` and masks the email local-part
     (`ab***c@domain`).
   - `sanitizeNotificationRecord()` (lines 101-141) redacts `payload` and
     `metadata` via `redactValue` and applies `sanitizeRecipient` to
     `target_recipient`.
   - Admin export (`GET/POST /api/admin/export`) redacts **by default**
     (`metadata.redacted: true`); only an explicit `includeSensitive=true`
     disables it (events-server.ts:1124-1127).
3. **Dead-letter isolation** — `DeadLetterManager.isolateNotification()`
   (`listener/src/services/dead-letter-manager.ts:30`) redacts the recipient
   and failure reason via `redactString` before storing the entry.

---

## 7. API data exposure

Exposure differs by endpoint; check `listener/src/api/events-server.ts` for
the authoritative list. Summary:

### Open endpoints (no API key required)

- `GET /api/events`, `/api/events/history` — blockchain events including
  full `contractAddress`, `txHash`, topics, and values.
- `GET /api/notifications/search` — returns `targetRecipient`, `payload`,
  and `failureReason` for matching notifications
  (`dashboard/src/services/eventsApi.ts:44-59`). Recipients are **not**
  masked by this endpoint.
- `GET /api/analytics`, `/api/schedule/*` (stats, jobs, queue) —
  operational aggregates and job metadata.
- `GET /api/rate-limit/metrics` — client identifiers masked to `first8…`.
- `GET /health`, `/api/status` — service health and contract addresses.

### API-key protected endpoints

- `GET /api/notifications/history` and
  `GET /api/notifications/:id/receipts` — require `X-API-Key`.
- `POST /api/notifications/import` and `GET/POST /api/admin/export` —
  require `X-API-Key`; export redacts by default (§6).
- `/api/templates*` and `/api/credentials*` — via
  `authorizeRequest()` with scopes (`listener/src/api/api-key-auth.ts:164-220`).
- `POST /api/webhooks` — HMAC-SHA256 signature verification
  (`listener/src/services/webhook-verifier.ts`), documented in
  [`docs/API_AUTHENTICATION_QUICKSTART.md`](API_AUTHENTICATION_QUICKSTART.md).

**Important nuance:** not every write endpoint is currently API-key
protected — for example `POST /api/schedule` and most read endpoints have
no inline key check in code. When deploying, do not rely on the API being
uniformly authenticated; put the listener behind network-level access
control (reverse proxy, VPC) and enable `API_KEYS` for the endpoints that
support it. Tightening this is tracked work; treat this guide as the
as-is description.

### Payload visibility

Stored `payload` JSON is returned verbatim by search, history, receipts,
and (redacted) export endpoints. This is the single most effective lever for
privacy in your integration: **send only what the channel needs.**

---

## 8. Practical privacy checklist

1. **Minimize payloads** — keep `payload` and `metadata` free of secrets and
   unnecessary personal data; they are stored verbatim and surfaced by
   several endpoints.
2. **Secrets only in env** — inject via a secrets manager; never commit
   `.env`, never log `process.env`, never put secrets in payloads.
3. **Prefer scoped `nck_` credentials** — hashed storage, revocable,
   least-privilege scopes; mint only through `/api/credentials`.
4. **Enable `API_KEYS` and network controls in production** — the open
   dev-mode default (no keys → unauthenticated access) is not safe
   publicly.
5. **Tune retention** — adjust `NOTIFICATION_RETENTION_MS`,
   `ARCHIVE_DELETE_AFTER_MS`, and the other cleanup variables to your
   compliance requirements; remember immutable audit tables persist.
6. **Export redacted by default** — keep `includeSensitive` off unless you
   have a documented need.
7. **Rotate with overlap** — add new secrets alongside old ones, verify,
   then remove old entries.
8. **Review the recipient string** — it contains the most sensitive
   off-chain data (webhook tokens, emails, phone numbers) and is redacted
   only in specific paths (exports, dead-letter, logs), not everywhere.
