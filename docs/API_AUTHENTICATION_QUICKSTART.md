# API Authentication and Integration Quickstart

A practical guide to authenticating against the NotifyChain listener HTTP
API and integrating with it safely. Everything here uses placeholder
credentials — never commit or share real secrets.

> Related reading:
> - [`listener/API.md`](../listener/API.md) — full endpoint reference.
> - [`docs/API_ERROR_REFERENCE.md`](API_ERROR_REFERENCE.md) — every error response, with causes and resolutions.
> - [`docs/API_USAGE_EXAMPLES.md`](API_USAGE_EXAMPLES.md) — request/response cookbook.
> - [`ENVIRONMENT_VARIABLES_AND_SECRETS.md`](../ENVIRONMENT_VARIABLES_AND_SECRETS.md) — how keys are configured.
> - [`listener/docs/WEBHOOK_SIGNATURE_VERIFICATION.md`](../listener/docs/WEBHOOK_SIGNATURE_VERIFICATION.md) — signature details.

The listener is a Node.js HTTP service (no framework) started by
`listener/src/index.ts`; all routes are handled in
[`listener/src/api/events-server.ts`](../listener/src/api/events-server.ts).
Default base URL for local development:

```
http://localhost:8787        # EVENTS_API_PORT, listener/.env.example:59
```

---

## 1. Configure credentials (server side)

NotifyChain supports **two inbound authentication schemes**, plus a
signature scheme for consumers receiving notifications:

1. **Static API keys via the `X-API-Key` header** (keys from env config).
2. **Scoped credentials (`nck_…` keys)** minted through the credentials API
   and stored as scrypt hashes.

For consumers *receiving* notifications, `POST /api/webhooks` requests are
protected with **HMAC-SHA256 webhook signatures**.

### 1.1 Static API keys

Set `API_KEYS` in `listener/.env` as a JSON array of `{key, name?}` objects
(`listener/.env.example:123-130`):

```bash
# JSON array of {key, name?} objects. Clients must supply a matching key.
# Example: [{"key":"sk_live_abc123","name":"dashboard-prod"}]
API_KEYS='[{"key":"<your-random-32+-char-key>","name":"dashboard-prod"}]'
```

Rules enforced by code:

- Parsed in `listener/src/config.ts` (`parseJsonEnv('API_KEYS', '[]')`,
  line 500) and validated by `validateApiKeys()` (lines 254-266) — entries
  must be objects with a non-empty `key`.
- Generation tip: `openssl rand -base64 32`.
- Comparison is timing-safe: both sides are SHA-256 hashed and compared
  with `crypto.timingSafeEqual` (`listener/src/api/api-key-auth.ts:27-29`).
- **Backward-compat behavior:** if no keys are configured, protected
  endpoints allow access with `enforced: false` (dev/local mode —
  `api-key-auth.ts:43-45`). Always configure keys in any shared
  environment.

### 1.2 Scoped credentials (`nck_…`)

Scoped keys are minted via the credentials API and look like
`nck_<16-hex-id>_<43-char-secret>` (format pattern in
`listener/src/services/api-credential-service.ts:41-42`). They:

- Are stored **only as an scrypt hash** (`hashSecret()`,
  api-credential-service.ts:275-280) — the plaintext secret is shown exactly
  once when created.
- Carry explicit scopes; endpoints using `authorizeRequest()` require every
  listed scope, returning `403 INVALID_PERMISSIONS` otherwise.
- Can be revoked with `DELETE /api/credentials/:id`.

### 1.3 Which endpoints actually require a key

Only these routes check `X-API-Key` (see `events-server.ts`):

| Endpoint | Check |
|---|---|
| `GET /api/notifications/history` | `X-API-Key` required |
| `GET /api/notifications/:id/receipts` | `X-API-Key` required |
| `POST /api/notifications/import` | `X-API-Key` required (inline check) |
| `GET/POST /api/admin/export` (and `/api/export`) | `X-API-Key` required (inline check) |
| `/api/templates*` (GET/POST/PUT/DELETE) | `authorizeRequest()` with scopes |
| `/api/credentials*` (POST/GET/DELETE) | `X-API-Key` + scopes; auth required even with no keys configured |

