# NotifyChain Stress Test Documentation

## Overview

This document describes the comprehensive stress testing suite for NotifyChain's notification processing system. The tests evaluate system behavior under sustained, high-volume notification traffic to identify bottlenecks and ensure stability under heavy workloads.

## Test Coverage

### 1. High-Volume Concurrent Processing Tests

**Purpose**: Verify the system can handle large volumes of concurrent notification events efficiently.

#### Test: 1,000 Concurrent Events
- **Event Count**: 1,000
- **Max Concurrency**: 50
- **Expected Throughput**: >50 events/second
- **Expected P95 Latency**: <100ms
- **Purpose**: Validates basic concurrent processing capability

#### Test: 5,000 Events Sustained Load
- **Event Count**: 5,000
- **Max Concurrency**: 100
- **Expected Throughput**: >100 events/second
- **Expected P99 Latency**: <200ms
- **Purpose**: Ensures sustained throughput without degradation

### 2. Sustained Load Over Time Tests

#### Test: 10,000 Events System Stability
- **Event Count**: 10,000
- **Max Concurrency**: 100
- **Duration**: ~2-4 minutes
- **Expected Throughput**: >100 events/second
- **Expected Avg Latency**: <50ms
- **Memory Increase Limit**: <200MB
- **Purpose**: Validates system stability during extended load periods
- **Monitors**: Memory leaks, throughput consistency, latency stability

### 3. Burst Traffic Handling Tests

#### Test: Burst of 2,000 Events with Idle Period
- **Pattern**: 2,000 events → 2s idle → 2,000 events
- **Total Events**: 4,000
- **Max Concurrency**: 75
- **Expected Throughput**: >75 events/second
- **Purpose**: Tests system recovery and burst handling capability
- **Validates**: Queue management, backpressure handling, resource cleanup

### 4. Priority Queue Under Load Tests

#### Test: Priority Event Processing
- **High Priority**: 500 events
- **Medium Priority**: 1,000 events
- **Low Priority**: 500 events
- **Total Events**: 2,000
- **Max Concurrency**: 50
- **Expected Behavior**: >50% high-priority events in first 500 processed
- **Purpose**: Validates priority queue implementation under load

### 5. Deduplication Under Heavy Load Tests

#### Test: Deduplication with 50% Duplicates
- **Total Enqueued**: 3,000 events
- **Unique Events**: 1,500 (50% duplicates)
- **Max Concurrency**: 75
- **Expected Processed**: Exactly 1,500 unique events
- **Expected Throughput**: >100 events/second
- **Purpose**: Validates deduplication efficiency at scale

### 6. Discord Notification Service Under Load Tests

#### Test: 500 Discord Notifications
- **Event Count**: 500
- **Concurrency**: Parallel processing with Promise.all
- **With**: Deduplication enabled
- **Expected Success Rate**: 100%
- **Expected Throughput**: >50 notifications/second
- **Purpose**: Tests Discord integration under concurrent load

### 7. Error Recovery Under Stress Tests

#### Test: Graceful Failure Handling with Retries
- **Event Count**: 1,000
- **Simulated Failure Rate**: 20% (every 5th event)
- **Max Retries**: 3
- **Retry Base Delay**: 100ms
- **Expected Success Rate**: ≥95% after retries
- **Purpose**: Validates retry mechanism and error recovery

## Metrics Collected

### Throughput Metrics
- **Events/second**: Total events processed per second
- **Success rate**: Percentage of successfully processed events
- **Failure rate**: Percentage of failed events

### Latency Metrics
- **Min**: Minimum processing time
- **Max**: Maximum processing time
- **Avg**: Average processing time
- **P50**: 50th percentile (median)
- **P95**: 95th percentile
- **P99**: 99th percentile

### Resource Utilization Metrics
- **Heap Memory**: Before, after, and delta
- **RSS (Resident Set Size)**: Process memory usage
- **CPU Time**: User and system time

### Queue Metrics
- **Queue size**: Number of pending events
- **Active count**: Number of events being processed
- **Retry count**: Number of retry attempts

## Running the Tests

### Quick Run (All Tests)

```bash
cd listener
npm test -- src/__tests__/stress.test.ts
```

### Run with Verbose Output

```bash
npm test -- src/__tests__/stress.test.ts --verbose
```

### Run Specific Test Suite

```bash
npm test -- src/__tests__/stress.test.ts -t "High-Volume Concurrent Processing"
```

### Generate Benchmark Report

```bash
npm run stress-test
```

This will:
1. Execute all stress tests
2. Collect metrics
3. Generate a JSON report in `reports/stress-test-report.json`
4. Display summary in console

### Custom Report Path

```bash
npm run stress-test -- --report custom/path/report.json
```

## CI Integration

### GitHub Actions Workflow

The stress tests can be integrated into CI pipelines. Add to `.github/workflows/stress-tests.yml`:

