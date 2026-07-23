# System Architecture: Retry Deduplication Flow

## Overview Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                    NOTIFICATION SCHEDULER                            │
│                                                                      │
│  ┌──────────────┐                                                   │
│  │ Poll Loop    │ Every 10s ─────────────────┐                      │
│  │ (10s timer)  │                             │                      │
│  └──────────────┘                             ▼                      │
│                                    ┌────────────────────┐            │
│                                    │ Fetch Pending      │            │
│                                    │ Notifications      │            │
│                                    │ (with lock)        │            │
│                                    └─────────┬──────────┘            │
│                                              │                       │
│                                              ▼                       │
│                                    ┌────────────────────┐            │
│                                    │ Process Each       │            │
│                                    │ Notification       │            │
│                                    └─────────┬──────────┘            │
│                                              │                       │
│                        ┌─────────────────────┼─────────────────┐    │
│                        │                     │                 │    │
│                        ▼                     ▼                 ▼    │
│              ┌──────────────┐     ┌──────────────┐  ┌──────────────┐│
│              │ Attempt 1    │     │ Attempt 2    │  │ Attempt 3    ││
│              │ (RETRY)      │     │ (RETRY)      │  │ (SUCCESS)    ││
│              └──────┬───────┘     └──────┬───────┘  └──────┬───────┘│
│                     │                    │                 │        │
│                     └────────────────────┴─────────────────┘        │
│                                          │                          │
│                                          ▼                          │
└──────────────────────────────────────────┼──────────────────────────┘
                                           │
                                           │ All attempts logged
                                           │
                                           ▼
        ┌──────────────────────────────────────────────────────────┐
        │                DATABASE (SQLite)                          │
        │                                                           │
        │  ┌─────────────────────────────────────────────────┐     │
        │  │ scheduled_notifications                         │     │
        │  ├─────────────────────────────────────────────────┤     │
        │  │ id: 100                                         │     │
        │  │ status: 'COMPLETED'  ◄── Only final status      │     │
        │  │ retry_count: 2                                  │     │
        │  └─────────────────────────────────────────────────┘     │
        │                                                           │
        │  ┌─────────────────────────────────────────────────┐     │
        │  │ notification_execution_log                      │     │
        │  ├─────────────────────────────────────────────────┤     │
        │  │ id: 1, notification_id: 100, attempt: 1, RETRY  │ ◄┐  │
        │  │ id: 2, notification_id: 100, attempt: 2, RETRY  │ ◄┤  │
        │  │ id: 3, notification_id: 100, attempt: 3, SUCCESS│ ◄┘  │
        │  └─────────────────────────────────────────────────┘     │
        │           3 log entries ─────────┬──────────►            │
        └──────────────────────────────────┼──────────────────────┘
                                           │
                                           │
        ┌──────────────────────────────────┼──────────────────────┐
        │          DEDUPLICATION LAYER     │                       │
        │                                  ▼                       │
        │  ┌──────────────────────────────────────────────┐       │
        │  │  getExecutionMetrics() - SQL CTE             │       │
        │  ├──────────────────────────────────────────────┤       │
        │  │  WITH final_outcomes AS (                    │       │
        │  │    SELECT MAX(execution_attempt)  ◄──────────┤───────│───┐
        │  │    FROM notification_execution_log           │       │   │
        │  │    WHERE notification_id = ?                 │       │   │
        │  │  )                                           │       │   │
        │  │  SELECT COUNT(*) FROM final_outcomes         │       │   │
        │  └──────────────────────────────────────────────┘       │   │
        │                                  │                       │   │
        │           Selects ONLY final attempt ────────────────────┘   │
        │                                  │ 1 row per notification     │
        │                                  ▼                       │
        │  ┌──────────────────────────────────────────────┐       │
        │  │  Result: notification_id: 100, attempt: 3    │       │
        │  │         status: SUCCESS, retries: 2          │       │
        │  └──────────────────────────────────────────────┘       │
        └──────────────────────────────────┬──────────────────────┘
                                           │
                                           │ Deduplicated data
                                           ▼
        ┌──────────────────────────────────────────────────────────┐
        │              API ENDPOINT                                 │
        │  GET /api/schedule/execution-metrics                      │
        │                                                           │
        │  {                                                        │
        │    "totalNotifications": 1,      ◄── Counted once        │
        │    "successfulFirstAttempt": 0,                          │
        │    "successfulAfterRetry": 1,    ◄── Counted once        │
        │    "totalRetryAttempts": 2       ◄── Retries tracked     │
        │  }                                                        │
        └──────────────────────────────────┬──────────────────────┘
                                           │
                    ┌──────────────────────┼──────────────────────┐
                    │                      │                      │
                    ▼                      ▼                      ▼
        ┌───────────────────┐  ┌───────────────────┐  ┌──────────────┐
        │   Dashboard       │  │   Prometheus      │  │   Datadog    │
        │   (React)         │  │   Exporter        │  │   Agent      │
        │                   │  │                   │  │              │
        │   ✅ Uses API     │  │   ✅ Uses API     │  │   ✅ Uses API│
        │   No duplication  │  │   No duplication  │  │   No dupl.   │
        └───────────────────┘  └───────────────────┘  └──────────────┘
