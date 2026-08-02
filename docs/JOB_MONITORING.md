# Background Job Monitoring

Monitor scheduled notification jobs and inspect execution status for maintenance.

## Overview

The listener records every scheduled-notification job through `JobMonitor`
(`listener/src/services/job-monitor.ts`). The scheduler starts a monitored job
when it begins processing a notification and marks it **completed** or
**failed** when delivery finishes.

Failed jobs are logged at `error` level and retained in an in-memory failure
log for quick inspection.

## Endpoints

### `GET /api/schedule/jobs`

Returns a snapshot of recent job activity.

```bash
curl http://localhost:3000/api/schedule/jobs?limit=25
```

**Response fields**

| Field | Description |
|-------|-------------|
| `activeCount` | Jobs currently running |
| `completedCount` | Completed jobs in history |
| `failedCount` | Failed jobs retained |
| `recentJobs` | Recent job records (running + finished) |
| `recentFailures` | Recent failed job records |

**Job record shape**

```json
{
  "jobId": "notification-42",
  "jobName": "scheduled-notification",
  "status": "failed",
  "startedAt": "2026-07-26T15:00:00.000Z",
  "finishedAt": "2026-07-26T15:00:01.200Z",
  "durationMs": 1200,
  "error": "webhook timeout",
  "metadata": { "notificationId": 42, "type": "discord" }
}
```

### `GET /api/schedule/jobs/failures`

Returns only failed jobs (most recent first).

```bash
curl http://localhost:3000/api/schedule/jobs/failures?limit=50
```

## Status values

| Status | Meaning |
|--------|---------|
| `running` | Job accepted and currently executing |
| `completed` | Delivery succeeded |
| `failed` | Delivery failed or rejected (integrity, timing, etc.) |

## Operational notes

- History is in-memory (capped). Restart clears the monitor; durable attempt
  history remains in `notification_execution_log` / history APIs.
- Combine with `GET /api/schedule/stats` and `GET /api/notifications/health`
  for queue depth and worker health.
- Failed jobs always emit a structured log line: `Job monitor: job failed`.

## Related docs

- [MONITORING_INTEGRATION.md](./MONITORING_INTEGRATION.md)
- [METRICS_API_DOCUMENTATION.md](../METRICS_API_DOCUMENTATION.md)
- [listener/README-SCHEDULER.md](../listener/README-SCHEDULER.md)
