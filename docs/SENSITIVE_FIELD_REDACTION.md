# 🔒 Sensitive Field Redaction Policy & Logging Sanitation

This document defines the centralized logging redaction policies implemented across the NotifyChain platform (Issue #691).

---

## 1. Redaction Rules & Scope

All log messages and metadata emitted via `logger` are automatically sanitized before reaching any transport (Console, JSON log streams, File, CloudWatch, Datadog):

| Category | Target Patterns | Sanitized Representation |
|---|---|---|
| **Sensitive Keys** | `password`, `secret`, `authorization`, `auth_token`, `bearer`, `api_key`, `private_key`, `secret_key`, `webhook_url` | `[REDACTED]` |
| **Bearer Tokens** | `Bearer <token>` in headers or messages | `Bearer [REDACTED]` |
| **Discord Webhooks** | `https://discord.com/api/webhooks/<id>/<token>` | `https://discord.com/api/webhooks/[REDACTED_WEBHOOK_URL]` |
| **Stellar Secret Keys** | `S[A-Z2-7]{55}` (StrKey Ed25519) | `S[REDACTED_STELLAR_SECRET_KEY]` |
| **Error Stacks & Causes** | Error message, stack trace, and nested causal chains | Regex-sanitized |

---

## 2. Implementation & Unit Tests

* Redaction engine: [`listener/src/utils/redact.ts`](../listener/src/utils/redact.ts)
* Logger integration: [`listener/src/utils/logger.ts`](../listener/src/utils/logger.ts)
* Verification suite: [`listener/src/utils/redact.test.ts`](../listener/src/utils/redact.test.ts)
