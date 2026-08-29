# Stress Tests - Quick Start Guide

## Overview

Comprehensive stress testing suite for NotifyChain's notification processing system. These tests evaluate system behavior under sustained, high-volume traffic to identify bottlenecks and ensure stability.

## Quick Start

### Run All Stress Tests

```bash
cd listener
npm run test:stress
```

### Run with Benchmark Report

```bash
npm run stress-test
```

This generates a detailed JSON report in `reports/stress-test-report.json`.

### Run Specific Test

```bash
npm test -- src/__tests__/stress.test.ts -t "1,000 concurrent events"
```

## Test Suites

### 1. High-Volume Concurrent Processing
- ✅ 1,000 concurrent events
- ✅ 5,000 events sustained load

### 2. Sustained Load Over Time
- ✅ 10,000 events system stability test

### 3. Burst Traffic Handling
- ✅ Multiple bursts with idle periods

### 4. Priority Queue Under Load
- ✅ Mixed priority event processing

### 5. Deduplication Under Heavy Load
- ✅ 50% duplicate event handling

### 6. Discord Notification Service
- ✅ Concurrent notification delivery

### 7. Error Recovery Under Stress
- ✅ Graceful failure handling with retries

## Performance Targets

| Metric | Target | Critical |
|--------|--------|----------|
| Throughput | >100 events/sec | >50 events/sec |
| Avg Latency | <50ms | <100ms |
| P95 Latency | <100ms | <200ms |
| P99 Latency | <200ms | <500ms |
| Success Rate | >99% | >95% |
| Memory Growth | <200MB/10k events | <500MB/10k events |

## Interpreting Results

### Console Output

Each test displays:
```
================================================================================
STRESS TEST REPORT: Test Name
================================================================================
Events Processed:     1000
Success Count:        1000
Failure Count:        0
Total Time:           2500ms
Throughput:           400.00 events/second

Latency Statistics:
  Min:                1.23ms
  Max:                45.67ms
  Avg:                12.34ms
  P50 (Median):       10.50ms
  P95:                25.30ms
  P99:                38.20ms

Memory Usage:
  Before - Heap:      50.25 MB
  After - Heap:       75.50 MB
  Delta - Heap:       25.25 MB
  ...
================================================================================
```

### JSON Report Structure

```json
{
  "timestamp": "2024-01-15T12:00:00.000Z",
  "environment": {
    "nodeVersion": "v22.0.0",
    "platform": "linux 5.15.0",
    "cpus": 8,
    "totalMemory": "16.00 GB"
  },
  "testResults": [...],
  "summary": {
    "totalTests": 7,
    "passed": 7,
    "failed": 0,
    "totalDuration": 180000
  }
}
```

## CI Integration

Tests run automatically on:
- Pull requests affecting notification services
- Pushes to main/staging
- Nightly at 2 AM UTC
- Manual workflow dispatch

### View Results

1. Go to Actions tab in GitHub
2. Select "Stress Tests" workflow
3. Download artifacts for detailed reports
4. Check PR comments for summary

## Troubleshooting

### Test Timeouts

Increase timeout in test file:
```typescript
it('should handle load', async () => {
  // test code
}, 120000); // 120 seconds
```

### Memory Issues

Check for:
- Memory leaks in services
- Deduplication working correctly
- Queue size limits
- Event cleanup

### Low Throughput

Adjust configuration:
```typescript
const queue = new EventProcessingQueue(processor, {
  maxConcurrency: 100, // Increase
  pollIntervalMs: 5,   // Decrease
  baseDelayMs: 0,      // Minimize
});
```

### High Failure Rate

Verify:
- External services available
- Retry configuration correct
- Mocks properly configured
- Network connectivity

## Development

### Adding New Tests

1. Open `src/__tests__/stress.test.ts`
2. Add new test in appropriate describe block
3. Use helper functions for metrics
4. Set appropriate timeout
5. Document expected behavior