Other endpoints — including `GET /api/events`, `/api/analytics`,
`/api/schedule/*`, `POST /api/schedule`, and search — are currently open.
For production, place the listener behind network-level access control and
prefer scoping exposure; see
[`docs/DATA_PRIVACY_AND_INFORMATION_HANDLING.md`](DATA_PRIVACY_AND_INFORMATION_HANDLING.md) §7.

---

## 2. Authentication headers

### `X-API-Key`

```
X-API-Key: <your-key>
```

- Duplicate `X-API-Key` headers are ambiguous and rejected
  (`api-key-auth.ts:49-51`).
- Keys starting with `nck_` are verified against the credential service and
  must satisfy every required scope; other keys are matched against the
  static `API_KEYS` config (`authorizeRequest()`,
  api-key-auth.ts:164-220).
- On 401 the server sets
  `WWW-Authenticate: ApiKey header="X-API-Key"` (events-server.ts:571-574).

### HMAC webhook signature (for `POST /api/webhooks` senders)

Requests to `POST /api/webhooks` must carry three headers
(`listener/src/services/webhook-verifier.ts`):

```
X-Webhook-Signature: sha256=<hex-digest>
X-Webhook-Timestamp: <unix-seconds>
X-Webhook-Key-Id:    <id of the WEBHOOK_SECRETS entry to use>
```

Signing input is `timestamp + "." + rawBody` — the timestamp is
cryptographically bound to the body (replay protection,
`webhook-verifier.ts:44-49`). Signatures older than **300 seconds** are
rejected (`signatureExpirationSeconds`, events-server.ts:882). Configure
server-side secrets in `WEBHOOK_SECRETS`:

```bash
WEBHOOK_SECRETS='[{"id":"default","secret":"<whsec_your_secret_here>"}]'
```

---

## 3. Working examples

### 3.1 cURL — call a protected endpoint with a static key

```bash
BASE_URL="http://localhost:8787"
API_KEY="<your-key>"   # keep secrets out of shell history: prefer read -s or a dotenv tool

# Notification history (protected)
curl -sS "$BASE_URL/api/notifications/history" \
  -H "X-API-Key: $API_KEY" \
  -H "Accept: application/json"

# Admin export (protected; redacted by default)
curl -sS -X POST "$BASE_URL/api/admin/export" \
  -H "X-API-Key: $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"format":"json"}'
```

### 3.2 cURL — schedule a notification (open endpoint)

```bash
curl -sS -X POST "$BASE_URL/api/schedule" \
  -H "Content-Type: application/json" \
  -d '{
    "payload": { "message": "Ledger 12345 processed" },
    "notificationType": "webhook",
    "targetRecipient": "https://example.invalid/hooks/notify",
    "executeAt": "2026-11-20T12:00:00Z",
    "maxRetries": 3
  }'
```

> The payload schema (`payload`, `notificationType`, `targetRecipient`,
> `executeAt`, `maxRetries`, `eventId`, `contractAddress`, `priority`,
> `metadata`) is documented in
> [`NOTIFICATION_PAYLOAD_SCHEMA.md`](../NOTIFICATION_PAYLOAD_SCHEMA.md).
> Duplicate `eventId` + type submissions return HTTP 409.

### 3.3 cURL — send a signed webhook

```bash
BODY='{"schemaVersion":"1.0","message":"hello from integration test"}'
TS=$(date +%s)
KEY_ID="default"
SECRET="<whsec_your_secret_here>"
SIG=$(printf '%s.%s' "$TS" "$BODY" | openssl dgst -sha256 -hmac "$SECRET" -hex | awk '{print $2}')

curl -sS -X POST "$BASE_URL/api/webhooks" \
  -H "Content-Type: application/json" \
  -H "X-Webhook-Signature: sha256=$SIG" \
  -H "X-Webhook-Timestamp: $TS" \
  -H "X-Webhook-Key-Id: $KEY_ID" \
  -d "$BODY"
```

