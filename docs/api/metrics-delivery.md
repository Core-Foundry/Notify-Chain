# GET /api/metrics/delivery

> **Issue #482** — Delivery statistics endpoint for monitoring notification performance.

Exposes a focused delivery-statistics report derived from the in-process
[`NotificationAnalyticsAggregator`](../../listener/src/services/notification-analytics-aggregator.ts).
The aggregator tracks every notification outcome (success, failure, retry, skipped) in a
memory-bounded rolling window (default: 10 000 records / 168 hourly buckets = 7 days).

---

## Request

```
GET /api/metrics/delivery
```

### Query parameters

| Parameter | Type   | Required | Default | Description |
|-----------|--------|----------|---------|-------------|
| `window`  | string | No       | `full`  | Restrict statistics to a recent time slice. Allowed values: `1h`, `6h`, `24h`, `7d`. When omitted the full rolling window is returned. |

### Headers

| Header | Required | Description |
|--------|----------|-------------|
| `X-Correlation-Id` | No | Propagated through the response as `X-Correlation-Id` for distributed tracing. |

### Example requests

```bash
# Full rolling window
curl http://localhost:3000/api/metrics/delivery

# Last 24 hours only
curl "http://localhost:3000/api/metrics/delivery?window=24h"

# Last hour — useful for alerting
curl "http://localhost:3000/api/metrics/delivery?window=1h"
```

---

## Response

**Status:** `200 OK`  
**Content-Type:** `application/json`

### Schema

```jsonc
{
  "meta": {
    "generatedAt":   "2024-01-15T12:00:00.000Z",  // ISO-8601 timestamp of this response
    "windowStart":   "2024-01-14T12:00:00.000Z",  // Inclusive start of the reporting window
    "windowEnd":     "2024-01-15T12:00:00.000Z",  // Exclusive end (≈ now)
    "windowParam":   "24h",                        // Effective window: "1h"|"6h"|"24h"|"7d"|"full"
    "totalRecorded": 128450                        // Lifetime records seen by the aggregator (incl. evicted)
  },
  "delivery": {
    "total":             10200,   // Total outcomes in the window
    "success":           10050,   // Delivered successfully
    "failure":             100,   // Terminal failures
    "retry":                40,   // Currently in retry queue
    "skipped":              10,   // Intentionally skipped (e.g. suppressed duplicates)
    "successRate":        0.9901, // success / (success + failure); 0–1
    "averageDurationMs":  142.3   // Mean delivery round-trip time in ms
  },
  "byType": [
    // Sorted by total (descending)
    {
      "notificationType": "DISCORD",
      "total":     5200,
      "success":   5150,
      "failure":     50,
      "successRate": 0.9904
    }
    // … one entry per notification type seen in the window
  ],
  "errorBreakdown": {
    // Top-N failure reasons (key = reason string, value = count)
    // "_other" key is added when more than topErrorsLimit reasons exist
    "network_timeout":    45,
    "invalid_recipient":  30,
    "rate_limited":       20,
    "_other":              5
  },
  "hourlyBuckets": [
    // One entry per hourly bucket within the window, oldest → newest
    {
      "bucketStart":      1705312800000,  // Unix ms — start of the hour
      "total":            430,
      "success":          425,
      "failure":            3,
      "retry":              2,
      "skipped":            0,
      "averageDurationMs": 138.7
    }
    // …
  ]
}
```

---

## Error responses

| Status | Condition | Body |
|--------|-----------|------|
| `400 Bad Request` | `window` query parameter has an unrecognised value | `{ "error": "Invalid window parameter. Allowed values: 1h, 6h, 24h, 7d" }` |
| `503 Service Unavailable` | Analytics aggregator not initialised | `{ "error": "Analytics aggregator unavailable" }` |

---

## Notes

- **No authentication required** by default. If the server is started with `apiKeys` configured, add `X-API-Key: <key>` to your request (same as other protected endpoints).
- **Rate limiting** applies to this endpoint (not exempt, unlike `/api/rate-limit/metrics`).
- **No side effects** — the endpoint is read-only and never resets the aggregator.
- **Performance** — the response is computed synchronously in O(N) over the rolling window (≤ 10 000 records by default). For high-throughput deployments consider reducing `maxRecords` in `AnalyticsConfig` to bound latency.
- **Related endpoints**
  - [`GET /api/analytics`](./analytics.md) — full aggregator snapshot (same data, wider scope)
  - [`GET /api/analytics/history`](./analytics-history.md) — persisted historical snapshots (requires `metricsStore`)
  - [`GET /api/schedule/stats`](./schedule-stats.md) — scheduler-level statistics
