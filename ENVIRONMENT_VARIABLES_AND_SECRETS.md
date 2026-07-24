# Environment Variables and Secrets (NotifyChain)

> Centralized documentation for environment variables and secret management requirements across NotifyChain services.

This document is based on the listener service configuration found in `listener/src/config.ts`.

## 1. Services covered

- **Listener service** (`listener/`): the Node.js/TypeScript long-running process that:
  - polls Stellar for contract events
  - deduplicates and stores events
  - dispatches notifications (Discord/webhooks)
  - exposes HTTP APIs
  - schedules retries and scheduled notifications

- **Dashboard service** (`dashboard/` and/or `frontend/`): this repo currently does not define a runtime server-side secret surface in code we accessed here. (Dashboard configuration is handled via its build tooling; sensitive values should still be avoided or proxied through the listener.)

## 2. Environment variables list (Listener)

### 2.1 Stellar / chain connectivity

| Variable | Purpose | Format | Default (from code) | Notes |
|---|---|---|---|---|
| `STELLAR_NETWORK` | Stellar network label used by components that need a network name | string | `testnet` | Set to `testnet`/`public`/etc as required. |
| `STELLAR_RPC_URL` | Stellar Horizon / RPC base URL used to fetch events/ledgers | string | `https://soroban-testnet.stellar.org:443` | Override in production to your own endpoint. |
| `STELLAR_NETWORK_PASSPHRASE` | Network passphrase used for Stellar SDK / signature context | string | `Test SDF Network ; September 2015` | Must match the network you are targeting. |

### 2.2 Contract event selection

| Variable | Purpose | Format | Default | Notes |
|---|---|---|---|---|
| `CONTRACT_ADDRESSES` | Which contract addresses to monitor and which event names to allow | JSON array | `[]` | **Required shape**: `[ { "address": "<contractId>", "events": ["<eventName>", ...] }, ... ]` |

#### Example
```json
[
  {
    "address": "123abc...",
    "events": ["TaskCreated", "WorkSubmitted"]
  },
  {
    "address": "456def...",
    "events": ["AutoshareCreated", "GroupActivated"]
  }
]
```

### 2.3 Listener core polling / reconnect

| Variable | Purpose | Format | Default | Notes |
|---|---|---|---|---|
| `POLL_INTERVAL_MS` | Subscriber polling interval | integer (ms) | `30000` | Controls how often the listener checks for new events. |
| `MAX_RECONNECT_ATTEMPTS` | Reconnect attempts for RPC failures | integer | `5` | |
| `RECONNECT_DELAY_MS` | Delay between reconnect attempts | integer (ms) | `5000` | |

### 2.4 Events HTTP server

| Variable | Purpose | Format | Default | Notes |
|---|---|---|---|---|
| `EVENTS_API_PORT` | Port for listener HTTP server | integer | `8787` | |
| `EVENTS_API_CORS_ORIGIN` | Allowed CORS origin for the events API | string | `http://localhost:5173` | Set to your dashboard origin(s) in production. |

### 2.5 Database

| Variable | Purpose | Format | Default | Notes |
|---|---|---|---|---|
| `DATABASE_PATH` | SQLite database file path used for deduplication/cursors and scheduler state | string | `./data/notifications.db` | Ensure the path is persistent and writable. |

### 2.6 Discord delivery (webhook-based)

The listener supports Discord notifications via webhook URL and ID.

| Variable | Purpose | Format | Default | Notes |
|---|---|---|---|---|
| `DISCORD_WEBHOOK_URL` | Discord webhook URL | string | *(optional)* | If provided, `DISCORD_WEBHOOK_ID` must also be provided. |
| `DISCORD_WEBHOOK_ID` | Discord webhook ID | string | *(optional)* | If provided, `DISCORD_WEBHOOK_URL` must also be provided. |
| `NOTIFICATION_DEDUPLICATION_WINDOW_MS` | Dedup window used for Discord notifications | integer (ms) | `60000` | |
| `NOTIFICATION_DEDUPLICATION_MAX_SIZE` | Max entries for dedup cache/window | integer | `10000` | |