Example:
```typescript
it('should handle custom scenario', async () => {
  const eventCount = 1000;
  const processedIds: string[] = [];
  const latencies: number[] = [];
  
  // Setup processor
  const processor: EventProcessor = jest.fn()
    .mockImplementation(async (event) => {
      const start = Date.now();
      // Processing logic
      processedIds.push(event.id);
      latencies.push(Date.now() - start);
      return true;
    });
  
  // Setup queue
  const queue = new EventProcessingQueue(processor, {
    maxConcurrency: 50,
    pollIntervalMs: 5,
  });
  
  const memoryBefore = process.memoryUsage();
  const startTime = Date.now();
  
  // Enqueue events
  for (let i = 0; i < eventCount; i++) {
    const event = NotificationFixtureBuilder
      .aStellarEvent()
      .withId(`test-${i}`)
      .build();
    queue.enqueue(event, contractConfig);
  }
  
  queue.start();
  
  // Wait for completion
  while (processedIds.length < eventCount) {
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  
  const endTime = Date.now();
  const memoryAfter = process.memoryUsage();
  queue.stop();
  
  // Generate report
  const report = generateMetricsReport(
    'Custom Scenario',
    eventCount,
    startTime,
    endTime,
    processedIds.length,
    0,
    latencies,
    { before: memoryBefore, after: memoryAfter }
  );
  
  // Assertions
  expect(processedIds.length).toBe(eventCount);
  expect(report.throughput).toBeGreaterThan(100);
}, 60000);
```

### Using Benchmark Utils

```typescript
import { BenchmarkCollector, printBenchmarkReport } from '../utils/benchmark-utils';

const collector = new BenchmarkCollector('Test Name', 1000);

collector.start();

// Test execution
for (let i = 0; i < 1000; i++) {
  const latency = await processEvent();
  collector.recordLatency(latency);
  collector.recordSuccess();
}

collector.end();

const metrics = collector.getMetrics();
printBenchmarkReport(metrics);
```

## Best Practices

### Test Isolation
- ✅ Each test is independent
- ✅ Clean up resources (timers, queues)
- ✅ Use separate instances
- ✅ Mock external dependencies

### Realistic Scenarios
- ✅ Production-like volumes
- ✅ Realistic processing delays
- ✅ Include failure cases
- ✅ Test edge cases

### Resource Management
- ✅ Monitor memory usage
- ✅ Track CPU utilization
- ✅ Clean up after tests
- ✅ Close connections

### Reproducibility
- ✅ Consistent test data
- ✅ Documented dependencies
- ✅ Version control configs
- ✅ Seed random values

## Maintenance

### Before Major Releases
1. Run full stress test suite
2. Compare against baseline
3. Document any regressions
4. Update targets if needed

### Regular Reviews
- Weekly: Check CI results
- Monthly: Analyze trends
- Quarterly: Update baselines
- Yearly: Review test coverage

### Updating Baselines

After confirming performance improvements:
```bash
cp reports/stress-test-report.json reports/stress-test-baseline.json
git add reports/stress-test-baseline.json
git commit -m "Update stress test baseline"
```

## Support

### Documentation
- 📖 [Full Documentation](STRESS_TEST_DOCUMENTATION.md)
- 📖 [Benchmark Utils](src/utils/benchmark-utils.ts)
- 📖 [Test Fixtures](src/test-utils/notification-fixture-builder.ts)

### Getting Help
1. Check test logs
2. Review documentation
3. Compare with baseline
4. Open an issue with:
   - Test name
   - Expected vs actual
   - Environment details
   - Relevant logs

## FAQ

### Q: How long do stress tests take?
A: Full suite takes 15-25 minutes depending on hardware.

### Q: Can I run tests in parallel?
A: No, use `--runInBand` flag to prevent resource contention.

### Q: What if a test fails?
A: Check logs, compare metrics, verify environment, retry once.

### Q: How often should I run these?
A: Run locally before PRs, automatically in CI, nightly in CI.

### Q: Are external services needed?
A: No, external services are mocked for stress tests.

## Metrics Glossary

- **Throughput**: Events processed per second
- **Latency**: Time from enqueue to completion
- **P50/P95/P99**: Percentile latencies
- **Heap Used**: JavaScript heap memory
- **RSS**: Resident Set Size (total process memory)
- **Success Rate**: Percentage of successfully processed events
- **Deduplication Rate**: Percentage of duplicates blocked

## Examples

### Check if system handles 1000 concurrent events
```bash
npm test -- src/__tests__/stress.test.ts -t "1,000 concurrent"
```

### Verify deduplication efficiency
```bash
npm test -- src/__tests__/stress.test.ts -t "deduplication"
```

### Test priority queue behavior
```bash
npm test -- src/__tests__/stress.test.ts -t "priority"
```

### Full suite with detailed output
```bash
npm run test:stress -- --verbose
```

---

**Last Updated**: 2024-01-15
**Maintained By**: NotifyChain Team
**Version**: 1.0.0
