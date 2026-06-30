# Monitoring Integration Guide

## ⚠️ Critical: Avoiding Double-Counting in Metrics

This guide explains how to integrate with Notify-Chain's notification metrics **without double-counting retries**.

---

## The Problem

When a notification fails and is retried, the system creates multiple execution log entries:

```
Notification ID: 100
├─ Attempt 1: RETRY (failed)
├─ Attempt 2: RETRY (failed)
└─ Attempt 3: SUCCESS

❌ WRONG: Counting all 3 entries = 3 events
✅ CORRECT: Counting the final outcome = 1 successful notification (with 2 retries)
```

---

## Best Practices

### ✅ DO: Use the Metrics API

**Endpoint**: `GET /api/schedule/execution-metrics`

```bash
curl http://localhost:3000/api/schedule/execution-metrics
```

**Response**:
```json
{
  "totalNotifications": 1500,
  "successfulFirstAttempt": 1200,
  "successfulAfterRetry": 250,
  "permanentFailures": 50,
  "totalRetryAttempts": 400,
  "averageRetriesPerNotification": 0.27,
  "averageSuccessDurationMs": 750,
  "averageFailureDurationMs": 2500
}
```

**Key Metrics**:
- `totalNotifications`: Total completed/failed notifications (deduplicated)
- `successfulFirstAttempt`: Succeeded on first try (no retries)
- `successfulAfterRetry`: Eventually succeeded after 1+ retries
- `permanentFailures`: Failed after exhausting all retries
- `totalRetryAttempts`: Sum of all retry attempts across all notifications
- `averageRetriesPerNotification`: Average retry count per notification

**Success Rate Calculation**:
```javascript
const totalSuccess = metrics.successfulFirstAttempt + metrics.successfulAfterRetry;
const successRate = (totalSuccess / metrics.totalNotifications) * 100;
// Example: (1200 + 250) / 1500 = 96.67% success rate
```

### ❌ DON'T: Query Raw Logs Directly

**Wrong Approach**:
```sql
-- ❌ This will count retries multiple times!
SELECT COUNT(*) 
FROM notification_execution_log 
WHERE status = 'SUCCESS';
```

If a notification succeeds on the 3rd attempt, this query counts it as 1 success.  
But if you're counting all log entries for that notification, you might count 3 events.

---

## Integration Examples

### Prometheus

**File**: `prometheus.yml`

```yaml
scrape_configs:
  - job_name: 'notify-chain'
    static_configs:
      - targets: ['localhost:3000']
    metrics_path: '/api/schedule/execution-metrics'
    scrape_interval: 30s
```

**Custom Exporter** (recommended):

```typescript
// File: listener/src/services/prometheus-exporter.ts
import promClient from 'prom-client';
import { ScheduledNotificationRepository } from './scheduled-notification-repository';

export class PrometheusExporter {
  private register: promClient.Registry;
  
  constructor(private repository: ScheduledNotificationRepository) {
    this.register = new promClient.Registry();
    this.setupMetrics();
  }

  private setupMetrics() {
    // Total notifications gauge
    new promClient.Gauge({
      name: 'notifications_total',
      help: 'Total notifications processed (deduplicated)',
      registers: [this.register],
      async collect() {
        const metrics = await this.repository.getExecutionMetrics();
        this.set(metrics.totalNotifications);
      }
    });

    // Success rate gauge
    new promClient.Gauge({
      name: 'notifications_success_total',
      help: 'Total successful notifications (deduplicated)',
      registers: [this.register],
      async collect() {
        const metrics = await this.repository.getExecutionMetrics();
        this.set(metrics.successfulFirstAttempt + metrics.successfulAfterRetry);
      }
    });

    // Failure rate gauge
    new promClient.Gauge({
      name: 'notifications_failure_total',
      help: 'Total failed notifications (deduplicated)',
      registers: [this.register],
      async collect() {
        const metrics = await this.repository.getExecutionMetrics();
        this.set(metrics.permanentFailures);
      }
    });

    // Average retry count gauge
    new promClient.Gauge({
      name: 'notifications_avg_retries',
      help: 'Average number of retries per notification',
      registers: [this.register],
      async collect() {
        const metrics = await this.repository.getExecutionMetrics();
        this.set(metrics.averageRetriesPerNotification);
      }
    });

    // Average duration histograms
    new promClient.Gauge({
      name: 'notifications_avg_duration_ms',
      help: 'Average notification delivery duration in milliseconds',
      labelNames: ['status'],
      registers: [this.register],
      async collect() {
        const metrics = await this.repository.getExecutionMetrics();
        this.set({ status: 'success' }, metrics.averageSuccessDurationMs);
        this.set({ status: 'failure' }, metrics.averageFailureDurationMs);
      }
    });
  }

  getMetrics(): Promise<string> {
    return this.register.metrics();
  }
}
```

