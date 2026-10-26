#!/usr/bin/env bash
# ==============================================================================
# Automated Test Suite for Local Contract Deployment Script (Issue #715)
# ==============================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEPLOY_SCRIPT="${SCRIPT_DIR}/deploy-contract.sh"

echo "=== Running Contract Deployment Script Validation Tests ==="

# Test 1: Missing network parameter fails with clear message
echo -n "Test 1: Rejects missing --network: "
if ! "$DEPLOY_SCRIPT" >/dev/null 2>&1; then
    echo "✓ Passed"
else
    echo "✗ Failed"
    exit 1
fi

# Test 2: Invalid network parameter fails
echo -n "Test 2: Rejects invalid network name: "
if ! "$DEPLOY_SCRIPT" --network=invalid_net >/dev/null 2>&1; then
    echo "✓ Passed"
else
    echo "✗ Failed"
    exit 1
fi

# Test 3: Valid dry-run succeeds and identifies contract ID
echo -n "Test 3: Dry-run execution with local network: "
OUTPUT=$("$DEPLOY_SCRIPT" --network=local --dry-run)
if echo "$OUTPUT" | grep -q "Deployed Contract ID:"; then
    echo "✓ Passed"
else
    echo "✗ Failed"
    exit 1
fi

# Test 4: Verify secrets are not leaked in stdout
echo -n "Test 4: Ensures secrets are protected/redacted: "
TEST_SECRET="SBV657YJ5F4U5YF4O5U6Y7I8U9Y0U1I2O3P4I5U6Y7I8U9Y0U1I2O3P4"
OUTPUT=$(STELLAR_SECRET_KEY="$TEST_SECRET" "$DEPLOY_SCRIPT" --network=testnet --dry-run)
if ! echo "$OUTPUT" | grep -q "$TEST_SECRET"; then
    echo "✓ Passed"
else
    echo "✗ Failed (Secret leaked in output!)"
    exit 1
fi

echo "🎉 All deployment script validation tests passed successfully!"
