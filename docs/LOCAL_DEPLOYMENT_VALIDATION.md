# 🚀 Local Contract Deployment & Validation Guide

This document details the Soroban smart contract deployment validation script for NotifyChain (Issue #715).

---

## 1. Overview & Validation Rules

The deployment utility `scripts/deploy-contract.sh` guarantees deterministic, safe deployments with the following rules:

1. **Explicit Network Required**: Caller must specify `--network=local`, `--network=testnet`, or `--network=mainnet`. Defaulting implicitly is blocked to prevent accidental mainnet deployments.
2. **Actionable Missing Config Errors**: If required RPC parameters or deployer secrets are absent, the script outputs actionable remediation commands.
3. **Zero Secret Leakage**: `STELLAR_SECRET_KEY` and credentials are never printed to logs or standard output.
4. **Contract Identification**: Output clearly identifies the deployed Contract ID (`C...`), WASM bytecode hash, target network, and timestamp.

---

## 2. Usage Examples

### Validate Environment Prerequisites:
```bash
./scripts/deploy-contract.sh --network=local --validate-only
```

### Dry-run Simulation:
```bash
./scripts/deploy-contract.sh --network=testnet --dry-run
```

### Live Testnet Deployment:
```bash
export STELLAR_SECRET_KEY="S..."
./scripts/deploy-contract.sh --network=testnet
```

---

## 3. Automated Test Suite

Run the deployment validation test suite:

```bash
./scripts/deploy-contract.test.sh
```
