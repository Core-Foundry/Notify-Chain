#!/usr/bin/env bash
# ==============================================================================
# NotifyChain Local Notification Pipeline Smoke Test Runner (Issue #723)
# ==============================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

echo "=== Running E2E Local Notification Smoke Test ==="
cd "${ROOT_DIR}/listener"

# Execute isolated Jest smoke test suite
npm run test:smoke

echo "✅ Smoke test completed successfully with zero external side-effects."
