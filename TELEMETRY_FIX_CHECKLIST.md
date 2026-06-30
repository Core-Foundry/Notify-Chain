# Telemetry Fix Verification Checklist

**Purpose**: Quick checklist to verify retry deduplication is working correctly  
**Estimated Time**: 30 minutes  
**Role**: Backend Engineer / SRE

---

## ✅ Pre-Flight Checks

### 1. Verify Fix is in Place
```bash
# Check that getExecutionMetrics() uses deduplication
grep -A 20 "getExecutionMetrics" listener/src/services/scheduled-notification-repository.ts

# Look for: MAX(execution_attempt) in the SQL query
# If not found, the fix is NOT implemented
```

**Expected**: SQL query with CTE using `MAX(execution_attempt)`  
**Status**: [ ] VERIFIED

---

### 2. Run Regression Tests
```bash
cd listener
npm test -- execution-metrics.test.ts
```

**Expected**: All 6 tests pass  
**Status**: [ ] PASSED

**If tests fail**:
- Check database schema is initialized
- Check SQLite3 is installed: `npm list sqlite3`
- Review test output for specific errors

---

### 3. Verify API Endpoint
```bash
# Start the listener service
npm run dev

# In another terminal, check the endpoint exists
curl http://localhost:3000/api/schedule/execution-metrics
```

**Expected**: JSON response with these fields:
```json
{
  "totalNotifications": <number>,
  "successfulFirstAttempt": <number>,
  "successfulAfterRetry": <number>,
  "permanentFailures": <number>,
  "totalRetryAttempts": <number>,
  "averageRetriesPerNotification": <number>,
  "averageSuccessDurationMs": <number>,
  "averageFailureDurationMs": <number>
}
```

**Status**: [ ] VERIFIED

---

## 🔍 External System Audit

### 4. Check Prometheus Configuration

**Location**: `prometheus.yml` or Prometheus config

**Look for**:
```yaml
scrape_configs:
  - job_name: 'notify-chain'
    metrics_path: '/metrics'  # or any direct database query
```

**Action Required**:
- [ ] If using `/metrics`, verify it uses `getExecutionMetrics()` internally
- [ ] If querying database directly, **CHANGE** to use API endpoint
- [ ] Add scrape endpoint: `/api/schedule/execution-metrics`

**Status**: [ ] AUDITED

---

### 5. Check Datadog Integration

**Location**: `/etc/datadog-agent/checks.d/` or Datadog config

**Look for**:
```python
# BAD: Direct database query
query = "SELECT COUNT(*) FROM notification_execution_log WHERE status = 'SUCCESS'"

# GOOD: API endpoint
url = "http://localhost:3000/api/schedule/execution-metrics"
```

**Action Required**:
- [ ] If querying database, **REPLACE** with API call
- [ ] Use provided example in `docs/MONITORING_INTEGRATION.md`

**Status**: [ ] AUDITED

---

### 6. Check CloudWatch Lambda

**Location**: AWS Lambda functions publishing metrics

**Look for**:
```javascript
// BAD: Direct query
const query = "SELECT * FROM notification_execution_log";

// GOOD: API call
const metrics = await fetch('http://notify-chain:3000/api/schedule/execution-metrics');
```

**Action Required**:
- [ ] If querying database, **REPLACE** with API call
- [ ] Use provided Lambda example in `docs/MONITORING_INTEGRATION.md`

**Status**: [ ] AUDITED

---

### 7. Check Grafana Dashboards

**Location**: Grafana dashboard configs

**Look for**:
- Direct SQL queries in data sources
- Queries to `notification_execution_log` table

**Action Required**:
- [ ] Change data source to API endpoint
- [ ] Or replicate deduplication query (see docs)

**Status**: [ ] AUDITED

---

### 8. Check Log Aggregation (ELK/Splunk/Loki)

**Location**: Log parsing/counting queries

**Look for**:
```spl
# BAD: Counts every delivery log message
"Notification delivered successfully" | stats count

# GOOD: Counts state transition logs
"Notification marked as completed" | stats count
```