**Grafana Queries**:
```promql
# Success rate percentage
100 * (notifications_success_total / notifications_total)

# Failure rate percentage
100 * (notifications_failure_total / notifications_total)

# Retry rate (higher = more retries needed)
notifications_avg_retries

# Alert: High retry rate (>50% of notifications need retries)
notifications_avg_retries > 0.5
```

### Datadog

**Custom Check** (`/etc/datadog-agent/checks.d/notify_chain.py`):

```python
from datadog_checks.base import AgentCheck
import requests

class NotifyChainCheck(AgentCheck):
    def check(self, instance):
        url = instance.get('url', 'http://localhost:3000/api/schedule/execution-metrics')
        
        try:
            response = requests.get(url, timeout=5)
            response.raise_for_status()
            metrics = response.json()
            
            # Emit deduplicated metrics
            self.gauge('notify_chain.notifications.total', metrics['totalNotifications'])
            self.gauge('notify_chain.notifications.success.first_attempt', metrics['successfulFirstAttempt'])
            self.gauge('notify_chain.notifications.success.after_retry', metrics['successfulAfterRetry'])
            self.gauge('notify_chain.notifications.failures', metrics['permanentFailures'])
            self.gauge('notify_chain.notifications.avg_retries', metrics['averageRetriesPerNotification'])
            self.gauge('notify_chain.notifications.avg_duration.success', metrics['averageSuccessDurationMs'])
            self.gauge('notify_chain.notifications.avg_duration.failure', metrics['averageFailureDurationMs'])
            
            # Calculate derived metrics
            total_success = metrics['successfulFirstAttempt'] + metrics['successfulAfterRetry']
            success_rate = (total_success / metrics['totalNotifications'] * 100) if metrics['totalNotifications'] > 0 else 0
            self.gauge('notify_chain.notifications.success_rate', success_rate)
            
        except Exception as e:
            self.log.error(f"Failed to collect metrics: {e}")
            self.service_check('notify_chain.can_connect', AgentCheck.CRITICAL, message=str(e))
```

**Configuration** (`/etc/datadog-agent/conf.d/notify_chain.yaml`):

```yaml
init_config:

instances:
  - url: http://localhost:3000/api/schedule/execution-metrics
    min_collection_interval: 30
```

### AWS CloudWatch

**Lambda Function** (scheduled every 5 minutes):

```javascript
const AWS = require('aws-sdk');
const https = require('https');

const cloudwatch = new AWS.CloudWatch();

exports.handler = async (event) => {
  try {
    const metrics = await fetchMetrics('http://notify-chain:3000/api/schedule/execution-metrics');
    
    const totalSuccess = metrics.successfulFirstAttempt + metrics.successfulAfterRetry;
    const successRate = metrics.totalNotifications > 0 
      ? (totalSuccess / metrics.totalNotifications) * 100 
      : 0;

    await cloudwatch.putMetricData({
      Namespace: 'NotifyChain',
      MetricData: [
        {
          MetricName: 'TotalNotifications',
          Value: metrics.totalNotifications,
          Unit: 'Count',
          Timestamp: new Date()
        },
        {
          MetricName: 'SuccessfulNotifications',
          Value: totalSuccess,
          Unit: 'Count',
          Timestamp: new Date()
        },
        {
          MetricName: 'FailedNotifications',
          Value: metrics.permanentFailures,
          Unit: 'Count',
          Timestamp: new Date()
        },
        {
          MetricName: 'SuccessRate',
          Value: successRate,
          Unit: 'Percent',
          Timestamp: new Date()
        },
        {
          MetricName: 'AverageRetries',
          Value: metrics.averageRetriesPerNotification,
          Unit: 'Count',
          Timestamp: new Date()
        },
        {
          MetricName: 'AverageSuccessDuration',
          Value: metrics.averageSuccessDurationMs,
          Unit: 'Milliseconds',
          Timestamp: new Date()
        }
      ]
    }).promise();

    return { statusCode: 200, body: 'Metrics published successfully' };
  } catch (error) {
    console.error('Error publishing metrics:', error);
    throw error;
  }
};

function fetchMetrics(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => resolve(JSON.parse(data)));
    }).on('error', reject);
  });
}
```

