# API Sequence Diagrams

This document shows how NotifyChain moves notification data between callers,
Soroban contracts, the listener service, delivery targets, and API consumers.
The diagrams use Mermaid `sequenceDiagram` blocks so they render directly in
GitHub Markdown.

## Notification Request Flow

```mermaid
sequenceDiagram
    autonumber
    participant Caller as User or dApp
    participant Contract as Soroban contract
    participant Stellar as Stellar RPC
    participant Subscriber as EventSubscriber
    participant Dedup as EventDeduplicationService
    participant Registry as EventRegistry
    participant Delivery as DiscordNotificationService
    participant Target as Discord or webhook target
    participant API as Events API
    participant Dashboard as Dashboard

    Caller->>Contract: Invoke contract function
    Contract->>Contract: Update on-chain state
    Contract-->>Stellar: Emit typed contract event
    Subscriber->>Stellar: getEvents(contract filter, cursor)
    Stellar-->>Subscriber: Event batch and next cursor
    Subscriber->>Subscriber: Validate payload and event filter
    Subscriber->>Dedup: Check event id and contract address
    Dedup-->>Subscriber: New event
    Subscriber->>Registry: Store normalized display event
    Subscriber->>Delivery: Format and send notification
    Delivery->>Target: POST delivery payload
    Target-->>Delivery: Delivery status
    Subscriber->>Dedup: Record processed event and cursor
    Dashboard->>API: GET /api/events
    API->>Registry: Read recent events
    Registry-->>API: Event feed
    API-->>Dashboard: JSON event list
```

## Event Processing Lifecycle

```mermaid
sequenceDiagram
    autonumber
    participant Timer as Poll timer
    participant Subscriber as EventSubscriber
    participant Stellar as Stellar RPC
    participant Validator as Event utils
    participant Queue as EventProcessingQueue
    participant Dedup as Persistent dedup
    participant Registry as EventRegistry
    participant Prefs as PreferenceStore
    participant Delivery as Delivery service
    participant Retry as NotificationRetryQueue

    Timer->>Subscriber: Start poll cycle
    Subscriber->>Stellar: getEvents() for each configured contract
    Stellar-->>Subscriber: Raw Soroban events
    Subscriber->>Validator: validateEventPayload() and matchesEventFilter()
    Validator-->>Subscriber: Processable events
    Subscriber->>Queue: Enqueue event, if queue is configured
    Queue->>Subscriber: processEvent(event)
    Subscriber->>Dedup: isDuplicate(event.id, contract)
    alt Duplicate or reorg replay
        Dedup-->>Subscriber: Duplicate
        Subscriber->>Dedup: Record skipped duplicate
    else New event
        Dedup-->>Subscriber: Not seen
        Subscriber->>Registry: addFromInput()
        Subscriber->>Prefs: Check channel preferences
        alt Channel enabled
            Subscriber->>Delivery: sendEventNotification()
            alt Delivery succeeds
                Delivery-->>Subscriber: Success
            else Delivery fails
                Delivery-->>Subscriber: Failure
                Subscriber->>Retry: Enqueue for retry
            end
        else Channel disabled
            Prefs-->>Subscriber: Skip outbound delivery
        end
        Subscriber->>Dedup: recordProcessedEvent()
    end
    Subscriber->>Subscriber: Persist latest cursor and finish cycle
```

## Scheduled Notification Lifecycle

```mermaid
sequenceDiagram
    autonumber
    participant Client as API client
    participant Server as events-server.ts
    participant API as NotificationAPI
    participant Repo as ScheduledNotificationRepository
    participant DB as SQLite
    participant Scheduler as NotificationScheduler
    participant Delivery as Delivery service
    participant Target as Discord or webhook target
    participant Dashboard as Dashboard

    Client->>Server: POST /api/schedule
    Server->>API: Validate schedule request
    API->>Repo: create(notification)
    Repo->>DB: Insert PENDING row
    DB-->>Repo: Scheduled id
    Repo-->>API: Scheduled notification
    API-->>Server: Created response
    Server-->>Client: 201 Created

    loop Background tick
        Scheduler->>Repo: fetchAndLockPendingNotifications()
        Repo->>DB: Atomic UPDATE PENDING to PROCESSING
        DB-->>Repo: Locked due rows
        Repo-->>Scheduler: Batch to execute
    end

    Scheduler->>Delivery: Send scheduled payload
    Delivery->>Target: POST notification
    alt Target accepts delivery
        Target-->>Delivery: 2xx
        Delivery-->>Scheduler: Success
        Scheduler->>Repo: markCompleted()
        Repo->>DB: Store execution log and COMPLETED status
    else Target rejects or times out
        Target-->>Delivery: Error
        Delivery-->>Scheduler: Failure
        Scheduler->>Repo: markFailedOrRetry()
        Repo->>DB: Store retry metadata or FAILED status
    end

    Dashboard->>Server: GET /api/schedule/stats
    Server->>Repo: Read scheduler statistics
    Repo->>DB: Aggregate schedule states
    DB-->>Repo: Counts and timestamps
    Server-->>Dashboard: Scheduler status JSON
```

## Reading Guide

- Contract events are defined in
  `contract/contracts/hello-world/src/base/events.rs` and
  `Documents/Task Bounty/src/events.rs`.
- Event ingestion and cursor handling live in
  `listener/src/services/event-subscriber.ts`.
- Persistent duplicate tracking lives in
  `listener/src/services/event-deduplication-service.ts`.
- The public event and scheduler endpoints are implemented in
  `listener/src/api/events-server.ts`.
- Dashboard clients consume the listener through `GET /api/events` and related
  scheduler endpoints.
