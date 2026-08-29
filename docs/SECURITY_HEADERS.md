# 🛡️ HTTP Security Headers Specification

This document details the HTTP security headers implemented in the NotifyChain API server (Issue #690).

---

## 1. Configured Security Headers

| Header | Value | Purpose |
|---|---|---|
| `X-Content-Type-Options` | `nosniff` | Blocks MIME-type sniffing |
| `X-Frame-Options` | `DENY` | Prevents clickjacking in iframes |
| `Referrer-Policy` | `strict-origin-when-cross-origin` | Limits referrer leakage |
| `X-XSS-Protection` | `0` | Disables legacy XSS auditor in favor of CSP |
| `Permissions-Policy` | `camera=(), microphone=(), geolocation=()` | Restricts privileged browser APIs |
| `Content-Security-Policy` | `default-src 'self'; frame-ancestors 'none';` | Restricts untrusted script/frame embedding |
| `Strict-Transport-Security` | `max-age=31536000; includeSubDomains; preload` | Enforces HTTPS in production |

---

## 2. Integration & Verification

The middleware `applySecurityHeaders` is automatically applied on all incoming HTTP requests in `listener/src/api/events-server.ts`.

Automated tests are located at `listener/src/middleware/security-headers.test.ts`.