```yaml
name: Stress Tests

on:
  pull_request:
    paths:
      - 'listener/src/services/**'
      - 'listener/src/__tests__/stress.test.ts'
  schedule:
    # Run nightly at 2 AM UTC
    - cron: '0 2 * * *'
  workflow_dispatch:

jobs:
  stress-tests:
    name: Run Stress Tests
    runs-on: ubuntu-latest
    timeout-minutes: 30
    
    steps:
      - uses: actions/checkout@v4
      
      - name: Setup Node
        uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: "npm"
          cache-dependency-path: listener/package-lock.json
      
      - name: Install dependencies
        working-directory: listener
        run: npm ci
      
      - name: Run stress tests
        working-directory: listener
        run: npm run stress-test
      
      - name: Upload stress test report
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: stress-test-report
          path: listener/reports/stress-test-report.json
          retention-days: 30
      
      - name: Comment PR with results
        if: github.event_name == 'pull_request'
        uses: actions/github-script@v6
        with:
          script: |
            const fs = require('fs');
            const report = JSON.parse(fs.readFileSync('listener/reports/stress-test-report.json', 'utf8'));
            
            const comment = `## 🔥 Stress Test Results
            
            **Summary:**
            - Total Tests: ${report.summary.totalTests}
            - Passed: ✅ ${report.summary.passed}
            - Failed: ❌ ${report.summary.failed}
            - Duration: ${(report.summary.totalDuration / 1000 / 60).toFixed(2)} minutes
            
            **Environment:**
            - Node: ${report.environment.nodeVersion}
            - Platform: ${report.environment.platform}
            - CPUs: ${report.environment.cpus}
            - Memory: ${report.environment.totalMemory}
            
            Full report available in artifacts.`;
            
            github.rest.issues.createComment({
              issue_number: context.issue.number,
              owner: context.repo.owner,
              repo: context.repo.repo,
              body: comment
            });
```

## Performance Benchmarks

### Baseline Performance Targets

Based on the stress tests, the system should maintain:

| Metric | Target | Critical Threshold |
|--------|--------|-------------------|
| Throughput | >100 events/sec | >50 events/sec |
| Average Latency | <50ms | <100ms |
| P95 Latency | <100ms | <200ms |
| P99 Latency | <200ms | <500ms |
| Memory Growth | <200MB per 10k events | <500MB per 10k events |
| Success Rate | >99% | >95% |

### Interpreting Results

#### Good Performance Indicators
✅ Throughput consistently above 100 events/second
✅ P95 latency under 100ms
✅ Linear memory growth
✅ 99%+ success rate
✅ Effective deduplication (no duplicate processing)
✅ Priority events processed first

#### Warning Signs
⚠️ Throughput dropping below 75 events/second
⚠️ P95 latency exceeding 150ms
⚠️ Memory growth exceeding 300MB per 10k events
⚠️ Success rate below 98%
⚠️ Increasing retry counts

#### Critical Issues
🚨 Throughput below 50 events/second
🚨 P95 latency exceeding 200ms
🚨 Memory growth exceeding 500MB per 10k events
🚨 Success rate below 95%
🚨 Process crashes or hangs
🚨 Deduplication failures

## Troubleshooting

### Test Timeouts

If tests timeout, check:
- System resources (CPU, memory)
- Network latency (for Discord tests)
- Database connection issues
- Increase timeout in test: `jest.setTimeout(120000)`

### Memory Issues

If memory usage is excessive:
- Check for memory leaks in services
- Verify deduplication is working
- Review queue size limits
- Monitor event cleanup

### Low Throughput

If throughput is below targets:
- Increase `maxConcurrency` setting
- Reduce `baseDelayMs` for retries
- Optimize event processing logic
- Check for blocking operations

### High Failure Rate

If failure rate is high:
- Check external service availability (Discord)
- Review retry configuration
- Examine error logs
- Verify test mocks are properly configured

## Extending the Tests

### Adding New Stress Tests

1. Create test in `src/__tests__/stress.test.ts`
2. Use `BenchmarkCollector` for metrics
3. Follow existing test patterns
4. Document expected behavior
5. Set appropriate timeouts

Example:

```typescript
describe('New Stress Test Category', () => {
  it('should handle specific scenario', async () => {
    const eventCount = 1000;
    const collector = new BenchmarkCollector('Test Name', eventCount);
    
    collector.start();
    
    // Your test logic here
    
    collector.end();
    const metrics = collector.getMetrics();
    printBenchmarkReport(metrics);
    
    // Assertions
    expect(metrics.successCount).toBe(eventCount);
    expect(metrics.throughput).toBeGreaterThan(100);
  }, 60000);
});
```

### Custom Metrics

To add custom metrics:

1. Extend `BenchmarkMetrics` interface in `benchmark-utils.ts`
2. Update `BenchmarkCollector` to collect new metrics
3. Modify `printBenchmarkReport` to display them

## Best Practices

### Test Isolation
- Each test should be independent
- Clean up resources after tests
- Use separate instances for each test
- Mock external dependencies

### Realistic Scenarios
- Simulate production-like event volumes
- Include realistic processing delays
- Test failure scenarios
- Vary event types and priorities

### Resource Management
- Monitor memory usage
- Track CPU utilization
- Clean up intervals and timers
- Close database connections

### Reproducibility
- Use consistent test data
- Set random seeds where applicable
- Document environmental dependencies
- Version control test configurations

## Maintenance

### Regular Review
- Run stress tests before major releases
- Compare results against baselines
- Update targets as system evolves
- Document performance regressions

### Continuous Monitoring
- Track trend over time
- Alert on significant degradation
- Archive historical results
- Update documentation

## Support

For questions or issues with stress tests:

1. Check existing test documentation
2. Review benchmark reports
3. Examine test logs
4. Open an issue with:
   - Test name
   - Expected vs actual results
   - Environment details
   - Relevant logs

## References

- [EventProcessingQueue Documentation](../src/services/event-processing-queue.ts)
- [Discord Notification Service](../src/services/discord-notification.ts)
- [Benchmark Utilities](../src/utils/benchmark-utils.ts)
- [Test Fixtures](../src/test-utils/notification-fixture-builder.ts)