### 2.7 Webhook secret management

| Variable | Purpose | Format | Default | Notes |
|---|---|---|---|---|
| `WEBHOOK_SECRETS` | Secrets required to verify incoming/outgoing webhook identities (as implemented in listener code) | JSON array | `[]` | **Required shape**: `[ { "id": "<string>", "secret": "<string>" }, ... ]` |

#### Example
```json
[
  {
    "id": "target-1",
    "secret": "whsec_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
  },
  {
    "id": "target-2",
    "secret": "whsec_bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
  }
]
```

### 2.8 Cleanup / retention policies

| Variable | Purpose | Format | Default | Notes |
|---|---|---|---|---|
| `CLEANUP_INTERVAL_MS` | Interval for cleanup job | integer (ms) | `3600000` (1h) | |
| `NOTIFICATION_RETENTION_MS` | How long notifications/events are retained | integer (ms) | `604800000` (7d) | |
| `RATE_LIMIT_EVENT_RETENTION_MS` | How long rate-limit tracking is retained | integer (ms) | `86400000` (24h) | |
| `EVENT_RETENTION_MS` | How long raw events are retained | integer (ms) | `86400000` (24h) | |

### 2.9 Scheduler subsystem (scheduled notifications)

| Variable | Purpose | Format | Default | Notes |
|---|---|---|---|---|
| `SCHEDULER_ENABLED` | Enable scheduled notifications processing | boolean-like string | *(enabled unless `false`)* | Code: `trimEnv('SCHEDULER_ENABLED') !== 'false'` |
| `SCHEDULER_POLL_INTERVAL_MS` | Scheduler tick interval | integer (ms) | `10000` | |
| `SCHEDULER_LOCK_TIMEOUT_MS` | Lock timeout for worker acquisition | integer (ms) | `60000` | |
| `SCHEDULER_PROCESSOR_ID` | Identifier for this scheduler worker instance | string | *(optional)* | Useful for debugging multi-instance deployments. |
| `SCHEDULER_BATCH_SIZE` | How many due notifications to fetch/process per tick | integer | `10` | |
| `SCHEDULER_TIMING_BUFFER_MS` | Timing buffer to avoid late/early dispatch edges | integer (ms) | `60000` | |

### 2.10 Retry scheduler subsystem

Used for retrying failed deliveries/processing.

| Variable | Purpose | Format | Default | Notes |
|---|---|---|---|---|
| `RETRY_SCHEDULER_ENABLED` | Enable retry scheduler | boolean-like string | *(enabled unless `false`)* | `!== 'false'` semantics |
| `RETRY_SCHEDULER_POLL_INTERVAL_MS` | Retry scheduler tick interval | integer (ms) | `15000` | |
| `RETRY_SCHEDULER_LOCK_TIMEOUT_MS` | Lock timeout for retry worker acquisition | integer (ms) | `60000` | |
| `RETRY_SCHEDULER_PROCESSOR_ID` | Processor identifier for retry worker | string | *(optional)* | |
| `RETRY_SCHEDULER_BATCH_SIZE` | Retry jobs processed per tick | integer | `10` | |
| `RETRY_BASE_DELAY_MS` | Base delay for exponential backoff | integer (ms) | `5000` | |
| `RETRY_MULTIPLIER` | Exponential backoff multiplier | integer | `2` | |
| `RETRY_MAX_RETRIES` | Max number of retries | integer | `5` | |
| `RETRY_JITTER` | Whether to apply jitter to delays | boolean-like string | *(enabled unless `false`)* | Code: `trimEnv('RETRY_JITTER') !== 'false'` |
| `RETRY_MAX_DELAY_MS` | Maximum delay clamp | integer (ms) | `3600000` (1h) | |

### 2.11 Rate limiting

