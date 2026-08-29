# 🆔 Request ID & Correlation Tracing Middleware

This document specifies the Request ID tracing middleware for NotifyChain's API services (Issue #686).

---

## 1. Overview

To make requests traceable across distributed logs and debugging sessions:
1. Every incoming HTTP request resolves a validated `X-Request-ID`.
2. Client-provided `X-Request-ID` and `X-Correlation-ID` headers are validated against strict alphanumeric/hyphen constraints (`^[a-zA-Z0-9_-]{1,64}$`).
3. If valid, the client-provided ID is preserved; if missing or invalid, a secure unique ID is minted.
4. Both IDs are attached to the request context for logging and echoed in HTTP response headers.

---

## 2. Header Contract

| Header Name | Required | Behavior |
|---|---|---|
| `X-Request-ID` | Optional on Request | Validated client ID or minted UUID, echoed on response |
| `X-Correlation-ID` | Optional on Request | Multi-service trace ID, echoed on response |

---

## 3. Usage & Integration

```typescript
import { applyRequestContext } from '../utils/request-id';

export function handleHttpRequest(req: IncomingMessage, res: ServerResponse) {
  const { requestId, correlationId } = applyRequestContext(req, res);
  logger.info(`Received request`, { requestId, correlationId, url: req.url });
}
```
