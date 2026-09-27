# NotifyChain — System Architecture Diagram

> Visual reference for NotifyChain's core components and data flow.
> Covers both on-chain (Stellar / Soroban) and off-chain (Listener, Dashboard) layers.
>
> **Related docs**: [`SYSTEM_ARCHITECTURE.md`](SYSTEM_ARCHITECTURE.md) for narrative descriptions,
> [`ARCHITECTURE_OVERVIEW.md`](ARCHITECTURE_OVERVIEW.md) for contributor walkthrough.

---

## 1. Full System Overview

```
╔══════════════════════════════════════════════════════════════════════════════════╗
║                              NOTIFYCHAIN SYSTEM                                  ║
╠══════════════════════════════════════════════════════════════════════════════════╣
║                                                                                  ║
║  ┌──────────────────────────────────────────────────────────────────────────┐   ║
║  │                      ① ON-CHAIN LAYER  (Stellar Network)                │   ║
║  │                                                                          │   ║
║  │  ┌──────────────┐   invoke    ┌────────────────────────────────────────┐ │   ║
║  │  │  Users/dApps │ ──────────▶ │       AutoShareContract (Soroban/WASM) │ │   ║
║  │  └──────────────┘             │                                        │ │   ║
║  │                               │  Admin:  initialize_admin, pause,      │ │   ║
║  │  ┌──────────────┐             │          set_schema_version, withdraw  │ │   ║
║  │  │  Stellar     │             │  Groups: create, update_members,       │ │   ║
║  │  │  Wallet Kit  │             │          activate/deactivate_group     │ │   ║
║  │  └──────┬───────┘             │  Notif:  schedule_notification,        │ │   ║
║  │         │ sign tx             │          cancel, revoke, acknowledge   │ │   ║
║  │         └───────────────────▶ │          expire, extend, recall        │ │   ║
║  │                               │  Prefs:  set_preferences,              │ │   ║
║  │                               │          set_channel_preference        │ │   ║
║  │                               │  Rep:    record_delivery_success/fail  │ │   ║
║  │                               │                                        │ │   ║
║  │                               │  Storage (persistent on-chain):        │ │   ║
║  │                               │  • AutoShareDetails   • AuditRecord    │ │   ║
║  │                               │  • ScheduledNotification               │ │   ║
║  │                               │  • RecipientPreferences                │ │   ║
║  │                               │  • SenderReputation                    │ │   ║
║  │                               │  • NotificationLimits                  │ │   ║
║  │                               └──────────────┬─────────────────────────┘ │   ║
║  │                                              │ emit 25+ typed             │   ║
║  │                                              │ Soroban events             │   ║
║  └──────────────────────────────────────────────┼─────────────────────────────┘   ║
║                                                 │                                 ║
║                                                 ▼ (ledger stream)                 ║
║  ┌──────────────────────────────────────────────────────────────────────────┐   ║
║  │                    ② OFF-CHAIN LAYER  (Listener Service — Node.js)      │   ║
║  │                                                                          │   ║
║  │  ┌──────────────────────────────────────────────────────────────┐        │   ║
║  │  │  EventSubscriber  (polls RPC every 30 s, default)            │        │   ║
║  │  │  • getEvents() via Stellar RPC                               │        │   ║
║  │  │  • Tracks ledger cursor in SQLite polling_cursors            │        │   ║
║  │  │  • Detects chain reorgs (new_ledger < last_ledger → reorg)  │        │   ║
║  │  └──────────────────────────┬───────────────────────────────────┘        │   ║
║  │                             │ raw events                                  │   ║
║  │                             ▼                                             │   ║
║  │  ┌──────────────────────────────────────────────────────────────┐        │   ║
║  │  │  Deduplication (two-layer)                                   │        │   ║
║  │  │                                                              │        │   ║
║  │  │  Layer 1 — EventDeduplicationService (persistent SQLite)     │        │   ║
║  │  │    • Table: processed_events  (fingerprint UNIQUE)           │        │   ║
║  │  │    • Table: polling_cursors   (per-contract cursor)          │        │   ║
║  │  │    • Marks is_reorg_duplicate; survives restarts             │        │   ║
║  │  │                                                              │        │   ║
║  │  │  Layer 2 — NotificationDeduplicator (in-memory LRU)         │        │   ║
║  │  │    • 10,000 entries / 60 s window                            │        │   ║
║  │  │    • Fast-path cache, short-term duplicates only             │        │   ║
║  │  └──────────────────────────┬───────────────────────────────────┘        │   ║
║  │                             │ deduplicated events                         │   ║
║  │             ┌───────────────┴──────────────────────────┐                 │   ║
║  │             │                                          │                 │   ║
║  │             ▼                                          ▼                 │   ║
║  │  ┌────────────────────────────┐      ┌───────────────────────────────┐   │   ║
║  │  │  SQLite Event Store        │      │  Notification Dispatcher      │   │   ║
║  │  │  (events table)            │      │                               │   │   ║
║  │  │  • event_id, contract_id   │      │  ┌───────────────────────┐   │   │   ║
║  │  │  • event_type, data JSON   │      │  │ Discord               │   │   │   ║
║  │  │  • ledger_sequence         │      │  │  Webhook POST + embed │   │   │   ║
║  │  │  • category, priority      │      │  └───────────────────────┘   │   │   ║
║  │  │  • 24 h TTL (configurable) │      │  ┌───────────────────────┐   │   │   ║
║  │  └────────────────────────────┘      │  │ HTTP Webhook Target   │   │   │   ║
║  │             │                        │  │  HMAC-signed POST     │   │   │   ║
║  │             │                        │  └───────────────────────┘   │   │   ║
║  │             ▼                        │  ┌───────────────────────┐   │   │   ║
║  │  ┌────────────────────────────┐      │  │ Email (optional)      │   │   │   ║
║  │  │  Notification Scheduler    │      │  └───────────────────────┘   │   │   ║
║  │  │  (background, 10 s tick)   │      └───────────────────────────────┘   │   ║
║  │  │                            │                                           │   ║
║  │  │  scheduled_notifications   │                                           │   ║
║  │  │  PENDING → PROCESSING →    │                                           │   ║
║  │  │  COMPLETED | FAILED        │                                           │   ║
║  │  │                            │                                           │   ║
║  │  │  Atomic SQL lock:          │                                           │   ║
║  │  │  UPDATE SET status=        │                                           │   ║
║  │  │  'PROCESSING'              │                                           │   ║
║  │  │  WHERE status='PENDING'    │                                           │   ║
║  │  └────────────────────────────┘                                           │   ║
║  │                                                                          │   ║
║  │  Supporting Services                                                     │   ║
║  │  • RetryScheduler — exponential backoff (5s → 2× → 1 h max)            │   ║
║  │  • CleanupService — periodic TTL enforcement on events + notifications   │   ║
║  │  • ArchiveService — moves old notifications to archive table             │   ║
║  │  • ReconciliationEngine — gap detection + re-index from RPC              │   ║
║  │  • TemplateService — template CRUD, versioning, audit trail              │   ║
║  │  • MetricsRunner — analytics snapshots (hourly buckets to SQLite)        │   ║
║  │  • HealthMonitor — service-level health tracking                         │   ║
║  │                                                                          │   ║
║  │  REST API  (port 8787, default)                                          │   ║
║  │  ┌──────────────────────────────────────────────────────────────┐        │   ║
║  │  │  GET  /health               GET  /api/events                 │        │   ║
║  │  │  GET  /api/events/:id       POST /api/schedule               │        │   ║
║  │  │  GET  /api/schedule/:id     GET  /api/schedule/execution-    │        │   ║
║  │  │         metrics             GET  /api/notifications/:id      │        │   ║
║  │  │  CRUD /api/templates/*      GET  /api/archive/*              │        │   ║
║  │  │  GET  /api/stats            GET  /api/analytics              │        │   ║
║  │  │  Rate-Limiter (sliding window, per-client configurable)      │        │   ║
║  │  └──────────────────────────────────────────────────────────────┘        │   ║
║  └──────────────────────────────────────────────┬───────────────────────────┘   ║
║                                                 │ HTTP GET (polling)             ║
║                                                 ▼                                ║
║  ┌──────────────────────────────────────────────────────────────────────────┐   ║
║  │                    ③ PRESENTATION LAYER  (Read-only Consumers)          │   ║
║  │                                                                          │   ║
║  │  ┌──────────────────────────────┐  ┌──────────────────────────────────┐  │   ║
║  │  │  React Dashboard             │  │  Next.js Frontend                │  │   ║
║  │  │  (Vite 6 + Zustand 5)        │  │  (Chart.js + Tailwind)           │  │   ║
║  │  │                              │  │                                  │  │   ║
║  │  │  • EventsPage                │  │  • Analytics charts              │  │   ║
║  │  │  • EventExplorer             │  │  • Historical stats              │  │   ║
║  │  │  • NotificationSearch        │  │  • Delivery metrics              │  │   ║
║  │  │  • NotificationPreferences   │  │                                  │  │   ║
║  │  │  • TemplatesPage             │  └──────────────────────────────────┘  │   ║
║  │  │  • WebhookDashboard          │                                         │   ║
║  │  │  • ExportHistory             │  Stellar Wallets Kit (wallet connect)   │   ║
║  │  └──────────────────────────────┘  (dashboard only, wallet signing)      │   ║
║  │                                                                          │   ║
║  │  NOTE: Neither UI ever writes to the Listener store or the contract.    │   ║
║  │        All mutations go via the contract (wallet → Stellar) or the      │   ║
║  │        Listener API (POST /api/schedule, POST /api/templates).           │   ║
║  └──────────────────────────────────────────────────────────────────────────┘   ║
╚══════════════════════════════════════════════════════════════════════════════════╝
```

