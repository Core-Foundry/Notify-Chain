# NotifyChain — API & Notification Sequence Diagrams

> **Issue #354** — Visual reference for contributors who want to understand
> exactly how notifications flow through the system before reading the code.
>
> **Related docs:**
> - [Architecture Overview](ARCHITECTURE_OVERVIEW.md) — layer-by-layer system guide
> - [Notification Failure Recovery](NOTIFICATION_FAILURE_RECOVERY.md) — retry semantics
> - [Scheduled Notifications Delivery](SCHEDULED-NOTIFICATIONS-DELIVERY.md) — delivery guarantees
> - [Listener API Reference](listener/API.md) — endpoint specification
> - [Reorg Deduplication Monitoring](REORG-DEDUPLICATION-MONITORING.md) — duplicate-detection ops

---

## Table of Contents

1. [Diagram 1 — Notification Request Flow](#diagram-1--notification-request-flow)
2. [Diagram 2 — Event Processing Lifecycle](#diagram-2--event-processing-lifecycle)
3. [Diagram 3 — Scheduled Notification Delivery](#diagram-3--scheduled-notification-delivery)
4. [Diagram 4 — Retry & Failure Recovery](#diagram-4--retry--failure-recovery)
5. [Diagram 5 — Dashboard Data Fetch](#diagram-5--dashboard-data-fetch)
6. [Actor Reference](#actor-reference)

---

## Diagram 1 — Notification Request Flow

**What this shows:** How an external client (a frontend app, CI job, or
script) submits a notification payload to the Listener Service, how the
backend validates it, and how it eventually reaches the subscriber.

The flow divides into two sub-paths depending on whether the notification
is *immediate* (sent right now) or *scheduled* (delivered at a future
`executeAt` timestamp).

```mermaid
sequenceDiagram
    autonumber

    participant Client as Client<br/>(Frontend / API caller)
    participant API as Listener API<br/>(events-server.ts)
    participant Validator as Payload Validator<br/>(notification-api.ts)
    participant DB as SQLite Database<br/>(scheduled_notifications)
    participant Scheduler as Background Scheduler<br/>(notification-scheduler.ts)
    participant Discord as Discord Webhook<br/>/ HTTP Target
    participant Subscriber as Subscriber<br/>(End-user / Webhook)

    Note over Client,Subscriber: ── Immediate Notification (webhook trigger) ──

    Client->>API: POST /api/webhooks<br/>{ event, data }<br/>+ X-Webhook-Signature header

    API->>API: Extract key-id & signature headers
    API->>API: Look up secret for key-id
    API->>API: HMAC-SHA256 verify signature

    alt Signature invalid or missing
        API-->>Client: 401 Unauthorized<br/>{ "error": "Invalid signature" }
    else Signature verified
        API-->>Client: 202 Accepted<br/>{ "status": "accepted" }
        Note over API: Webhook payload is now<br/>accepted for processing
    end

    Note over Client,Subscriber: ── Scheduled Notification ──

    Client->>API: POST /api/schedule<br/>{ executeAt, payload, targetRecipient,<br/>  notificationType, maxRetries, priority }

    API->>Validator: scheduleNotification(input)
    Validator->>Validator: Validate executeAt is a future Date
    Validator->>Validator: Validate payload is an object
    Validator->>Validator: Validate targetRecipient is present
    Validator->>Validator: Check payload size ≤ MAX_PAYLOAD_SIZE_BYTES (64 KB)

    alt Validation failure
        Validator-->>API: throw Error (invalid input)
        API-->>Client: 400 Bad Request<br/>{ "error": "..." }
    else Payload too large
        Validator-->>API: throw PayloadTooLargeError
        API-->>Client: 413 Payload Too Large<br/>{ "error": "Notification payload is too large: ..." }
    else Scheduler disabled
        API-->>Client: 503 Service Unavailable<br/>{ "error": "Scheduler not enabled" }
    else Validation passed
        Validator->>DB: INSERT scheduled_notifications<br/>(status=PENDING, executeAt, payload, …)
        DB-->>Validator: notification id
        Validator-->>API: notification id
        API-->>Client: 201 Created<br/>{ "id": 42 }
    end

    Note over Scheduler,Subscriber: ── Background scheduler tick (every 10 s) ──

    loop Every pollIntervalMs (default 10 s)
        Scheduler->>DB: SELECT WHERE status=PENDING<br/>AND execute_at ≤ NOW()<br/>AND (next_retry_at IS NULL OR ≤ NOW())
        DB-->>Scheduler: batch of due notifications

        loop For each due notification
            Scheduler->>DB: UPDATE status=PROCESSING<br/>WHERE id=? AND status=PENDING<br/>(atomic distributed lock)
            alt Row already locked by another worker
                DB-->>Scheduler: changedRows = 0 → skip
            else Lock acquired
                Scheduler->>Discord: POST webhook payload<br/>to targetRecipient URL
                Discord-->>Scheduler: 200 OK / error

                alt Delivery success
                    Scheduler->>DB: UPDATE status=COMPLETED
                    Discord-->>Subscriber: Notification delivered
                else Delivery failed, retries remain
                    Scheduler->>DB: UPDATE status=PENDING<br/>retry_count++, next_retry_at = NOW() + backoff
                else Max retries exhausted
                    Scheduler->>DB: UPDATE status=FAILED<br/>last_error = error message
                end
            end
        end
    end
```

### Key points

- **Webhook verification** uses HMAC-SHA256 with pre-shared secrets
  configured via `WEBHOOK_SECRETS`. If no secrets are configured every
  webhook call returns `401`.
- **Payload size** is validated before any database write.  The default
  ceiling is **64 KB** (configurable via `MAX_PAYLOAD_SIZE_BYTES`).
- **Distributed lock** prevents two scheduler workers from processing the
  same notification simultaneously. The `WHERE status = 'PENDING'`
  predicate is the atomicity boundary.
- **Exponential backoff** doubles the retry delay at each attempt.
  `RETRY_BASE_DELAY_MS` (default 5 s) × `RETRY_MULTIPLIER` (default 2)
  up to `RETRY_MAX_DELAY_MS` (default 1 h).

---

## Diagram 2 — Event Processing Lifecycle

**What this shows:** The on-chain → off-chain path: how a contract state
change on the Stellar network becomes a notification delivered to a
subscriber and an entry visible in the dashboard.

```mermaid
sequenceDiagram
    autonumber

    participant User as User / dApp
    participant Contract as Soroban Smart Contract<br/>(TaskBounty / AutoShare)
    participant Stellar as Stellar Network<br/>(RPC Node)
    participant Subscriber as EventSubscriber<br/>(event-subscriber.ts)
    participant PersistDedup as Persistent Deduplicator<br/>(event-deduplication-service.ts)
    participant MemDedup as In-Memory Deduplicator<br/>(notification-deduplicator.ts)
    participant Registry as Event Registry<br/>(event-registry.ts)
    participant Discord as DiscordNotificationService<br/>(discord-notification.ts)
    participant RetryQ as Retry Queue<br/>(notification-retry-queue.ts)
    participant Dashboard as Dashboard<br/>(React + Vite)
    participant Subscriber2 as Subscriber<br/>(Discord / Webhook)

    Note over User,Stellar: ── On-chain action ──

    User->>Contract: invoke contract function<br/>(e.g. create_task(), create())
    Contract->>Contract: Validate input & auth
    Contract->>Contract: Mutate persistent storage
    Contract->>Stellar: emit typed Soroban event<br/>topics: [eventName, category, priority]<br/>data: { id, creator, … }
    Stellar-->>User: transaction result

    Note over Subscriber,Registry: ── Off-chain polling loop (every 30 s default) ──

    loop Every pollIntervalMs
        Subscriber->>Stellar: getEvents({ contractIds, cursor, limit:100 })
        Stellar-->>Subscriber: EventResponse[]<br/>{ id, ledger, topic, value, txHash }

        Subscriber->>Subscriber: Detect potential reorg<br/>(compare event ledger with last cursor)

        alt Reorg detected (new ledger < last ledger)
            Subscriber->>PersistDedup: detectReorg(contractAddress, ledger)
            PersistDedup->>PersistDedup: Compare with polling_cursors table
            PersistDedup-->>Subscriber: reorgDetected = true → log warning
        end

        loop For each received event
            Subscriber->>Subscriber: validateEventPayload(event)<br/>matchesEventFilter(eventName, config.events)

            alt Event filtered out or invalid
                Subscriber->>Subscriber: skip (log warning)
            else Event passes filter

                Note over Subscriber,PersistDedup: ── Layer 1: Persistent deduplication ──

                Subscriber->>PersistDedup: isDuplicate(eventId, contractAddress)
                PersistDedup->>PersistDedup: SELECT FROM processed_events<br/>WHERE fingerprint = contract:eventId

                alt Already in processed_events
                    PersistDedup-->>Subscriber: { isDuplicate: true, isReorgDuplicate: bool }
                    Subscriber->>PersistDedup: recordProcessedEvent(…, status=SKIPPED)
                    Subscriber->>Subscriber: skip — notification already sent
                else New event
                    PersistDedup-->>Subscriber: { isDuplicate: false }

                    Note over Subscriber,MemDedup: ── Layer 2: In-memory deduplication ──

                    Subscriber->>MemDedup: isDuplicate(fingerprint)<br/>(60-second LRU window)

                    alt Seen within last 60 s
                        MemDedup-->>Subscriber: duplicate → skip
                    else Not in cache
                        MemDedup->>MemDedup: Mark fingerprint as seen

                        Subscriber->>Registry: addFromInput(event)<br/>→ normalize & store DisplayEvent
                        Registry-->>Subscriber: DisplayEvent

                        alt Discord configured & category enabled
                            Subscriber->>Discord: sendEventNotification(event, contractConfig)
                            Discord->>Discord: generateFingerprint(eventId, address)
                            Discord->>Discord: Build embed message
                            Discord->>Subscriber2: POST https://discord.com/api/webhooks/…
                            Subscriber2-->>Discord: 200 OK / HTTP error

                            alt Discord delivery success
                                Discord-->>Subscriber: true (notificationSent)
                                Subscriber->>PersistDedup: recordProcessedEvent(…, notificationSent=true, PROCESSED)
                            else Discord delivery failed
                                Discord-->>Subscriber: false
                                Subscriber->>RetryQ: enqueue(event, contractConfig)
                                Subscriber->>PersistDedup: recordProcessedEvent(…, notificationSent=false, ERROR)
                            end
                        else Discord not configured
                            Subscriber->>PersistDedup: recordProcessedEvent(…, notificationSent=false, PROCESSED)
                        end
                    end
                end
            end
        end

        Subscriber->>Stellar: persist cursor (last ledger seen)
        Subscriber->>PersistDedup: updatePollingCursor(address, cursor, ledger)
    end

    Note over Dashboard,Subscriber2: ── Dashboard rendering ──

    Dashboard->>+Registry: GET /api/events[?limit=N]
    Registry-->>-Dashboard: { count, events: DisplayEvent[] }
    Dashboard->>Dashboard: Render event list & cards
```

### Key points

- **Two deduplication layers** work in series. The persistent layer
  (`EventDeduplicationService` + SQLite `processed_events` table) catches
  duplicates across restarts and blockchain reorgs. The in-memory layer
  (`NotificationDeduplicator` LRU cache) catches rapid duplicates cheaply
  without a database round-trip.
- **Reorg detection** compares the incoming event's ledger number against
  the last-known cursor stored in `polling_cursors`. A decreasing ledger
  signals a reorganization.
- **Event Registry** is the in-memory store exposed by `GET /api/events`.
  The dashboard polls it; it is NOT the source of truth — SQLite is.
- **Analytics** are recorded by `NotificationAnalyticsAggregator` for
  every outcome (success, failure, skipped, retry), viewable at
  `GET /api/analytics`.

---

## Diagram 3 — Scheduled Notification Delivery

**What this shows:** The lifecycle of a notification from its creation via
`POST /api/schedule` through to delivery and terminal state, including the
distributed-lock handshake that makes multi-instance deployments safe.

```mermaid
sequenceDiagram
    autonumber

    participant Caller as API Caller
    participant API as Listener API
    participant NotifAPI as NotificationAPI<br/>(notification-api.ts)
    participant DB as SQLite<br/>(scheduled_notifications)
    participant Scheduler as NotificationScheduler<br/>(background tick)
    participant Discord as Discord<br/>/ HTTP Webhook

    Caller->>API: POST /api/schedule<br/>{ executeAt: "2026-07-24T10:00:00Z",<br/>  payload: { message: "…" },<br/>  targetRecipient: "https://discord.com/…",<br/>  notificationType: "discord",<br/>  maxRetries: 3, priority: 5 }

    API->>NotifAPI: scheduleNotification(input)
    NotifAPI->>NotifAPI: validate executeAt (future date)
    NotifAPI->>NotifAPI: validate payload (object, ≤64 KB)
    NotifAPI->>NotifAPI: validate targetRecipient (non-empty)
    NotifAPI->>DB: INSERT scheduled_notifications<br/>status=PENDING, retry_count=0

    DB-->>NotifAPI: id = 42
    NotifAPI-->>API: 42
    API-->>Caller: 201 { "id": 42 }

    Note over DB: Row sits PENDING<br/>until executeAt ≤ NOW()

    loop Scheduler tick (every 10 s)
        Scheduler->>DB: SELECT id WHERE status=PENDING<br/>AND execute_at ≤ NOW()<br/>AND (next_retry_at IS NULL OR ≤ NOW())<br/>LIMIT batchSize

        alt No due notifications
            DB-->>Scheduler: []
        else Due notifications found
            DB-->>Scheduler: [{ id:42, payload, targetRecipient, … }]

            Scheduler->>DB: UPDATE status=PROCESSING<br/>processor_id=worker-1<br/>lock_expires_at=NOW()+60s<br/>WHERE id=42 AND status=PENDING

            alt Lock already held (another worker)
                DB-->>Scheduler: changedRows=0 → skip row
            else Lock acquired
                DB-->>Scheduler: changedRows=1

                Scheduler->>Discord: POST targetRecipient<br/>JSON payload

                alt HTTP 2xx — success
                    Discord-->>Scheduler: 200 OK
                    Scheduler->>DB: UPDATE status=COMPLETED<br/>processing_completed_at=NOW()
                else HTTP error — retries remain
                    Discord-->>Scheduler: 4xx / 5xx / timeout
                    Scheduler->>DB: UPDATE status=PENDING<br/>retry_count++<br/>next_retry_at=NOW() + backoff<br/>last_error="HTTP 500"
                    Note over DB: Row re-enters PENDING pool<br/>with a future next_retry_at
                else Max retries exhausted
                    Discord-->>Scheduler: error
                    Scheduler->>DB: UPDATE status=FAILED<br/>last_error="Max retries exceeded"
                end
            end
        end
    end

    Note over Caller,DB: ── Query status at any time ──

    Caller->>API: GET /api/schedule/42
    API->>DB: SELECT * WHERE id=42
    DB-->>API: { id:42, status:"COMPLETED", … }
    API-->>Caller: 200 { notification object }
```

### Notification states

| State | Meaning |
|-------|---------|
| `PENDING` | Waiting for `executeAt` to arrive (or `next_retry_at` to clear). |
| `PROCESSING` | Locked by a worker; delivery in progress. Lock expires after 60 s. |
| `COMPLETED` | Delivered successfully. |
| `FAILED` | Max retries exhausted or unrecoverable error. |
| `CANCELLED` | Explicitly cancelled via API before delivery. |

---

## Diagram 4 — Retry & Failure Recovery

**What this shows:** What happens when a Discord notification fails — both
the in-process `NotificationRetryQueue` path (for real-time event
notifications) and the persistent scheduler retry path (for scheduled
notifications).

```mermaid
sequenceDiagram
    autonumber

    participant Subscriber as EventSubscriber
    participant Discord as DiscordNotificationService
    participant RetryQ as NotificationRetryQueue<br/>(in-memory, 5 retries)
    participant Scheduler as NotificationScheduler<br/>(DB-backed, configurable)
    participant DB as SQLite

    Note over Subscriber,RetryQ: ── Path A: Real-time event notification retry ──

    Subscriber->>Discord: sendEventNotification(event, contractConfig)
    Discord->>Discord: POST to webhook URL
    Discord-->>Subscriber: false (delivery failed)

    Subscriber->>RetryQ: enqueue(event, contractConfig, requestId)
    RetryQ->>RetryQ: Store { event, retryCount=0,<br/>nextRetryAt=NOW()+baseDelay }

    loop RetryQueue tick (every 5 s)
        RetryQ->>RetryQ: Filter items where nextRetryAt ≤ NOW()

        alt Item due for retry
            RetryQ->>Discord: sendEventNotification(event, contractConfig)

            alt Success
                Discord-->>RetryQ: true
                RetryQ->>RetryQ: Remove from queue
                Note over RetryQ: Analytics: outcome=success
            else Failed, retries < maxRetries (default 5)
                Discord-->>RetryQ: false
                RetryQ->>RetryQ: retryCount++<br/>nextRetryAt = NOW() + baseDelay × 2^retryCount
                Note over RetryQ: Exponential backoff<br/>5s → 10s → 20s → 40s → 80s
            else Failed, maxRetries exhausted
                Discord-->>RetryQ: false
                RetryQ->>RetryQ: Remove from queue (permanently dropped)
                Note over RetryQ: Analytics: outcome=failure<br/>Log: "Max retries exceeded"
            end
        end
    end

    Note over Scheduler,DB: ── Path B: Scheduled notification retry (DB-backed) ──

    Scheduler->>DB: SELECT PENDING due rows
    Scheduler->>DB: Lock row (status=PROCESSING)
    Scheduler->>Discord: POST webhook
    Discord-->>Scheduler: HTTP error

    alt retry_count < max_retries
        Scheduler->>DB: status=PENDING<br/>retry_count = retry_count + 1<br/>next_retry_at = NOW() + baseDelayMs × multiplier^retry_count<br/>last_error = errorMessage
        Note over DB: Survives service restart<br/>(persisted in SQLite)
    else retry_count ≥ max_retries
        Scheduler->>DB: status=FAILED<br/>last_error = "Max retries exceeded"
    end

    Note over Scheduler,DB: ── Stale lock recovery ──

    Scheduler->>DB: SELECT WHERE status=PROCESSING<br/>AND lock_expires_at < NOW()
    DB-->>Scheduler: Stale locked row (worker crashed mid-delivery)
    Scheduler->>DB: UPDATE status=PENDING<br/>processor_id=NULL, lock_expires_at=NULL<br/>retry_count++
    Note over DB: Row re-enters retry pool<br/>(at-least-once delivery guarantee)
```

### Key points

- **Two independent retry systems** exist. `NotificationRetryQueue` handles
  real-time event notifications in memory (no persistence across restarts).
  `NotificationScheduler` handles scheduled notifications with full
  SQLite persistence and distributed locking.
- **Stale lock recovery** runs each scheduler tick. A lock is stale if
  `lock_expires_at < NOW()` and status is still `PROCESSING`. This
  catches crashes mid-delivery and re-queues the row.
- **At-least-once guarantee**: the DB write completes before the delivery
  attempt is considered definitive. If the process crashes after delivery
  but before marking COMPLETED, the row will be retried — the subscriber
  must be idempotent.

---

## Diagram 5 — Dashboard Data Fetch

**What this shows:** How the React dashboard reads data from the Listener
API, including the events feed, analytics, and scheduler stats.

```mermaid
sequenceDiagram
    autonumber

    participant User as Human Operator
    participant Dashboard as Dashboard<br/>(React + Vite)
    participant EventsStore as Zustand Event Store<br/>(eventStore.ts)
    participant API as Listener API<br/>(:8787)
    participant Registry as Event Registry<br/>(in-memory)
    participant DB as SQLite

    User->>Dashboard: Open dashboard in browser

    Note over Dashboard,Registry: ── Initial load ──

    Dashboard->>EventsStore: fetchEvents()
    EventsStore->>API: GET /api/events?limit=100
    API->>Registry: getEvents(100)
    Registry-->>API: DisplayEvent[]
    API-->>EventsStore: 200 { count, events }
    EventsStore->>EventsStore: Update Zustand store
    EventsStore-->>Dashboard: Re-render event list

    Note over Dashboard,DB: ── Health check ──

    Dashboard->>API: GET /health
    API->>API: checkStellarRpc(rpcUrl)<br/>checkDiscord(webhookUrl)
    API-->>Dashboard: 200 { status: "ok"|"degraded"|"error",<br/>services: { stellarRpc, discord, eventRegistry } }

    Note over Dashboard,DB: ── Analytics snapshot ──

    Dashboard->>API: GET /api/analytics
    API-->>Dashboard: 200 { totalRecorded, byType, byContract,<br/>hourlyBuckets, errorBreakdown }

    Note over Dashboard,DB: ── Scheduler stats ──

    Dashboard->>API: GET /api/schedule/stats
    API->>DB: SELECT COUNT(*) GROUP BY status
    DB-->>API: { pending, processing, completed, failed, cancelled }
    API-->>Dashboard: 200 { pending: 3, completed: 142, … }

    Note over Dashboard,Registry: ── Periodic refresh (poll) ──

    loop Every N seconds (client-side interval)
        Dashboard->>API: GET /api/events?limit=100
        API->>Registry: getEvents(100)
        Registry-->>API: updated DisplayEvent[]
        API-->>Dashboard: 200 { count, events }
        Dashboard->>Dashboard: Diff and update store → re-render new events
    end

    Note over User,Dashboard: ── Search & filter ──

    User->>Dashboard: Type in search bar / apply filters
    Dashboard->>EventsStore: applyFilters(query, contractAddress, eventType)
    EventsStore->>EventsStore: Filter in-memory store<br/>(client-side, no extra API call)
    EventsStore-->>Dashboard: Filtered DisplayEvent[]
    Dashboard->>Dashboard: Re-render filtered list
```

### Key points

- The dashboard is **strictly read-only**. It never writes to the Listener
  API or to any contract.
- All **search and filtering** happens client-side over the already-fetched
  event array; no extra API calls are needed per keystroke.
- The **health endpoint** (`GET /health`) aggregates Stellar RPC reachability
  and Discord webhook status. It returns `503` if the Stellar RPC is
  unreachable.
- **Rate limiting** is enforced by the Listener API (default 60 req/min per
  client). Dashboard polling intervals should respect this budget.

---

## Actor Reference

| Actor | Code location | Description |
|-------|---------------|-------------|
| **Client** | Any HTTP caller | Frontend, CI job, or script calling the Listener REST API |
| **Listener API** | `listener/src/api/events-server.ts` | Node.js HTTP server handling all REST endpoints |
| **Payload Validator** | `listener/src/services/notification-api.ts`, `listener/src/utils/payload-size-validator.ts` | Validates `executeAt`, `payload`, `targetRecipient`, and payload byte size |
| **SQLite Database** | `listener/src/database/` | Persists scheduled notifications, processed events, templates, rate-limit events |
| **EventSubscriber** | `listener/src/services/event-subscriber.ts` | Polls Stellar RPC for contract events on a configurable interval |
| **Persistent Deduplicator** | `listener/src/services/event-deduplication-service.ts` | Checks `processed_events` table; detects blockchain reorgs |
| **In-Memory Deduplicator** | `listener/src/services/notification-deduplicator.ts` | LRU cache (60 s window) for rapid duplicate suppression |
| **Event Registry** | `listener/src/store/event-registry.ts` | In-memory ring buffer of recent `DisplayEvent` objects; source for `GET /api/events` |
| **DiscordNotificationService** | `listener/src/services/discord-notification.ts` | Formats events as Discord embeds and POSTs to the webhook URL |
| **NotificationRetryQueue** | `listener/src/services/notification-retry-queue.ts` | In-memory retry queue for failed real-time event notifications |
| **NotificationScheduler** | `listener/src/services/notification-scheduler.ts` | Background tick that processes due `scheduled_notifications` rows |
| **Soroban Contract** | `contract/contracts/hello-world/`, `Documents/Task Bounty/` | On-chain Rust/Soroban contracts that emit typed events |
| **Stellar Network** | External | Stellar RPC node returning event streams via `getEvents()` |
| **Dashboard** | `dashboard/src/` | React + Vite SPA; read-only consumer of the Listener API |
| **Subscriber** | External | Discord channel, webhook target, or any HTTP endpoint receiving notifications |

---

*Diagrams reflect the codebase as of 2026-07-23. Maintained as part of issue #354.*