### Grafana Dashboard (Direct API)

**Dashboard JSON**:

```json
{
  "dashboard": {
    "title": "Notify-Chain Metrics",
    "panels": [
      {
        "title": "Success Rate",
        "type": "gauge",
        "targets": [
          {
            "expr": "100 * (successfulFirstAttempt + successfulAfterRetry) / totalNotifications"
          }
        ],
        "thresholds": {
          "mode": "absolute",
          "steps": [
            { "value": 0, "color": "red" },
            { "value": 90, "color": "yellow" },
            { "value": 95, "color": "green" }
          ]
        }
      },
      {
        "title": "Notification Outcomes",
        "type": "piechart",
        "targets": [
          {
            "legendFormat": "Success (First Attempt)",
            "expr": "successfulFirstAttempt"
          },
          {
            "legendFormat": "Success (After Retry)",
            "expr": "successfulAfterRetry"
          },
          {
            "legendFormat": "Permanent Failure",
            "expr": "permanentFailures"
          }
        ]
      },
      {
        "title": "Average Retries Per Notification",
        "type": "stat",
        "targets": [
          {
            "expr": "averageRetriesPerNotification"
          }
        ]
      },
      {
        "title": "Average Duration (ms)",
        "type": "timeseries",
        "targets": [
          {
            "legendFormat": "Success",
            "expr": "averageSuccessDurationMs"
          },
          {
            "legendFormat": "Failure",
            "expr": "averageFailureDurationMs"
          }
        ]
      }
    ]
  }
}
```

---

## Database Queries (If API Not Available)

If you **must** query the database directly, use this **deduplicated** query:

```sql
-- Get deduplicated metrics (same logic as API)
WITH final_outcomes AS (
  SELECT 
    sn.id,
    sn.status,
    sn.retry_count,
    log.status as final_execution_status,
    log.duration_ms
  FROM scheduled_notifications sn
  LEFT JOIN notification_execution_log log 
    ON log.scheduled_notification_id = sn.id 
    AND log.execution_attempt = (
      -- KEY: Only select the FINAL attempt for each notification
      SELECT MAX(execution_attempt) 
      FROM notification_execution_log 
      WHERE scheduled_notification_id = sn.id
    )
  WHERE sn.status IN ('COMPLETED', 'FAILED')
)
SELECT
  COUNT(*) as total_notifications,
  SUM(CASE WHEN final_execution_status = 'SUCCESS' AND retry_count = 0 THEN 1 ELSE 0 END) as success_first_attempt,
  SUM(CASE WHEN final_execution_status = 'SUCCESS' AND retry_count > 0 THEN 1 ELSE 0 END) as success_after_retry,
  SUM(CASE WHEN status = 'FAILED' OR final_execution_status = 'FAILED' THEN 1 ELSE 0 END) as permanent_failures,
  SUM(retry_count) as total_retry_attempts,
  AVG(CASE WHEN final_execution_status = 'SUCCESS' THEN duration_ms ELSE NULL END) as avg_success_duration,
  AVG(CASE WHEN status = 'FAILED' OR final_execution_status = 'FAILED' THEN duration_ms ELSE NULL END) as avg_failure_duration
FROM final_outcomes;
```

**Key Points**:
- Uses `MAX(execution_attempt)` to get only the final outcome per notification
- Groups implicitly by `sn.id` through the join
- Returns one row per notification, preventing double-counting

---

## Alerting Rules

### High Retry Rate Alert

```yaml
# Prometheus Alert
- alert: HighRetryRate
  expr: notifications_avg_retries > 0.5
  for: 10m
  labels:
    severity: warning
  annotations:
    summary: "More than 50% of notifications require retries"
    description: "Average retries per notification: {{ $value }}"
```

### Low Success Rate Alert

```yaml
# Prometheus Alert
- alert: LowSuccessRate
  expr: 100 * (notifications_success_total / notifications_total) < 90
  for: 15m
  labels:
    severity: critical
  annotations:
    summary: "Notification success rate below 90%"
    description: "Current success rate: {{ $value }}%"
```

### High Failure Rate Alert

```yaml
# Prometheus Alert
- alert: HighFailureRate
  expr: 100 * (notifications_failure_total / notifications_total) > 10
  for: 10m
  labels:
    severity: critical
  annotations:
    summary: "Notification failure rate above 10%"
    description: "Current failure rate: {{ $value }}%"
```