### 3.4 JavaScript (Node.js) — protected GET with retries

```javascript
const BASE_URL = process.env.NOTIFYCHAIN_URL ?? 'http://localhost:8787';
// Load the key from your environment/secrets manager — never hard-code it.
const API_KEY = process.env.NOTIFYCHAIN_API_KEY;
if (!API_KEY) throw new Error('NOTIFYCHAIN_API_KEY is not set');

async function getNotificationHistory() {
  const response = await fetch(`${BASE_URL}/api/notifications/history`, {
    headers: {
      'X-API-Key': API_KEY,
      'Accept': 'application/json',
    },
  });

  if (response.status === 401) {
    // See §5 for the exact error envelope.
    throw new Error('Authentication failed — check your X-API-Key value');
  }
  if (response.status === 429) {
    const retryAfter = Number(response.headers.get('Retry-After') ?? '1');
    await new Promise((r) => setTimeout(r, retryAfter * 1000));
    return getNotificationHistory();
  }
  if (!response.ok) {
    throw new Error(`Unexpected status ${response.status}`);
  }

  const body = await response.json(); // { success: true, data: ... }
  return body;
}
```

### 3.5 JavaScript — compute a webhook signature (consumer-side verification)

To *receive* NotifyChain notifications, verify the signature exactly as the
reference consumer does
(`listener/src/examples/webhook-consumer-verification-example.ts:315-317`):

```javascript
import crypto from 'node:crypto';

const MAX_AGE_SECONDS = 300;

function verifyNotifyChainWebhook(rawBody, headers, knownSecrets) {
  const signature = headers['x-webhook-signature'];   // "sha256=<hex>"
  const timestamp = headers['x-webhook-timestamp'];   // unix seconds
  const keyId = headers['x-webhook-key-id'];

  if (!signature || !timestamp || !keyId) {
    return { ok: false, reason: 'missing signature header' };
  }

  const age = Math.abs(Date.now() / 1000 - Number(timestamp));
  if (age > MAX_AGE_SECONDS) {
    return { ok: false, reason: 'expired timestamp' };
  }

  const secret = knownSecrets.find((s) => s.id === keyId)?.secret;
  if (!secret) return { ok: false, reason: 'unknown key id' };

  // Signing input binds the timestamp: timestamp + "." + rawBody
  const expected = crypto
    .createHmac('sha256', secret)
    .update(`${timestamp}.${rawBody}`)
    .digest('hex');

  const provided = signature.slice('sha256='.length);
  const valid =
    provided.length === expected.length &&
    crypto.timingSafeEqual(Buffer.from(provided), Buffer.from(expected));

  return { ok: valid };
}
```

---

## 4. Safe credential handling

1. **Generate keys with a CSPRNG** — e.g. `openssl rand -base64 32`; do not
   use names, dates, or UUIDs.
2. **Inject via a secrets manager** (AWS Secrets Manager / SSM, Vault,
   Kubernetes Secrets) — `ENVIRONMENT_VARIABLES_AND_SECRETS.md` §8.2. Never
   commit `.env` files (§8.6) and never log `process.env` (§8.3).
3. **Quote JSON values in env files** — `API_KEYS`, `WEBHOOK_SECRETS`,
   `PAYLOAD_INTEGRITY_SECRET`, and `RATE_LIMIT_CLIENT_OVERRIDES` are parsed
   as JSON (`ENVIRONMENT_VARIABLES_AND_SECRETS.md` §8.7).
4. **Use scoped `nck_` credentials for integrations** — least privilege,
   revocable, hashed at rest; reserve static keys for infrastructure.
5. **Rotate with overlap** — add the new key alongside the old, deploy,
   verify, then remove the old (§8.4). For `WEBHOOK_SECRETS`, entries are
   keyed by `id`, so both generations verify during the window.