```

---

## Data Flow: Single Notification Journey

### Scenario: Notification fails twice, succeeds on 3rd attempt

```
TIME: T0
┌─────────────────────────────────────────┐
│ Notification Created                     │
├─────────────────────────────────────────┤
│ id: 100                                 │
│ status: PENDING                         │
│ retry_count: 0                          │
│ max_retries: 3                          │
└─────────────────────────────────────────┘
                 │
                 ▼
TIME: T1 ─── Attempt 1 (FAILURE)
┌─────────────────────────────────────────┐
│ Notification Updated                     │
├─────────────────────────────────────────┤
│ id: 100                                 │
│ status: PENDING  ◄─── Back to pending   │
│ retry_count: 1   ◄─── Incremented       │
└─────────────────────────────────────────┘
           +
┌─────────────────────────────────────────┐
│ Execution Log Created                    │
├─────────────────────────────────────────┤
│ notification_id: 100                    │
│ execution_attempt: 1                    │
│ status: RETRY    ◄─── Log entry #1      │
│ error_message: "Network timeout"        │
└─────────────────────────────────────────┘
                 │
                 ▼
TIME: T2 ─── Attempt 2 (FAILURE)
┌─────────────────────────────────────────┐
│ Notification Updated                     │
├─────────────────────────────────────────┤
│ id: 100                                 │
│ status: PENDING                         │
│ retry_count: 2   ◄─── Incremented       │
└─────────────────────────────────────────┘
           +
┌─────────────────────────────────────────┐
│ Execution Log Created                    │
├─────────────────────────────────────────┤
│ notification_id: 100                    │
│ execution_attempt: 2                    │
│ status: RETRY    ◄─── Log entry #2      │
│ error_message: "Service unavailable"    │
└─────────────────────────────────────────┘
                 │
                 ▼
TIME: T3 ─── Attempt 3 (SUCCESS)
┌─────────────────────────────────────────┐
│ Notification Updated                     │
├─────────────────────────────────────────┤
│ id: 100                                 │
│ status: COMPLETED ◄─── Final status     │
│ retry_count: 2                          │
└─────────────────────────────────────────┘
           +
┌─────────────────────────────────────────┐
│ Execution Log Created                    │
├─────────────────────────────────────────┤
│ notification_id: 100                    │
│ execution_attempt: 3                    │
│ status: SUCCESS  ◄─── Log entry #3      │
└─────────────────────────────────────────┘

═══════════════════════════════════════════
METRICS CALCULATION
═══════════════════════════════════════════