---

## 2. On-Chain Component Detail

```
AutoShareContract (Soroban WASM — contract/contracts/hello-world/)
┌─────────────────────────────────────────────────────────────────────┐
│  lib.rs — Contract entry point (#[contract] / #[contractimpl])      │
│                                                                     │
│  Public methods grouped by domain:                                  │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │ Admin            │ Group Mgmt       │ Notification Mgmt      │   │
│  │ initialize_admin │ create           │ schedule_notification  │   │
│  │ pause / unpause  │ update_members   │ cancel_notification    │   │
│  │ transfer_admin   │ add_group_member │ revoke_notification    │   │
│  │ withdraw         │ activate/deactiv │ expire_notification    │   │
│  │ register_category│ get / get_all    │ confirm_delivery       │   │
│  │ set_schema_vers. │ is_group_active  │ recall_notification    │   │
│  │                  │ get_members      │ acknowledge_notific.   │   │
│  │                  │ reduce_usage     │ extend_expiry          │   │
│  │                  │ topup_subscript. │ batch_schedule_notifs  │   │
│  ├──────────────────┴──────────────────┴────────────────────────┤   │
│  │ Preference Mgmt        │ Reputation Mgmt                      │   │
│  │ get/set_preferences    │ record_delivery_success/failure      │   │
│  │ set_channel_preference │ get_sender_reputation_score          │   │
│  │ set_category_preference│ get_sender_reputation_tier           │   │
│  │ reset_preferences      │                                      │   │
│  ├────────────────────────┴──────────────────────────────────────┤   │
│  │ Audit & Access Logging                                        │   │
│  │ get_audit_log   record_delivery_attempt   record_acknowledgm. │   │
│  │ record_notification_access                                    │   │
│  └───────────────────────────────────────────────────────────────┘   │
│                                                                     │
│  Base modules:                                                      │
│  ┌──────────────┐ ┌──────────────┐ ┌───────────────────────────┐   │
│  │ base/        │ │ base/        │ │ base/                     │   │
│  │ types.rs     │ │ events.rs    │ │ errors.rs                 │   │
│  │              │ │              │ │                           │   │
│  │ AutoShare-   │ │ 25+ Soroban  │ │ 30 error variants         │   │
│  │ Details      │ │ event types  │ │ (InvalidInput, Unauth,    │   │
│  │ ScheduledNo- │ │              │ │  NotFound, Paused, …)     │   │
│  │ tification   │ │ Category:    │ │                           │   │
│  │ GroupMember  │ │ Group|Admin  │ │                           │   │
│  │ AuditRecord  │ │ Financial|   │ │                           │   │
│  │ NotifLimits  │ │ Notification │ │                           │   │
│  │ PaymentHist. │ │              │ │                           │   │
│  │              │ │ Priority:    │ │                           │   │
│  │              │ │ Low|Med|High │ │                           │   │
│  │              │ │ |Critical    │ │                           │   │
│  └──────────────┘ └──────────────┘ └───────────────────────────┘   │
│  ┌─────────────────────────┐  ┌──────────────────────────────┐      │
│  │ base/preferences.rs     │  │ base/reputation.rs           │      │
│  │ DeliveryChannel         │  │ SenderReputation             │      │
│  │  (Wallet|Email|InApp)   │  │ ReputationTier               │      │
│  │ RecipientPreferences    │  │  (Unverified 0–20            │      │
│  │ CategoryPreference      │  │   Bronze 21–60               │      │
│  │                         │  │   Silver 61–80               │      │
│  │                         │  │   Gold 81–95                 │      │
│  │                         │  │   Platinum 96–100)           │      │
│  └─────────────────────────┘  └──────────────────────────────┘      │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 3. Off-Chain Listener Service — Internal Pipeline

```
Stellar RPC  (https://soroban-testnet.stellar.org)
      │  getEvents() — JSON-RPC over HTTPS
      │  poll every POLL_INTERVAL_MS (default 30,000 ms)
      ▼
┌─────────────────────────────────────────────────────────────────────┐
│  EventSubscriber  (listener/src/services/event-subscriber.ts)       │
│  ┌───────────────────────────────────────────────────────────────┐  │
│  │ 1. Parse CONTRACT_ADDRESSES config (JSON array)               │  │
│  │ 2. For each contract: call getEvents(cursor)                  │  │
│  │ 3. Validate event payload schema                              │  │
│  │ 4. Apply event-type filter (events[] per contract config)     │  │
│  │ 5. Detect reorg: event.ledger < polling_cursors.ledger?       │  │
│  │    YES → increment reorg_detection_count, mark duplicate      │  │
│  │    NO  → pass to dedup pipeline                               │  │
│  │ 6. Update polling_cursors on success                          │  │
│  └───────────────────────────────────────────────────────────────┘  │
└──────────────────────────────────┬──────────────────────────────────┘
                                   │ raw SorobanEvent[]
                                   ▼
┌─────────────────────────────────────────────────────────────────────┐
│  EventDeduplicationService                                           │
│  (listener/src/services/event-deduplication-service.ts)             │
│  ┌───────────────────────────────────────────────────────────────┐  │
│  │ CHECK processed_events WHERE fingerprint = contract:event_id  │  │
│  │  • Found + is_reorg_duplicate → skip                          │  │
│  │  • Found + not reorg          → skip (already processed)      │  │
│  │  • Not found                  → INSERT, continue              │  │
│  └───────────────────────────────────────────────────────────────┘  │
└──────────────────────────────────┬──────────────────────────────────┘
                                   │
                                   ▼
┌─────────────────────────────────────────────────────────────────────┐
│  NotificationDeduplicator  (in-memory LRU, 60 s / 10k entries)      │
│  (listener/src/services/notification-deduplicator.ts)               │
└──────────────────────────────────┬──────────────────────────────────┘
                                   │ de-duplicated event
                    ┌──────────────┴──────────────┐
                    │                             │
                    ▼                             ▼
   ┌────────────────────────┐    ┌──────────────────────────────────┐
   │  EventRegistry         │    │  NotificationDispatcher          │
   │  (in-memory ring,      │    │  ┌────────────────────────────┐  │
   │   max 10k, 24 h TTL)   │    │  │ DiscordNotificationService │  │
   │                        │    │  │  • Format as embed          │  │
   │  ──────────────────    │    │  │  • POST to webhook URL     │  │
   │  ▼ also written to:    │    │  │  • 5 s timeout             │  │
   │  SQLite events table   │    │  │  • Retry via RetryQueue    │  │
   │  (persistent log)      │    │  └────────────────────────────┘  │
   └────────────────────────┘    │  ┌────────────────────────────┐  │
              │                  │  │ HTTP Webhook Sender        │  │
              │                  │  │  • HMAC-SHA256 signature   │  │
              ▼                  │  │  • configurable headers    │  │
   ┌────────────────────┐        │  └────────────────────────────┘  │
   │  REST API          │        │  ┌────────────────────────────┐  │
   │  /api/events       │        │  │ Email (optional)           │  │
   │  (serves from      │        │  └────────────────────────────┘  │
   │   EventRegistry    │        │                                  │
   │   + SQLite)        │        │  On failure:                     │
   └────────────────────┘        │  NotificationRetryQueue          │
                                 │  • base 5 s, ×2, max 1 h        │
                                 │  • max 5 retries                 │
                                 └──────────────────────────────────┘

For SCHEDULED notifications (separate pipeline):
   POST /api/schedule
         │ validate + insert
         ▼
   ScheduledNotificationRepository → SQLite scheduled_notifications
         │ status = PENDING
         ▼
   NotificationScheduler  (background, 10 s tick)
   ┌─────────────────────────────────────────────────────┐
   │ 1. recoverStaleLocks()  — reset stuck PROCESSING    │
   │ 2. SELECT PENDING WHERE execute_at <= NOW()         │
   │ 3. Atomic: UPDATE SET status='PROCESSING'           │
   │            WHERE status='PENDING'  ← race-free lock │
   │ 4. Dispatch via Discord / webhook                   │
   │ 5. Success → COMPLETED                             │
   │    Failure + retries left → PENDING, retry_count++ │
   │    Failure + no retries → FAILED                   │
   │ 6. Log each attempt to notification_execution_log   │
   └─────────────────────────────────────────────────────┘
```

---

## 4. Event Lifecycle State Machine (On-Chain Notification)

```
             schedule_notification()
                      │
                      ▼
               ┌────────────┐
               │  SCHEDULED │  NotificationScheduled event emitted
               └─────┬──────┘
                     │
          ┌──────────┼───────────────────────┐
          │          │                       │
          ▼          ▼                       ▼
   ┌─────────┐ ┌──────────┐          ┌──────────────┐
   │RECALLED │ │ REVOKED  │          │  (active,    │
   │         │ │          │          │  awaiting    │
   │recalled_│ │revoked_by│          │  expiry or   │
   │by set   │ │set       │          │  delivery)   │
   └─────────┘ └──────────┘          └──────┬───────┘
                                            │
                           ┌────────────────┼──────────────────┐
                           │                │                  │
                           ▼                ▼                  ▼
                   ┌──────────────┐  ┌───────────┐   ┌──────────────┐
                   │   EXPIRED    │  │ DELIVERED │   │  CANCELLED   │
                   │              │  │           │   │              │
                   │NotificationEx│  │Notification│  │Scheduled-    │
                   │pired emitted │  │Delivered  │  │Notification  │
                   └──────────────┘  └───────────┘  │Cancelled     │
                                           │         │emitted       │
                                           ▼         └──────────────┘
                                   ┌───────────────┐
                                   │ ACKNOWLEDGED  │
                                   │               │
                                   │Notification-  │
                                   │Acknowledged   │
                                   │emitted        │
                                   └───────────────┘

Audit records appended at every transition (AuditRecordAppended event).
AuditAction values: Created | DeliveryAttempt | DeliveryFailed
                    Acknowledged | Cancelled | Expired
```

---

## 5. Scheduled Notification Lifecycle (Off-Chain Scheduler)

```
POST /api/schedule
        │
        ▼
┌─────────────┐   10 s tick    ┌───────────────────────────────┐
│   PENDING   │ ─────────────▶ │ NotificationScheduler picks up│
└─────────────┘                │ atomic UPDATE → PROCESSING    │
                               └──────────────┬────────────────┘
                                              │
                               ┌──────────────┴──────────────┐
                               │ dispatch to Discord/webhook  │
                               └──────────────┬──────────────┘
                                              │
                       ┌──────────────────────┼──────────────────────┐
                       │ success              │ failure               │
                       ▼                      ▼  (retries left?)      │
               ┌─────────────┐       ┌─────────────────┐  YES       │
               │  COMPLETED  │       │ retry_count++    │ ──────────┘
               └─────────────┘       │ back to PENDING  │  (RetryScheduler
                                     └──────────────────┘   adds backoff delay)
                                              │ NO (max retries)
                                              ▼
                                     ┌─────────────┐
                                     │   FAILED    │
                                     └─────────────┘

notification_execution_log records every attempt for audit / metrics.
GET /api/schedule/execution-metrics uses SQL CTE MAX(execution_attempt)
to return one deduplicated row per notification.
```

---

## 6. Deduplication & Reorg Handling

```
NORMAL FLOW:
  Ledger: L100 → L105 → L110
  Events: e1    → e2    → e3
  Cursor: L100   L105    L110   ← stored in polling_cursors

REORG SCENARIO:
  Chain reorganizes back to L95
  Next poll sees events at L97, L100 (re-appeared)

                  polling_cursors.ledger = L110
                  new event ledger        = L97
                  L97 < L110  ──► REORG DETECTED
                        │
                        ▼
          reorg_detection_count++
          Re-fetched e1(L100):
            processed_events has fingerprint? YES
              └─► mark is_reorg_duplicate = true
                  skip notification dispatch (already sent)

TWO-LAYER GUARD:
  ┌────────────────────────────────────────────────────────┐
  │ Layer 1 (persistent):  EventDeduplicationService       │
  │  • Survives service restarts                           │
  │  • Catches reorg duplicates by ledger comparison       │
  │  • permanent record in SQLite processed_events         │
  ├────────────────────────────────────────────────────────┤
  │ Layer 2 (in-memory):   NotificationDeduplicator (LRU)  │
  │  • 60 s window — catches rapid duplicates              │
  │  • Avoids DB hits for common same-session duplicates   │
  └────────────────────────────────────────────────────────┘
```

---

## 7. Database Schema Overview

```
SQLite  (default: ./data/notifications.db)
┌──────────────────────────────────────────────────────────────────┐
│                                                                  │
│  events                         processed_events                 │
│  ┌─────────────────────────┐    ┌──────────────────────────────┐ │
│  │ id (PK)                 │    │ id (PK)                      │ │
│  │ event_id (UNIQUE)       │    │ event_id                     │ │
│  │ contract_id             │    │ contract_address             │ │
│  │ event_type              │    │ fingerprint (UNIQUE)         │ │
│  │ data (JSON)             │    │ ledger_number                │ │
│  │ ledger_sequence         │    │ is_reorg_duplicate (bool)    │ │
│  │ created_at              │    │ reorg_detection_count        │ │
│  │ category                │    │ processed_at                 │ │
│  │ priority                │    │ notification_sent (bool)     │ │
│  └─────────────────────────┘    └──────────────────────────────┘ │
│                                                                  │
│  polling_cursors                scheduled_notifications           │
│  ┌─────────────────────────┐    ┌──────────────────────────────┐ │
│  │ id (PK)                 │    │ id (PK)                      │ │
│  │ contract_address (UK)   │    │ payload (JSON)               │ │
│  │ cursor                  │    │ notification_type            │ │
│  │ ledger_number           │    │ target_recipient             │ │
│  │ reorg_detected (bool)   │    │ execute_at                   │ │
│  │ reorg_detection_count   │    │ status (PENDING|PROC|COMPL..)│ │
│  │ updated_at              │    │ retry_count                  │ │
│  └─────────────────────────┘    │ max_retries                  │ │
│                                 │ processor_id                 │ │
│  notification_execution_log     │ lock_expires_at              │ │
│  ┌─────────────────────────┐    │ event_id (FK ref)            │ │
│  │ id (PK)                 │    │ contract_address             │ │
│  │ scheduled_notif_id (FK)─┼──▶ └──────────────────────────────┘ │
│  │ execution_attempt       │                                    │ │
│  │ execution_time          │    notification_templates           │ │
│  │ status (SUCCESS|RETRY…) │    ┌──────────────────────────────┐ │
│  │ error_message           │    │ id (PK)                      │ │
│  │ duration_ms             │    │ name, type                   │ │
│  └─────────────────────────┘    │ subject, body                │ │
│                                 │ variables (JSON)             │ │
│  archive                        │ created_at, updated_at       │ │
│  ┌─────────────────────────┐    └──────────────────────────────┘ │
│  │ (old notifications      │                                    │ │
│  │  moved here by          │    notification_template_audit_log  │ │
│  │  ArchiveService)        │    ┌──────────────────────────────┐ │
│  └─────────────────────────┘    │ (immutable template changes) │ │
│                                 └──────────────────────────────┘ │
│  rate_limit_events              notification_metrics_snapshots   │ │
│  ┌─────────────────────────┐    ┌──────────────────────────────┐ │
│  │ client_id               │    │ (hourly analytics buckets)   │ │
│  │ endpoint, method        │    └──────────────────────────────┘ │
│  │ timestamp, limit        │                                    │ │
│  └─────────────────────────┘                                    │ │
└──────────────────────────────────────────────────────────────────┘
```

---

## 8. Deployment Topologies

### Single Instance

```
┌──────────────────────────────────────────────────────┐
│  Host / Container                                    │
│                                                      │
│  ┌──────────────────────────┐   ┌──────────────────┐ │
│  │  Listener Service        │   │  SQLite file     │ │
│  │  (Node.js process)       │──▶│  notifications.db│ │
│  │  Port 8787               │   └──────────────────┘ │
│  └──────────┬───────────────┘                        │
│             │                                        │
└─────────────┼────────────────────────────────────────┘
              │ HTTP (poll)
    ┌─────────┼──────────────┐
    ▼         ▼              ▼
 Discord  Dashboard     Frontend
 Webhook  (React)       (Next.js)
```

### Multi-Instance (Horizontal Scale)

```
              Stellar RPC (shared)
                /          \
               ▼            ▼
        ┌────────────┐  ┌────────────┐
        │ Listener A │  │ Listener B │
        │ worker-abc │  │ worker-xyz │
        └──────┬─────┘  └──────┬─────┘
               │ atomic        │ atomic
               │ UPDATE        │ UPDATE
               └──────┬────────┘
                      ▼
              ┌───────────────┐
              │  SQLite (or   │   ← single shared DB
              │  PostgreSQL)  │      atomic row locks prevent
              └───────────────┘      double-processing
```

Key: `processor_id` per instance + `lock_expires_at` prevent duplicate dispatch.
Stale lock recovery runs every scheduler tick.

---

## 9. Technology Stack Summary

```
┌──────────────────────────────────────────────────────────────────┐
│ Layer             │ Language / Runtime │ Key Libraries / Tools    │
├───────────────────┼────────────────────┼──────────────────────────┤
│ Smart Contract    │ Rust (no_std)      │ soroban-sdk ^15          │
│                   │ → WASM target      │ proptest (fuzz testing)  │
│                   │                   │ cargo / Makefile         │
├───────────────────┼────────────────────┼──────────────────────────┤
│ Listener Service  │ TypeScript 5.4     │ @stellar/stellar-sdk ^15 │
│                   │ Node.js 20+        │ sqlite3 ^5               │
│                   │                   │ node-cache, winston       │
│                   │                   │ jest 29 + @swc/jest       │
├───────────────────┼────────────────────┼──────────────────────────┤
│ Dashboard         │ TypeScript 5.8     │ React 19, Vite 6         │
│                   │ Browser            │ Zustand 5                │
│                   │                   │ @creit.tech/stellar-      │
│                   │                   │  wallets-kit ^2.3         │
│                   │                   │ jest + @testing-library   │
│                   │                   │ jest-axe (a11y)           │
├───────────────────┼────────────────────┼──────────────────────────┤
│ Frontend          │ TypeScript 5.x     │ Next.js 14, Chart.js     │
│                   │ Node.js / Browser  │ Tailwind CSS             │
├───────────────────┼────────────────────┼──────────────────────────┤
│ CI / CD           │ GitHub Actions     │ ci.yml (cargo + jest)    │
│                   │                   │ preview.yml (PR deploys) │
│                   │                   │ staging.yml (main merge) │
└───────────────────┴────────────────────┴──────────────────────────┘
```

---

## 10. On-Chain Events Reference

All events carry `category` (Group|Admin|Financial|Notification) and
`priority` (Low|Medium|High|Critical) as trailing indexed topics,
enabling off-chain consumers to filter by either dimension without
decoding the payload.

```
Group Events        Admin Events        Notification Events     Financial
─────────────────   ─────────────────   ─────────────────────   ──────────
AutoshareCreated    ContractPaused      NotificationScheduled   Withdrawal
AutoshareUpdated    ContractUnpaused    NotificationExpired
GroupActivated      AdminTransferred    NotificationRevoked
GroupDeactivated    CategoryRegistered  NotificationRecalled
                    AuthorizationFail.  NotificationDelivered
                    SchemaVersionSet    NotificationExtended
                    NotificationLimits  NotificationAcknowledged
                    Configured          ScheduledNotification
                    NotificationAccess  Cancelled
                    ed                  BatchNotifications
                                        Created
                                        BatchProcessingCompleted
                                        AuditRecordAppended
                                        ReputationUpdated
                                        ReputationTierChanged
```

---

*Document version: 1.0*
*Created: 2026-07-25*
*Reflects codebase as of: contract v1, listener schema v15, dashboard React 19*

See also:
- [`SYSTEM_ARCHITECTURE.md`](SYSTEM_ARCHITECTURE.md) — Mermaid diagrams + narrative
- [`ARCHITECTURE_OVERVIEW.md`](ARCHITECTURE_OVERVIEW.md) — Contributor walkthrough
- [`BACKEND_ARCHITECTURE.md`](BACKEND_ARCHITECTURE.md) — Backend deep-dive
- [`ARCHITECTURE_DIAGRAM.md`](ARCHITECTURE_DIAGRAM.md) — Scheduler deduplication flow
