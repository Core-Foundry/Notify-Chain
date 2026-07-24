# API Contract and Event Reference Guide

This guide is the single entry point for integrators that need endpoint contracts,
payload schemas, auth requirements, and emitted contract events.

## Canonical docs map

1. Endpoint contract (paths, request/response schema, errors): [`API.md`](API.md)
2. Workflow cookbook (copy/paste examples): [`API_USAGE_COOKBOOK.md`](API_USAGE_COOKBOOK.md)
3. Notification payload schema details: [`../NOTIFICATION_PAYLOAD_SCHEMA.md`](../NOTIFICATION_PAYLOAD_SCHEMA.md)
4. On-chain event structs (AutoShare): `contract/contracts/hello-world/src/base/events.rs`

## Public API endpoints

| Endpoint | Method | Purpose |
|---|---|---|
| `/api/events` | GET | Return latest indexed contract events |
| `/api/status` | GET | Return listener runtime status |
| `/api/indexing/health` | GET | Return indexing health details |
| `/api/analytics` | GET | Return analytics summaries |
| `/api/webhooks` | POST | Accept signed inbound webhook payloads |
| `/api/schedule` | POST | Create scheduled notification |
| `/api/schedule/stats` | GET | Return scheduler aggregate stats |
| `/api/schedule/:id` | GET | Return scheduled notification by ID |
| `/api/preferences/:userId` | GET/PUT | Read/update user notification preferences |
| `/api/rate-limit/metrics` | GET | Rate limiter metrics endpoint |
| `/api/notifications/history` | GET | Notification delivery history |
| `/api/search/suggestions` | GET | Search suggestion API |
| `/api/templates` | POST | Create notification template |
| `/api/templates/:id` | GET/PUT | Read/update template |
| `/api/templates/:id/audit` | GET | Template audit trail |
| `/api/archive` | GET | Archive listing |
| `/api/archive/:id` | GET | Archive item lookup |
| `/api/archive/run` | POST | Run archive process |
| `/health` | GET | Dependency and readiness health |

## Authentication and authorization

- API clients can be identified by `X-API-Key` or `Authorization: Bearer <token>`.
- `POST /api/webhooks` requires:
  - `X-Key-Id`
  - `X-Signature` (HMAC-SHA256 of the raw request body)
- Every response includes `X-Request-Id` and `X-Correlation-Id` for tracing.

## Event reference (AutoShare contract)

From `contract/contracts/hello-world/src/base/events.rs`:

- `AutoshareCreated`
- `ContractPaused`
- `ContractUnpaused`
- `AutoshareUpdated`
- `GroupDeactivated`
- `GroupActivated`
- `AdminTransferred`
- `Withdrawal`
- `AuthorizationFailure`
- `ScheduledNotificationCancelled`
- `NotificationScheduled`
- `NotificationExpired`
- `NotificationRevoked`
- `NotificationExtended`

Each event carries category and priority topics for filtering/routing.

## Versioning guidelines

- Current API contract version is **v1** (documented in `API.md` and schema docs).
- Backward-compatible additions (new optional fields/endpoints) are treated as minor updates.
- Breaking changes (removing required fields, renaming fields, incompatible response shape changes) require:
  1. major version bump in docs,
  2. changelog entry,
  3. deprecation note before rollout.

## Quick verification commands

```bash
# Health
curl -sS http://localhost:8787/health | jq

# Events
curl -sS 'http://localhost:8787/api/events?limit=5' | jq

# Scheduler stats
curl -sS http://localhost:8787/api/schedule/stats | jq
```