---

## Log-Based Monitoring ⚠️

If using log aggregation (ELK, Splunk, Loki), **be careful** with these log messages:

```typescript
// ⚠️ This log appears on EVERY attempt (including retries)
logger.info('Notification delivered successfully', {
  id: notification.id,
  type: notification.notificationType,
  duration,
});
```

**Solution**: Filter by status transition logs instead:

```typescript
// ✅ This log appears only once per notification
logger.info('Notification marked as completed', { id });
```

**Splunk Query Example**:
```spl
index=notify-chain "Notification marked as completed"
| stats count as total_success
```

**Elasticsearch Query Example**:
```json
{
  "query": {
    "match": {
      "message": "Notification marked as completed"
    }
  },
  "aggs": {
    "total_success": {
      "value_count": {
        "field": "id"
      }
    }
  }
}
```

---

## Testing Your Integration

### 1. Create Test Notifications

```bash
# Create a notification that will succeed on first attempt
curl -X POST http://localhost:3000/api/schedule \
  -H "Content-Type: application/json" \
  -d '{
    "notificationType": "discord",
    "targetRecipient": "test-webhook",
    "executeAt": "2026-06-20T12:00:00Z",
    "maxRetries": 3,
    "payload": {
      "message": "Test notification"
    }
  }'
```

### 2. Verify Metrics

```bash
# Fetch metrics
curl http://localhost:3000/api/schedule/execution-metrics | jq

# Expected output structure:
# {
#   "totalNotifications": 1,
#   "successfulFirstAttempt": 1,
#   "successfulAfterRetry": 0,
#   "permanentFailures": 0,
#   "totalRetryAttempts": 0,
#   "averageRetriesPerNotification": 0,
#   "averageSuccessDurationMs": 750,
#   "averageFailureDurationMs": 0
# }
```

### 3. Simulate Retry Scenario

```bash
# Stop Discord service to force failures
# Then create notification - it will retry and eventually fail

curl -X POST http://localhost:3000/api/schedule \
  -H "Content-Type: application/json" \
  -d '{
    "notificationType": "discord",
    "targetRecipient": "invalid-webhook",
    "executeAt": "2026-06-20T12:00:00Z",
    "maxRetries": 2,
    "payload": {
      "message": "This will fail"
    }
  }'

# Wait for retries to complete (2-3 minutes)

# Check metrics again
curl http://localhost:3000/api/schedule/execution-metrics | jq

# Should show:
# {
#   "totalNotifications": 1,
#   "successfulFirstAttempt": 0,
#   "successfulAfterRetry": 0,
#   "permanentFailures": 1,  ← Counted once, not 3 times
#   "totalRetryAttempts": 2,
#   ...
# }
```

---

## Troubleshooting

### Issue: Metrics seem duplicated

**Symptom**: Seeing 3x or 2x the expected notification count

**Diagnosis**:
```bash
# Check raw execution log
sqlite3 listener.db "SELECT COUNT(*) FROM notification_execution_log;"
# vs
sqlite3 listener.db "SELECT COUNT(*) FROM scheduled_notifications WHERE status IN ('COMPLETED', 'FAILED');"
```

If the first number is much higher, you're likely counting raw logs instead of deduplicated metrics.

**Fix**: Use the API endpoint or deduplicated SQL query above.

### Issue: Metrics not updating

**Symptom**: Metrics API returns stale data

**Diagnosis**:
```bash
# Check if notifications are being processed
sqlite3 listener.db "SELECT status, COUNT(*) FROM scheduled_notifications GROUP BY status;"
```

**Fix**: Ensure scheduler is running and notifications are being marked as COMPLETED/FAILED.

### Issue: Different tools show different counts

**Symptom**: Prometheus shows 100 successes, Datadog shows 300

**Diagnosis**: One tool is counting raw logs, the other is using the API.

**Fix**: Standardize all integrations to use the `/api/schedule/execution-metrics` endpoint.

---

## Summary

| Approach | Deduplication | Recommended |
|----------|---------------|-------------|
| `/api/schedule/execution-metrics` | ✅ Yes | ✅ **Use This** |
| Custom SQL with CTE | ✅ Yes | ✅ OK if API unavailable |
| Direct `notification_execution_log` query | ❌ No | ❌ **Never use** |
| Log message counting | ❌ No | ❌ **Never use** |

**Golden Rule**: Always count notifications by their **final outcome**, not by individual retry attempts.