❌ WRONG (if counting all log entries):
   SELECT COUNT(*) FROM notification_execution_log
   WHERE notification_id = 100
   Result: 3 ◄─── DOUBLE-COUNTED!

✅ CORRECT (using deduplication):
   SELECT * FROM notification_execution_log
   WHERE notification_id = 100
   AND execution_attempt = (
     SELECT MAX(execution_attempt)
     FROM notification_execution_log
     WHERE notification_id = 100
   )
   Result: 1 row (attempt 3, SUCCESS) ✓

Final Metrics:
├─ totalNotifications: +1
├─ successfulFirstAttempt: +0 (didn't succeed on first)
├─ successfulAfterRetry: +1 ◄─── Counted exactly once
└─ totalRetryAttempts: +2 (attempts 1 & 2)
```

---

## SQL Deduplication Logic

### The Problem Query (Wrong)

```sql
-- ❌ This counts every execution attempt
SELECT 
  notification_id,
  COUNT(*) as total_attempts
FROM notification_execution_log
WHERE status = 'SUCCESS'
GROUP BY notification_id;

-- Result for notification 100:
-- notification_id | total_attempts
-- 100             | 1  ◄── This is actually correct!

-- BUT if you do this:
SELECT COUNT(*) FROM notification_execution_log;
-- Result: 3 ◄── This includes retries

-- And then count successes in dashboard logic:
-- You might count the notification 3 times if you're
-- iterating over all log entries!
```

### The Solution Query (Correct)

```sql
-- ✅ This gets ONE row per notification (final outcome)
WITH final_outcomes AS (
  SELECT 
    sn.id as notification_id,
    sn.status,
    sn.retry_count,
    log.status as final_execution_status,
    log.execution_attempt
  FROM scheduled_notifications sn
  LEFT JOIN notification_execution_log log 
    ON log.scheduled_notification_id = sn.id 
    AND log.execution_attempt = (
      -- KEY: Subquery returns MAX attempt number
      SELECT MAX(execution_attempt) 
      FROM notification_execution_log 
      WHERE scheduled_notification_id = sn.id
    )
  WHERE sn.status IN ('COMPLETED', 'FAILED')
)
SELECT
  notification_id,
  final_execution_status,
  retry_count,
  execution_attempt
FROM final_outcomes;

-- Result for notification 100:
-- notification_id | final_status | retry_count | execution_attempt
-- 100             | SUCCESS      | 2           | 3

-- Exactly 1 row per notification!
```

### Visual Comparison

```
notification_execution_log table:
┌────┬─────────────────┬───────────┬─────────┐
│ id │ notification_id │ attempt   │ status  │
├────┼─────────────────┼───────────┼─────────┤
│ 1  │ 100             │ 1         │ RETRY   │ ◄─┐
│ 2  │ 100             │ 2         │ RETRY   │ ◄─┤ Wrong: Count all 3
│ 3  │ 100             │ 3         │ SUCCESS │ ◄─┘
│ 4  │ 101             │ 1         │ SUCCESS │ ◄─── Single attempt
│ 5  │ 102             │ 1         │ RETRY   │ ◄─┐
│ 6  │ 102             │ 2         │ SUCCESS │ ◄─┘ Wrong: Count both
└────┴─────────────────┴───────────┴─────────┘
Total rows: 6

After MAX(execution_attempt) deduplication:
┌─────────────────┬───────────┬─────────┐
│ notification_id │ attempt   │ status  │
├─────────────────┼───────────┼─────────┤
│ 100             │ 3         │ SUCCESS │ ◄─── Only final
│ 101             │ 1         │ SUCCESS │ ◄─── Only attempt
│ 102             │ 2         │ SUCCESS │ ◄─── Only final
└─────────────────┴───────────┴─────────┘
Total rows: 3 (one per notification) ✓
```

---

## Monitoring System Comparison

### ❌ Anti-Pattern: Direct Database Query

```
┌────────────────────┐
│   Prometheus       │
│   (WRONG CONFIG)   │
└─────────┬──────────┘
          │
          │ Direct SQL query
          ▼
┌───────────────────────────────────────┐
│  SQLite Database                       │
│                                       │
│  SELECT COUNT(*)                      │
│  FROM notification_execution_log      │
│  WHERE status = 'SUCCESS'             │
│                                       │
│  Result: 3 (includes retries) ❌      │
└───────────────────────────────────────┘
          │
          ▼
┌────────────────────┐
│   Grafana          │
│   Dashboard        │
│                    │
│   Total: 3 ❌      │
│   (should be 1)    │
└────────────────────┘
```

### ✅ Correct Pattern: API Endpoint

```
┌────────────────────┐
│   Prometheus       │
│   (CORRECT CONFIG) │
└─────────┬──────────┘
          │
          │ HTTP GET
          ▼
┌───────────────────────────────────────┐
│  API Server                            │
│  /api/schedule/execution-metrics      │
└─────────┬─────────────────────────────┘
          │
          │ Calls repository method
          ▼
┌───────────────────────────────────────┐
│  ScheduledNotificationRepository      │
│  getExecutionMetrics()                │
│                                       │
│  - Uses SQL CTE                       │
│  - MAX(execution_attempt)             │
│  - Returns deduplicated data          │
└─────────┬─────────────────────────────┘
          │
          │ Deduplicated result
          ▼
┌───────────────────────────────────────┐
│  JSON Response                         │
│  {                                    │
│    "totalNotifications": 1,           │
│    "successfulAfterRetry": 1,         │
│    "totalRetryAttempts": 2            │
│  }                                    │
└─────────┬─────────────────────────────┘
          │
          ▼
┌────────────────────┐
│   Grafana          │
│   Dashboard        │
│                    │
│   Total: 1 ✅      │
│   Retries: 2 ✅    │
└────────────────────┘
```

---

## Test Coverage Visualization

```
┌─────────────────────────────────────────────────────────────┐
│                    TEST PYRAMID                              │
│                                                              │
│                        ┌───┐                                 │
│                        │ 1 │  E2E Test                       │
│                        └───┘  (End-to-end scenario)          │
│                     ┌─────────┐                              │
│                     │    6    │  Integration Tests           │
│                     └─────────┘  (execution-metrics.test.ts) │
│                ┌───────────────────┐                         │
│                │        10         │  Edge Case Tests        │
│                └───────────────────┘  (retry-dedup.test.ts)  │
│                                                              │
└─────────────────────────────────────────────────────────────┘

Test Coverage:
├─ Basic retry scenario (2 failures + success)         ✅
├─ Multiple notifications with different patterns      ✅
├─ Maximum retries exhausted (all failures)            ✅
├─ Immediate success (no retries)                      ✅
├─ Success on last possible attempt                    ✅
├─ High-volume scenario (100 notifications)            ✅
├─ Pending/Processing notifications excluded           ✅
├─ Cancelled notifications excluded                    ✅
├─ Concurrent retry patterns                           ✅
├─ Very high retry counts (9 retries)                  ✅
├─ Retry distribution accuracy                         ✅
├─ Average duration calculations                       ✅
├─ Empty database edge case                            ✅
└─ Notifications without log entries                   ✅

Total: 16 test cases covering all scenarios
```

---

## Metrics Flow Diagram

```
Notification Lifecycle:
╔═══════════════════════════════════════════════════════════╗
║  START → PENDING → PROCESSING → [ATTEMPT] → OUTCOME      ║
╚═══════════════════════════════════════════════════════════╝
                                       │
                    ┌──────────────────┼──────────────────┐
                    │                  │                  │
                    ▼                  ▼                  ▼
            ┌─────────────┐    ┌─────────────┐   ┌─────────────┐
            │   SUCCESS   │    │   RETRY     │   │   FAILED    │
            │   (final)   │    │  (repeat)   │   │   (final)   │
            └──────┬──────┘    └──────┬──────┘   └──────┬──────┘
                   │                  │                  │
                   │                  │ Loop back        │
                   │                  └──────────────┐   │
                   │                                 │   │
                   └─────────────┬───────────────────┘   │
                                 │                       │
                                 ▼                       ▼
                    ┌──────────────────────┐  ┌──────────────────┐
                    │ METRICS (Success)    │  │ METRICS (Failure)│
                    ├──────────────────────┤  ├──────────────────┤
                    │ totalNotifications+1 │  │ totalNotifications+1│
                    │ successfulXXX+1      │  │ permanentFailures+1│
                    │ totalRetryAttempts+N │  │ totalRetryAttempts+N│
                    └──────────────────────┘  └──────────────────┘
                                 │                       │
                                 └───────────┬───────────┘
                                             │
                                             ▼
                                ┌──────────────────────────┐
                                │   API Response           │
                                │   (Deduplicated)         │
                                └──────────────────────────┘
```

---

## Key Components

```
┌─────────────────────────────────────────────────────────────────┐
│                    COMPONENT ARCHITECTURE                        │
└─────────────────────────────────────────────────────────────────┘

┌────────────────────────────────────────────────────────────────┐
│ notification-scheduler.ts (Orchestrator)                        │
├────────────────────────────────────────────────────────────────┤
│ - Polls for pending notifications                              │
│ - Manages retry logic                                          │
│ - Calls repository for state updates                           │
│ - Logs execution attempts                                      │
└───────────────────────┬────────────────────────────────────────┘
                        │
                        │ Uses
                        ▼
┌────────────────────────────────────────────────────────────────┐
│ scheduled-notification-repository.ts (Data Layer)               │
├────────────────────────────────────────────────────────────────┤
│ - CRUD operations on notifications                             │
│ - markAsCompleted() - Final success state                      │
│ - markAsFailedOrRetry() - Retry or failure state               │
│ - logExecution() - Creates log entry for each attempt          │
│ - getExecutionMetrics() ◄─────── DEDUPLICATION HERE!           │
│   └─ Uses SQL CTE with MAX(execution_attempt)                  │
│   └─ Returns one row per notification                          │
└───────────────────────┬────────────────────────────────────────┘
                        │
                        │ Queries
                        ▼
┌────────────────────────────────────────────────────────────────┐
│ SQLite Database                                                 │
├────────────────────────────────────────────────────────────────┤
│ scheduled_notifications (1 row per notification)                │
│ ├─ Stores final status (PENDING/PROCESSING/COMPLETED/FAILED)   │
│ └─ Stores retry_count                                          │
│                                                                │
│ notification_execution_log (N rows per notification)            │
│ ├─ Stores ALL attempts (including retries)                     │
│ └─ Used for audit trail and metrics calculation                │
└───────────────────────┬────────────────────────────────────────┘
                        │
                        │ Exposes
                        ▼
┌────────────────────────────────────────────────────────────────┐
│ events-server.ts (API Layer)                                    │
├────────────────────────────────────────────────────────────────┤
│ GET /api/schedule/execution-metrics                             │
│ ├─ Calls repository.getExecutionMetrics()                       │
│ └─ Returns JSON with deduplicated metrics                       │
└───────────────────────┬────────────────────────────────────────┘
                        │
                        │ Consumed by
                        ▼
┌────────────────────────────────────────────────────────────────┐
│ External Monitoring (Prometheus, Datadog, CloudWatch, etc.)     │
├────────────────────────────────────────────────────────────────┤
│ - Fetches metrics via HTTP                                     │
│ - Creates time-series data                                     │
│ - Powers dashboards and alerts                                 │
└────────────────────────────────────────────────────────────────┘
```

---

**Document Version**: 1.0  
**Date**: June 20, 2026  
**Status**: Reference Architecture