| Variable | Purpose | Format | Default | Notes |
|---|---|---|---|---|
| `RATE_LIMIT_ENABLED` | Enable rate limiting | boolean-like string | *(enabled unless `false`)* | `!== 'false'` semantics |
| `RATE_LIMIT_WINDOW_MS` | Rate limit window size | integer (ms) | `60000` | |
| `RATE_LIMIT_MAX_REQUESTS` | Max requests per window | integer | `60` | |
| `RATE_LIMIT_CLIENT_OVERRIDES` | Per-client overrides | JSON object | `{}` | **Shape**: `{ "<clientKey>": { "maxRequests": <int>, "windowMs": <int?> }, ... }` |

#### Example
```json
{
  "dashboard-dev": { "maxRequests": 120, "windowMs": 60000 },
  "dashboard-prod": { "maxRequests": 60 }
}
```

### 2.12 Event queue / concurrency

| Variable | Purpose | Format | Default | Notes |
|---|---|---|---|---|
| `EVENT_QUEUE_MAX_CONCURRENCY` | Max concurrent event-processing tasks | integer | `1` | |
| `EVENT_QUEUE_MAX_RETRIES` | Max retries for event queue tasks | integer | `3` | |
| `EVENT_QUEUE_BASE_DELAY_MS` | Base delay for event queue retry backoff | integer (ms) | `2000` | |
| `EVENT_QUEUE_POLL_INTERVAL_MS` | Event queue poll interval | integer (ms) | `1000` | |

## 3. Sample configuration (copy/paste)

Below are examples that match the parsing/validation behavior in `listener/src/config.ts`.

### 3.1 Local / development (single instance)

```bash
# Stellar
STELLAR_NETWORK=testnet
STELLAR_RPC_URL=https://soroban-testnet.stellar.org:443
STELLAR_NETWORK_PASSPHRASE='Test SDF Network ; September 2015'

# What to monitor (contracts + event names)
CONTRACT_ADDRESSES='[
  {"address":"123abc...","events":["TaskCreated","WorkSubmitted"]}
]'

# Listener HTTP API
EVENTS_API_PORT=8787
EVENTS_API_CORS_ORIGIN=http://localhost:5173

# Database
DATABASE_PATH=./data/notifications.db

# Discord (optional)
# DISCORD_WEBHOOK_URL='https://discord.com/api/webhooks/...'
# DISCORD_WEBHOOK_ID='...'

# Webhook verification secrets (optional)
WEBHOOK_SECRETS='[
  {"id":"target-1","secret":"whsec_example_secret"}
]'

# Cleanup/retention
CLEANUP_INTERVAL_MS=3600000
NOTIFICATION_RETENTION_MS=604800000
RATE_LIMIT_EVENT_RETENTION_MS=86400000
EVENT_RETENTION_MS=86400000

# Scheduler
SCHEDULER_ENABLED=true
SCHEDULER_POLL_INTERVAL_MS=10000
SCHEDULER_LOCK_TIMEOUT_MS=60000
SCHEDULER_PROCESSOR_ID=local-1
SCHEDULER_BATCH_SIZE=10
SCHEDULER_TIMING_BUFFER_MS=60000

# Retry scheduler
RETRY_SCHEDULER_ENABLED=true
RETRY_SCHEDULER_POLL_INTERVAL_MS=15000
RETRY_SCHEDULER_LOCK_TIMEOUT_MS=60000
RETRY_SCHEDULER_PROCESSOR_ID=local-1
RETRY_SCHEDULER_BATCH_SIZE=10
RETRY_BASE_DELAY_MS=5000
RETRY_MAX_RETRIES=5
RETRY_MULTIPLIER=2
RETRY_JITTER=true
RETRY_MAX_DELAY_MS=3600000

# Rate limiting
RATE_LIMIT_ENABLED=true
RATE_LIMIT_WINDOW_MS=60000
RATE_LIMIT_MAX_REQUESTS=60
RATE_LIMIT_CLIENT_OVERRIDES='{}'

# Event queue
EVENT_QUEUE_MAX_CONCURRENCY=1
EVENT_QUEUE_MAX_RETRIES=3
EVENT_QUEUE_BASE_DELAY_MS=2000
EVENT_QUEUE_POLL_INTERVAL_MS=1000
```

### 3.2 Production-like (multi-instance safe practices)

