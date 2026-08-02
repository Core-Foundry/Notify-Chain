# API Versioning Strategy

**Issue**: #386  
**Status**: Active — `/api/v1/` is the current stable version  
**Last updated**: 2026-07-28

---

## Overview

The NotifyChain Listener service supports explicit API versioning through a `/api/v1/` URL prefix.
The versioning layer lives in `listener/src/api/events-server.ts` and is implemented as a path
normalization step that transparently rewrites `/api/v1/*` requests to their canonical `/api/*`
form before routing.

This approach means:

1. **No code duplication** — every route handler is written once.
2. **Instant backward compatibility** — unversioned `/api/*` routes continue to work without
   any changes to existing clients.
3. **Future versions** — when breaking changes are required, a `/api/v2/` prefix can be
   introduced alongside the existing `/api/v1/` paths.

---

## Versioned Endpoints

All endpoints available at `/api/*` are also reachable at `/api/v1/*`.

| Unversioned (legacy)                        | Versioned (recommended)                         |
|---------------------------------------------|-------------------------------------------------|
| `GET /api/events`                           | `GET /api/v1/events`                            |
| `GET /api/status`                           | `GET /api/v1/status`                            |
| `GET /api/indexing/health`                  | `GET /api/v1/indexing/health`                   |
| `GET /api/notifications/health`             | `GET /api/v1/notifications/health`              |
| `GET /api/notifications/search`             | `GET /api/v1/notifications/search`              |
| `GET /api/analytics`                        | `GET /api/v1/analytics`                         |
| `GET /api/analytics/history`                | `GET /api/v1/analytics/history`                 |
| `GET /api/schedule/stats`                   | `GET /api/v1/schedule/stats`                    |
| `GET /api/schedule/execution-metrics`       | `GET /api/v1/schedule/execution-metrics`        |
| `GET /api/schedule/retry-distribution`      | `GET /api/v1/schedule/retry-distribution`       |
| `GET /api/schedule/retry-statistics`        | `GET /api/v1/schedule/retry-statistics`         |
| `GET /api/schedule/:id`                     | `GET /api/v1/schedule/:id`                      |
| `POST /api/schedule`                        | `POST /api/v1/schedule`                         |
| `DELETE /api/schedule/:id`                  | `DELETE /api/v1/schedule/:id`                   |
| `POST /api/webhooks`                        | `POST /api/v1/webhooks`                         |
| `POST /api/notifications/validate-batch`    | `POST /api/v1/notifications/validate-batch`     |
| `GET /api/search/suggestions`               | `GET /api/v1/search/suggestions`                |
| `GET /api/templates`                        | `GET /api/v1/templates`                         |
| `POST /api/templates`                       | `POST /api/v1/templates`                        |
| `GET /api/templates/:id`                    | `GET /api/v1/templates/:id`                     |
| `PUT /api/templates/:id`                    | `PUT /api/v1/templates/:id`                     |
| `DELETE /api/templates/:id`                 | `DELETE /api/v1/templates/:id`                  |
| `POST /api/templates/:id/render`            | `POST /api/v1/templates/:id/render`             |
| `GET /api/templates/:id/audit`              | `GET /api/v1/templates/:id/audit`               |
| `GET /api/preferences/:userId`              | `GET /api/v1/preferences/:userId`               |
| `PUT /api/preferences/:userId`              | `PUT /api/v1/preferences/:userId`               |
| `GET /api/archive`                          | `GET /api/v1/archive`                           |
| `GET /api/archive/:id`                      | `GET /api/v1/archive/:id`                       |
| `POST /api/archive/run`                     | `POST /api/v1/archive/run`                      |
| `GET /api/rate-limit/metrics`               | `GET /api/v1/rate-limit/metrics`                |

> **Note**: `GET /health` is a non-versioned infrastructure endpoint and remains at `/health` only.

---

## Response Header

Every response from the versioned server includes:

```
X-API-Version: v1
```

Clients can use this header to detect the active API version at runtime.

---

## Implementation Details

The versioning is implemented in `listener/src/api/events-server.ts` via a single path
normalization block executed after CORS headers are set and before any route handler runs:

```typescript
// Rewrite /api/v1/* → /api/* (path normalisation for versioning)
if (url.pathname.startsWith('/api/v1/')) {
  url.pathname = url.pathname.replace('/api/v1/', '/api/');
} else if (url.pathname === '/api/v1') {
  url.pathname = '/api';
}
res.setHeader('X-API-Version', 'v1');
```

No route handler knows about versioning — they all match against the canonical `/api/` form.

---

## Backward Compatibility Guarantee

Unversioned `/api/*` routes are **not deprecated** and have no planned removal date.
The deprecation lifecycle is as follows:

### Lifecycle Stages

| Stage        | Notice period  | Description                                                          |
|--------------|----------------|----------------------------------------------------------------------|
| `active`     | —              | Route is stable and fully supported.                                 |
| `deprecated` | ≥ 6 months     | Route still works. A `Deprecation` response header is added.         |
| `sunset`     | ≥ 3 months     | Route returns `410 Gone`. Clients must have migrated.               |

### Deprecation Header

When an endpoint enters the `deprecated` stage, the server will add:

```
Deprecation: true
Sunset: Sat, 01 Jan 2027 00:00:00 GMT
Link: </api/v2/events>; rel="successor-version"
```

Clients **should** monitor for the `Deprecation` header and migrate before the `Sunset` date.

---

## Versioning a Breaking Change (Future Guide)

When a breaking change is required for an existing endpoint:

1. Implement the new behavior at `/api/v2/<endpoint>`.
2. Keep the `/api/v1/<endpoint>` (and `/api/<endpoint>`) behavior unchanged.
3. Add a second path-normalization block for `v2` in `events-server.ts`:
   ```typescript
   if (url.pathname.startsWith('/api/v2/')) {
     // Route to v2 handlers
   }
   ```
4. Mark the v1 endpoint as `deprecated` and set a `Sunset` date at least 6 months out.
5. Document the breaking change in `CHANGELOG.md` and this file.

---

## Client Migration Guide

### Before (unversioned)

```bash
curl http://localhost:3000/api/events
```

### After (versioned — recommended for new clients)

```bash
curl http://localhost:3000/api/v1/events
```

Both calls return identical responses. New integrations should use the `/api/v1/` prefix.

---

## Testing

The versioning layer is covered by the existing `events-server.test.ts` suite.
Any test that exercises an `/api/*` route also implicitly validates `/api/v1/*` because
the normalization step is unconditional.

To verify a versioned path explicitly:

```typescript
const res = await fetch('http://localhost:PORT/api/v1/events');
expect(res.headers.get('X-API-Version')).toBe('v1');
const body = await res.json();
expect(body).toHaveProperty('events');
```