**Action Required**:
- [ ] Update log queries to count state transitions, not delivery attempts
- [ ] Or switch to using API endpoint

**Status**: [ ] AUDITED

---

## 🖥️ Dashboard Integration

### 9. Verify Dashboard Uses API

**Location**: `dashboard/src/services/eventsApi.ts`

**Check**:
```typescript
// Should have this method:
export const getExecutionMetrics = async () => {
  const response = await fetch('/api/schedule/execution-metrics');
  return await response.json();
};
```

**Status**: 
- [ ] Method exists
- [ ] Method is called by dashboard components
- [ ] NOT querying database directly

**If missing**:
```bash
# Add to dashboard/src/services/eventsApi.ts
```

---

### 10. Test Dashboard Displays Correct Counts

**Steps**:
1. Open dashboard in browser
2. Create test notification that will retry
3. Wait for retries to complete
4. Check dashboard counts

**Verify**:
- [ ] Success count matches API response
- [ ] Retry count is shown separately
- [ ] No inflation of totals

**Status**: [ ] VERIFIED

---

## 🧪 Integration Testing

### 11. Create Test Notification (Success on First Attempt)

```bash
curl -X POST http://localhost:3000/api/schedule \
  -H "Content-Type: application/json" \
  -d '{
    "notificationType": "discord",
    "targetRecipient": "valid-webhook-url",
    "executeAt": "2026-06-20T12:00:00Z",
    "maxRetries": 3,
    "payload": {"message": "Test immediate success"}
  }'

# Wait 1 minute, then check metrics
curl http://localhost:3000/api/schedule/execution-metrics | jq
```

**Expected**:
- `totalNotifications` increases by 1
- `successfulFirstAttempt` increases by 1
- `successfulAfterRetry` stays the same

**Status**: [ ] PASSED

---

### 12. Create Test Notification (Success After Retries)

```bash
# Use invalid webhook to force retries, then fix it
curl -X POST http://localhost:3000/api/schedule \
  -H "Content-Type: application/json" \
  -d '{
    "notificationType": "discord",
    "targetRecipient": "https://discord.com/api/webhooks/INVALID",
    "executeAt": "2026-06-20T12:00:00Z",
    "maxRetries": 2,
    "payload": {"message": "Test retry success"}
  }'

# Let it fail twice, then update webhook to valid URL and wait for success
```

**Expected**:
- `totalNotifications` increases by 1 (not 3)
- `successfulAfterRetry` increases by 1
- `totalRetryAttempts` increases by 2

**Status**: [ ] PASSED

---

### 13. Create Test Notification (Permanent Failure)

```bash
curl -X POST http://localhost:3000/api/schedule \
  -H "Content-Type: application/json" \
  -d '{
    "notificationType": "discord",
    "targetRecipient": "https://discord.com/api/webhooks/INVALID-PERMANENT",
    "executeAt": "2026-06-20T12:00:00Z",
    "maxRetries": 2,
    "payload": {"message": "Test permanent failure"}
  }'

# Wait for all retries to exhaust
curl http://localhost:3000/api/schedule/execution-metrics | jq
```

**Expected**:
- `totalNotifications` increases by 1 (not 3)
- `permanentFailures` increases by 1
- `totalRetryAttempts` increases by 2

**Status**: [ ] PASSED

---

## 📊 Metrics Validation

### 14. Compare Raw Logs vs. API Metrics

```bash
# Count raw execution log entries
sqlite3 listener.db "SELECT COUNT(*) FROM notification_execution_log;"

# Get deduplicated metrics
curl http://localhost:3000/api/schedule/execution-metrics | jq '.totalNotifications'

# The first number should be LARGER than the second
# (because raw logs include retries)
```

**Expected**: Raw log count > API totalNotifications  
**Status**: [ ] VERIFIED

---

### 15. Verify Success Rate Calculation

```bash
# Get metrics
curl http://localhost:3000/api/schedule/execution-metrics | jq

# Calculate success rate manually:
# success_rate = (successfulFirstAttempt + successfulAfterRetry) / totalNotifications * 100

# Should be between 0-100%
# Should NOT exceed 100% (would indicate double-counting)
```

