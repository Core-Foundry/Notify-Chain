# 🎲 Synthetic Event Generator for Local Development

This document details the local event simulation and fixture generation utility for NotifyChain (Issue #699).

---

## 1. Overview

The synthetic event generator allows developers to generate schema-compliant Soroban contract events locally without depending on a live blockchain network or incurring testnet latency.

### Safety Guarantee:
External notification delivery (e.g. Discord, Webhooks) is **strictly disabled** by default to prevent accidental spam during development.

---

## 2. Usage

### Generate events via npm:
```bash
cd listener

# Generate 5 default synthetic events
npm run generate:events

# Generate custom count
npx ts-node src/scripts/generate-synthetic-events.ts --count=10
```

### Event Types Supported:
* `transfer`: Token payment operations.
* `task_created`: Task bounty lifecycle events.
* `bounty_awarded`: Point and settlement distributions.