Key differences:
- Set explicit `*_PROCESSOR_ID` per instance for observability.
- Use stable storage for `DATABASE_PATH`.
- Use your real webhook secrets and Discord webhook values.

```bash
STELLAR_NETWORK=public
STELLAR_RPC_URL=https://your-rpc.example.com
STELLAR_NETWORK_PASSPHRASE='Public Global Stellar Network ; September 2015'

CONTRACT_ADDRESSES='[
  {"address":"<contract-id>","events":["TaskCreated","WorkSubmitted","SubmissionApproved"]}
]'

EVENTS_API_PORT=8787
EVENTS_API_CORS_ORIGIN=https://your-dashboard.example.com

DATABASE_PATH=/var/lib/notifychain/notifications.db

# Discord (optional)
DISCORD_WEBHOOK_URL='https://discord.com/api/webhooks/...'
DISCORD_WEBHOOK_ID='...'

# Webhook secrets (optional)
WEBHOOK_SECRETS='[
  {"id":"<target>","secret":"<rotated-secret>"}
]'

SCHEDULER_ENABLED=true
SCHEDULER_PROCESSOR_ID=worker-a

RETRY_SCHEDULER_ENABLED=true
RETRY_SCHEDULER_PROCESSOR_ID=worker-a

RATE_LIMIT_ENABLED=true
RATE_LIMIT_MAX_REQUESTS=60
RATE_LIMIT_WINDOW_MS=60000
RATE_LIMIT_CLIENT_OVERRIDES='{
  "dashboard": {"maxRequests": 120, "windowMs": 60000}
}'
```

## 4. Security recommendations

### 4.1 Treat these as secrets
The following must never be committed to git and should be injected via a secrets manager / CI/CD secrets:

- `DISCORD_WEBHOOK_URL`
- `DISCORD_WEBHOOK_ID`
- `WEBHOOK_SECRETS` (contains per-target secret material)

### 4.2 Use a secrets manager
Use one of:
- AWS Secrets Manager / SSM Parameter Store
- GCP Secret Manager
- Azure Key Vault
- HashiCorp Vault
- Kubernetes Secrets (optionally backed by an external secrets operator)

Prefer short-lived credentials where possible.

### 4.3 Avoid logging secrets
- Do not print `process.env`.
- Ensure logger configuration does not include the raw secret env vars.
- When catching errors, avoid including full config objects in error messages.

### 4.4 Rotate secrets safely
- Rotate `WEBHOOK_SECRETS` entries by `id`.
- Perform rotation with overlap (run new config while old secrets remain temporarily valid) if the verifier logic supports it.
- After rotation, restart listener instances to pick up new values.

### 4.5 Enforce allowlists / least privilege (webhook targets)
- Only include webhook IDs/secrets for targets you explicitly trust.
- Avoid broad “catch-all” secrets.

### 4.6 Use correct JSON escaping
Because `CONTRACT_ADDRESSES`, `WEBHOOK_SECRETS`, and `RATE_LIMIT_CLIENT_OVERRIDES` are parsed as JSON strings:
- Ensure your shell quoting is correct.
- Prefer single quotes around the entire JSON string in bash-like shells.

### 4.7 CORS hardening
If you expose the dashboard publicly:
- Set `EVENTS_API_CORS_ORIGIN` to exact origins.
- Avoid `*` in production.

### 4.8 Do not commit `.env` files
This repo uses example env files (e.g. `.env.staging` exists). Ensure:
- `.env*` is in `.gitignore` (and verify it in CI).
- only example templates are committed.

## 5. Operational notes / troubleshooting

- **Missing required/paired values**: `DISCORD_WEBHOOK_URL` and `DISCORD_WEBHOOK_ID` must be provided together.
- **JSON parse failures**: malformed `CONTRACT_ADDRESSES`, `WEBHOOK_SECRETS`, or `RATE_LIMIT_CLIENT_OVERRIDES` will cause a startup config error.
- **Scheduler & retry behavior**: ensure `*_LOCK_TIMEOUT_MS` and `*_POLL_INTERVAL_MS` suit your deployment latency and number of instances.

---

*Last updated: 2026-06-26.*

