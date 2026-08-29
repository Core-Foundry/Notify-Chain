# 📋 Contract Deployment Artifact Manifest Specification

This document defines the deployment manifest schema for NotifyChain's Soroban smart contracts across local, testnet, and production environments (Issue #716).

---

## 1. Motivation & Purpose

To ensure reproducible testing and seamless frontend/listener synchronization, contract deployments produce a deterministic JSON manifest (`deployments/deployment-manifest.json`) recording contract IDs, bytecode hashes, network RPC endpoints, and git commits.

---

## 2. Manifest Schema

```json
{
  "schema_version": "1.0.0",
  "contract": {
    "id": "<SOROBAN_CONTRACT_ID_C...>",
    "name": "notify-chain-events",
    "wasm_hash": "<SHA256_HEX_WASM_HASH>"
  },
  "network": {
    "name": "testnet",
    "rpc_url": "https://soroban-testnet.stellar.org",
    "passphrase": "Test SDF Network ; September 2015"
  },
  "deployment": {
    "deployer_public_key": "<STELLAR_PUBLIC_KEY_G...>",
    "timestamp": "2026-08-29T12:00:00.000Z",
    "git_commit": "<GIT_COMMIT_SHA>"
  }
}
```

---

## 3. Security Invariants

* **No Secret Keys**: Manifest generation strictly forbids and rejects Stellar secret keys (`S...`). Only public identifiers (`C...`, `G...`) and hashes are included.
* **Non-destructive Overwrites**: Manifests are committed per-environment to allow automated integration testing without manual parameter copying.

---

## 4. Usage

Generate deployment manifest from environment variables:

```bash
node scripts/generate-deployment-manifest.js
```