6. **Never send secrets in URLs or payloads** — the listener redacts
   webhook tokens and `Bearer` tokens from logs
   (`listener/src/utils/redact.ts`), but payloads are stored verbatim
   (see [`docs/DATA_PRIVACY_AND_INFORMATION_HANDLING.md`](DATA_PRIVACY_AND_INFORMATION_HANDLING.md) §3).
7. **HTTPS in production** — local development uses plain HTTP on 8787;
   terminate TLS at a proxy in real deployments and restrict CORS with
   `EVENTS_API_CORS_ORIGIN` (default `http://localhost:5173`;
   `listener/.env.example:68`).

---

## 5. Common authentication error responses

All errors use the shared envelope from
`listener/src/utils/response.ts`:

```json
{
  "success": false,
  "error": {
    "code": "UNAUTHORIZED",
    "message": "Unauthorized: invalid API key",
    "details": [],
    "correlation_id": "..."
  }
}
```

| Situation | Status | `error.code` | Message (verbatim) | Notes |
|---|---|---|---|---|
| Missing `X-API-Key` on protected route | 401 | `UNAUTHORIZED` | `Unauthorized: missing API key` | Sets `WWW-Authenticate: ApiKey header="X-API-Key"` |
| Wrong `X-API-Key` | 401 | `UNAUTHORIZED` | `Unauthorized: invalid API key` | Same header; duplicated headers count as invalid |
| Missing/invalid key on import/export | 401 | `UNAUTHORIZED` | `Unauthorized` | Inline checks (events-server.ts:1063, 1102) |
| Missing/invalid key on receipts/history | 401 | `UNAUTHORIZED` | `Unauthorized: Invalid or missing API key` | events-server.ts:1744, 1774 |
| `nck_` key lacks a required scope | 403 | `INVALID_PERMISSIONS` | `The provided credentials lack the necessary scope for this action.` | `details: [{ requiredScopes, missingScopes }]` (api-key-auth.ts:188-197) |
| Minting credentials beyond your scopes | 403 | `INVALID_PERMISSIONS` | Same | `details: [{ reason: 'Cannot grant scopes the calling credential does not hold' }]` (credentials-api.ts:164-168) |
| Webhook: missing signature header | 401 | varies | `Missing signature header` | `webhook-verifier.ts:87-99`; full table in `docs/API_ERROR_REFERENCE.md` |
| Webhook: stale/expired timestamp | 401 | varies | expired-timestamp message | Signature max age 300 s |
| Rate limit exceeded | 429 | `RATE_LIMITED` | `Rate limit exceeded. Try again in N seconds.` | Honors `Retry-After`; per-client overrides via `RATE_LIMIT_CLIENT_OVERRIDES` |
| Credential routes with service disabled | 503 | `SERVICE_UNAVAILABLE` | `Credential management is not enabled` | credentials-api.ts:146 |

Codes are defined in
[`listener/src/errors/api-error-codes.ts`](../listener/src/errors/api-error-codes.ts);
`docs/API_ERROR_REFERENCE.md` §5 documents the 401 family in depth.

**Client-side handling rules of thumb:**

- On 401, do not retry blindly — the key is missing or wrong; fix the
  credential first.
- On 403 with `missingScopes`, request the missing scopes or mint a new
  credential; retrying will not help.
- On 429, respect `Retry-After` (also present as
  `X-RateLimit-Reset` on all responses).
- Log `correlation_id` when reporting issues — it ties your request to
  server logs.

---

## 6. Quick smoke test checklist

1. `curl http://localhost:8787/health` — no auth; verifies the service is up.
2. `curl -H "X-API-Key: <key>" http://localhost:8787/api/notifications/history` — verifies key config.
3. Omit the header and repeat — expect the 401 envelope from §5.
4. Send a signed `POST /api/webhooks` — expect `success: true`.
5. Tamper with the body — expect a signature-failure error
   (`listener/src/examples/webhook-consumer-verification-example.ts`
   automates exactly these cases).
