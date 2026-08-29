# 🧪 End-to-End Local Notification Smoke Test Specification

This document details the lightweight smoke testing suite for NotifyChain (Issue #723), verifying the local notification pipeline from event ingestion through payload generation without external side-effects.

---

## 1. Scope & Isolation Guarantees

* **Event Ingestion**: Generates synthetic Soroban contract events (e.g. `transfer`, `task.created`) matching Stellar XDR schemas.
* **Pipeline Processing**: Normalizes event metadata, timestamps, and topics into the internal EventRegistry.
* **Notification Generation**: Constructs the structured notification model with ledger sequences and transaction hashes.
* **Zero External Calls**: Discord webhooks and external notification push endpoints are strictly mocked to prevent unintended traffic during automated CI runs.

---

## 2. Running the Smoke Test

### Using npm:
```bash
cd listener
npm run test:smoke
```

### Using the Bash Script:
```bash
chmod +x scripts/run-smoke-test.sh
./scripts/run-smoke-test.sh
```

---

## 3. CI Integration

The smoke test is designed to run in lightweight CI runners with deterministic sub-second execution.
