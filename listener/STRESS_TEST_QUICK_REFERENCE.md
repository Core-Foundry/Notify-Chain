# Stress Test Quick Reference Card

## 🚀 Quick Commands

```bash
# Run all stress tests
npm run test:stress

# Generate benchmark report
npm run stress-test

# Run specific test
npm test -- src/__tests__/stress.test.ts -t "keyword"

# Verbose output
npm run test:stress -- --verbose

# Custom report path
npm run stress-test -- --report reports/custom.json
```

## 📊 Test Categories (7 Total)

| # | Test Name | Events | Concurrency | Duration | Target |
|---|-----------|--------|-------------|----------|--------|
| 1 | Concurrent 1k | 1,000 | 50 | ~30s | >50 eps |
| 2 | Sustained 5k | 5,000 | 100 | ~60s | >100 eps |
| 3 | Stability 10k | 10,000 | 100 | ~120s | <200MB Δ |
| 4 | Burst Traffic | 4,000 | 75 | ~60s | >75 eps |
| 5 | Priority Queue | 2,000 | 50 | ~60s | 50% high first |
| 6 | Deduplication | 3,000 | 75 | ~45s | 100% dup block |
| 7 | Discord Load | 500 | Parallel | ~30s | >50 eps |
| 8 | Error Recovery | 1,000 | 50 | ~90s | ≥95% success |

**Total**: ~24,500 events | ~15-25 minutes

## 🎯 Performance Targets

| Metric | Target | Critical |
|--------|--------|----------|
| Throughput | >100 eps | >50 eps |
| Avg Latency | <50ms | <100ms |
| P95 Latency | <100ms | <200ms |
| P99 Latency | <200ms | <500ms |
| Success Rate | >99% | >95% |
| Memory Δ | <200MB/10k | <500MB/10k |

**eps** = events per second

## 📈 Metrics Collected

### Throughput
- Events per second
- Total processing time
- Success/failure rates

### Latency
- Min, Max, Average
- P50 (Median)
- P95, P99 percentiles

### Resources
- Heap memory (used, total, delta)
- RSS (Resident Set Size)
- CPU time (user, system)

### Queue
- Queue size
- Active count
- Retry attempts

## 🤖 CI Integration

### Triggers
- ✅ PR to services/*
- ✅ Push to main/staging
- ✅ Nightly @ 2 AM UTC
- ✅ Manual dispatch

### Outputs
- Console summary
- JSON report artifact
- PR comment with results
- Performance comparison

## 🔍 Troubleshooting

### Test Timeout
```typescript
it('test', async () => {
  // ...
}, 120000); // Increase timeout
```

### Low Throughput
```typescript
maxConcurrency: 100,  // Increase
pollIntervalMs: 5,    // Decrease
baseDelayMs: 0,       // Minimize
```

### Memory Issues
- Check for leaks in services
- Verify deduplication working
- Review queue size limits
- Monitor cleanup logic

### High Failures
- Check external services
- Review retry config
- Verify mocks
- Check logs

## 📁 File Structure

```
listener/
├── src/
│   ├── __tests__/
│   │   └── stress.test.ts           # Main tests
│   ├── utils/
│   │   └── benchmark-utils.ts       # Metrics
│   └── scripts/
│       └── run-stress-tests.ts      # Runner
├── reports/
│   └── stress-test-report.json      # Results
├── STRESS_TESTS_README.md           # Quick start
└── STRESS_TEST_DOCUMENTATION.md     # Full docs

.github/workflows/
└── stress-tests.yml                 # CI workflow
```

## 🔧 Common Tasks

### Check Last Results
```bash
cat listener/reports/stress-test-report.json | jq '.summary'
```

### Compare with Baseline
```bash
diff <(jq '.summary.throughput' baseline.json) \
     <(jq '.summary.throughput' current.json)
```

### Update Baseline
```bash
cp reports/stress-test-report.json reports/stress-test-baseline.json
git add reports/stress-test-baseline.json
git commit -m "Update stress test baseline"
```

### Run Single Test
```bash
# By name
npm test -- stress.test.ts -t "1,000 concurrent"

# By category
npm test -- stress.test.ts -t "High-Volume"
npm test -- stress.test.ts -t "Deduplication"
npm test -- stress.test.ts -t "Priority"
```

## 💡 Tips

- Run `--runInBand` to prevent parallel execution
- Use `--verbose` for detailed output
- Check `reports/` for historical data
- Review CI artifacts for trends
- Update baselines after improvements
- Add `console.log` for debugging (will be visible)
- Use `jest.setTimeout()` for long tests
- Mock external services to avoid network issues

## 📊 Example Output

```
================================================================================
BENCHMARK REPORT: Test Name
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
================================================================================
```

## 🎓 Learn More

- 📖 [Quick Start](STRESS_TESTS_README.md)
- 📖 [Full Docs](STRESS_TEST_DOCUMENTATION.md)
- 📖 [Implementation](../STRESS_TEST_IMPLEMENTATION_SUMMARY.md)

## 🆘 Need Help?

1. Check logs: `npm test -- stress.test.ts --verbose`
2. Review metrics in `reports/stress-test-report.json`
3. Compare against baseline
4. Check CI workflow logs
5. Open issue with details

## ✅ Pre-PR Checklist

- [ ] Run `npm run test:stress` locally
- [ ] Review benchmark results
- [ ] Check no memory leaks (Δ < 200MB)
- [ ] Verify throughput > 100 eps
- [ ] Confirm success rate > 99%
- [ ] Generate and review report
- [ ] Update baseline if improved

---

**Last Updated**: 2024-01-15
**Version**: 1.0.0
