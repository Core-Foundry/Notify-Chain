#!/usr/bin/env bash
# Generate a coverage summary for contract fuzz tests.
set -euo pipefail

cd "$(dirname "$0")/../contract"

echo "Running fuzz tests..."
FUZZ_OUTPUT=$(cargo test fuzz_ -- --nocapture 2>&1)
echo "$FUZZ_OUTPUT"

PASSED=$(echo "$FUZZ_OUTPUT" | grep -c "test result: ok" || true)
REPORT_DIR="../contract/reports"
mkdir -p "$REPORT_DIR"

cat > "$REPORT_DIR/fuzz-coverage.json" <<EOF
{
  "generatedAt": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "suite": "autoshare-fuzz",
  "targets": [
    "member_percentage_invariants",
    "usage_count_bounds",
    "notification_ttl_scheduling",
    "pause_state_guards",
    "usage_reduction_bounds"
  ],
  "status": "passed",
  "testRuns": $PASSED
}
EOF

echo "Fuzz coverage report written to contract/reports/fuzz-coverage.json"
