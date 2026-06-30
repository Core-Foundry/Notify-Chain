# Root Cause Analysis: Retry Double-Counting Bug

## Executive Summary
Successful retries are being double/triple-counted in dashboard metrics because **every execution attempt** is logged in `notification_execution_log`, but there is **no proper aggregation logic** to deduplicate these events when calculating metrics. A notification that fails twice then succeeds creates 3 log entries (2 RETRY + 1 SUCCESS), causing inflated success counts.

## Root Cause Details

### 1. Current Behavior (Problematic)

**Scenario:** A notification fails twice, then succeeds on the 3rd attempt.

**What Gets Logged:**
```sql
-- notification_execution_log entries:
| id | scheduled_notification_id | execution_attempt | status  |
|----|---------------------------|-------------------|---------|
| 1  | 100                       | 1                 | RETRY   |
| 2  | 100                       | 2                 | RETRY   |
| 3  | 100                       | 3                 | SUCCESS |
```

**What Gets Counted (Currently):**
- If we naively count `status = 'SUCCESS'`: **1 success** ✓ (correct)
- If we count all logs: **3 events** ✗ (incorrect - inflated)
- If external systems aggregate by event emission: **3 notifications sent** ✗ (incorrect)

### 2. Code Location of the Bug

**File:** `listener/src/services/notification-scheduler.ts`

**Lines 166-177 (Success Path):**
```typescript
if (success) {
  await this.repository.markAsCompleted(notification.id!);
  await this.repository.logExecution({
    scheduledNotificationId: notification.id!,
    executionAttempt,
    executionTime: new Date(),
    status: 'SUCCESS',  // ← Logs SUCCESS on final attempt
    durationMs: duration,
  });
}
```

**Lines 187-204 (Failure/Retry Path):**
```typescript
await this.repository.markAsFailedOrRetry(
  notification.id!,
  error as Error,
  notification.retryCount,
  notification.maxRetries
);

await this.repository.logExecution({
  scheduledNotificationId: notification.id!,
  executionAttempt,
  executionTime: new Date(),
  status: notification.retryCount >= notification.maxRetries ? 'FAILED' : 'RETRY',  // ← Logs RETRY on each failure
  errorMessage: (error as Error).message,
  durationMs: duration,
});
```

### 3. Why This Causes Double-Counting

The system correctly logs **all attempts** for audit purposes, but:

1. **No Aggregation API:** The `getStats()` method in `scheduled-notification-repository.ts` (lines 272-305) only counts notifications by status (PENDING, COMPLETED, FAILED), not execution attempts.

2. **Missing Execution Metrics:** There is no API endpoint that exposes **execution-level metrics** with proper deduplication logic.

3. **External Dashboard Integration:** If an external monitoring system (Prometheus, Datadog, etc.) is configured to track events via logs or webhook emissions, it may count each `logExecution()` call as a separate event.

4. **Template Usage Tracking:** The `template_usage_log` table tracks each render as a separate success/failure, which could also inflate counts if not aggregated by `context_hash`.

### 4. Impact

**Dashboard Displays:**
- **Inflated Success Rates:** A job with 2 retries + 1 success appears as 3 successful operations
- **Incorrect Retry Metrics:** Total retry count is correct, but correlation to final outcome is unclear
- **Misleading Throughput:** Event processing counts are artificially high
- **False System Health:** Reliability metrics appear better than reality (high success rate masks retry overhead)

**Example:**
```
Actual: 100 notifications, 70 succeeded first try, 20 succeeded after 1 retry, 10 failed permanently
Current Dashboard Shows: 110 successes (70 + 20 + 20 retries counted as successes)
Should Show: 90 successes (70 + 20), 10 failures, 20 total retries
```

## Why This Wasn't Caught

1. **Audit vs. Metrics Confusion:** The `notification_execution_log` was designed as an **audit trail** (all attempts), but is being used as a **metrics source** (final outcomes).

2. **Missing Aggregation Layer:** No explicit "final outcome per notification" query exists.

3. **Test Gap:** Tests validate retry behavior and logging, but don't assert on **aggregated metrics** consumed by dashboards.

## Affected Components

1. ✅ **Scheduled Notifications** (`notification-scheduler.ts`) - Logs every attempt
2. ✅ **Repository Stats API** (`scheduled-notification-repository.ts`) - Missing execution-level aggregation
3. ✅ **Events API** (`events-server.ts`) - Exposes stats without execution metrics
4. ⚠️ **Template Usage Log** (`template_usage_log` table) - May have similar issue if not using `context_hash` for deduplication
5. ⚠️ **External Monitoring** - If configured to consume logs/webhooks directly

## Solution Architecture

### Approach 1: Notification-Level Aggregation (Recommended)
Query the `scheduled_notifications` table by **final status** (COMPLETED/FAILED), not execution logs.

**Pros:**
- Simple and accurate
- Matches business intent (count final outcomes)
- Fast query (indexed by status)

**Cons:**
- Loses retry visibility in main metrics

### Approach 2: Execution-Level Aggregation with Deduplication
Add new query that returns **one row per notification** with final status from execution log.

**Pros:**
- Preserves retry metrics
- Can show "successful after N retries" breakdown

**Cons:**
- More complex SQL
- Requires GROUP BY with MAX(execution_attempt)

### Recommended Solution
Implement **both**:
1. Keep existing `getStats()` for notification-level metrics (already correct)
2. Add new `getExecutionMetrics()` method with proper deduplication for retry analytics
3. Expose both via separate API endpoints
4. Update dashboard to consume correct endpoint for each use case

## Fix Strategy

1. ✅ Add `getExecutionMetrics()` method with deduplication
2. ✅ Add `/api/schedule/execution-metrics` API endpoint
3. ✅ Write regression tests for multi-retry scenarios
4. ✅ Document metric semantics for dashboard consumers
5. ⚠️ Audit external monitoring configurations (requires manual review)