**Expected**: Success rate ≤ 100%  
**Status**: [ ] VERIFIED

---

## 📝 Documentation

### 16. Update Team Documentation

**Required updates**:
- [ ] Add API endpoint to internal API documentation
- [ ] Document metrics schema (field meanings)
- [ ] Add monitoring setup guide link
- [ ] Document retry behavior

**Locations**:
- Internal wiki
- README.md
- API documentation (Swagger/OpenAPI)

**Status**: [ ] COMPLETED

---

### 17. Share Monitoring Guide with Team

**Action**:
- [ ] Share `docs/MONITORING_INTEGRATION.md` with DevOps team
- [ ] Schedule knowledge-sharing session
- [ ] Add to onboarding documentation

**Status**: [ ] COMPLETED

---

## 🚨 Alerting Setup

### 18. Configure High Retry Rate Alert

**Prometheus example**:
```yaml
- alert: HighRetryRate
  expr: notifications_avg_retries > 0.5
  for: 10m
  labels:
    severity: warning
  annotations:
    summary: "More than 50% of notifications require retries"
```

**Status**: [ ] CONFIGURED

---

### 19. Configure Low Success Rate Alert

**Prometheus example**:
```yaml
- alert: LowSuccessRate
  expr: 100 * (notifications_success_total / notifications_total) < 90
  for: 15m
  labels:
    severity: critical
  annotations:
    summary: "Notification success rate below 90%"
```

**Status**: [ ] CONFIGURED

---

## 📈 Historical Data

### 20. Audit Historical Metrics (If Applicable)

**Questions to answer**:
- [ ] Were historical metrics affected by double-counting?
- [ ] Do past reports need correction?
- [ ] Should we re-calculate historical success rates?

**Action**:
```bash
# Run deduplication query against historical data
sqlite3 listener.db < historical_metrics_query.sql
```

**Status**: [ ] AUDITED

---

## 🎯 Final Verification

### 21. End-to-End Test

**Scenario**: Create 10 notifications with mixed outcomes
- 4 immediate successes
- 3 successes after 1 retry
- 2 successes after 2 retries
- 1 permanent failure after 3 attempts

**Expected totals**:
- `totalNotifications`: 10
- `successfulFirstAttempt`: 4
- `successfulAfterRetry`: 5
- `permanentFailures`: 1
- `totalRetryAttempts`: 9 (3 + 4 + 2)

**Status**: [ ] PASSED

---

### 22. Sign-off

**Verification by**:
- [ ] Backend Engineer: _____________________ Date: _______
- [ ] SRE/DevOps: _____________________ Date: _______
- [ ] QA Engineer: _____________________ Date: _______

**Issues Found**: _________________________________________________

**Follow-up Required**: [ ] Yes [ ] No

**Notes**:
___________________________________________________________________
___________________________________________________________________
___________________________________________________________________

---

## 📞 Troubleshooting

**If metrics still show double-counting**:
1. Verify API endpoint is being used (check network traffic)
2. Check database query logs for direct `notification_execution_log` queries
3. Review Prometheus/Datadog configuration files
4. Check dashboard network requests (browser dev tools)
5. Confirm tests are passing

**If tests fail**:
1. Check database schema is properly initialized
2. Verify sqlite3 package is installed
3. Review error messages for specific table/column issues
4. Check file permissions on test database directory

**If API returns errors**:
1. Check application logs for database connection issues
2. Verify database file exists and is readable
3. Check for SQL syntax errors in logs
4. Confirm schema migrations have run

---

## 📚 Additional Resources

- **Detailed Analysis**: `TELEMETRY_BUG_ANALYSIS.md`
- **Monitoring Guide**: `docs/MONITORING_INTEGRATION.md`
- **Quick Summary**: `EXECUTIVE_SUMMARY.md`
- **Test Suite**: `listener/src/services/execution-metrics.test.ts`
- **Additional Tests**: `listener/src/services/retry-deduplication.test.ts`

---

**Checklist Complete**: _____ / 22 items verified  
**Ready for Production**: [ ] Yes [ ] No  
**Date Completed**: _________________
