# ADR-0002: Soroban Smart Contracts on Stellar

**Date:** 2024-01-15  
**Status:** Accepted  
**Deciders:** Core-Foundry maintainers

---

## Context

NotifyChain needs an on-chain layer to serve as the authoritative source of truth for events and state. The choice of smart contract platform determines the programming language, tooling, event model, and the developer experience for all contributors working on contracts.

---

## Decision Drivers

- The on-chain layer must emit structured, queryable events that the listener service can consume.
- Contracts must be auditable and trustless — logic should be transparent and verifiable.
- The platform should have a growing ecosystem and active maintenance.
- Rust is a strong preference among core contributors for safety and performance.
- The contract platform should support a rich event schema (not just simple logs).

---

## Options Considered

### Option A — Ethereum / EVM-compatible chain (Solidity)

Deploy contracts on Ethereum, Polygon, or a compatible L2 using Solidity.

**Pros:**
- Largest existing developer ecosystem and tooling (Hardhat, Foundry, etc.).
- Extensive documentation and community support.

**Cons:**
- Gas costs on Ethereum mainnet are prohibitive for frequent small transactions.
- Solidity lacks the memory safety guarantees of Rust.
- EVM chains were not the platform vision for this project.

---

### Option B — Soroban on Stellar (chosen)

Write contracts in Rust compiled to WebAssembly, deployed on Stellar's Soroban smart contract platform.

**Pros:**
- Rust provides strong type safety and memory safety at compile time.
- Soroban events are structured and queryable via the Stellar RPC — ideal for the listener service.
- Stellar's transaction fees are significantly lower than Ethereum.
- The Stellar SDK supports event subscription natively.
- Aligns with Stellar's growing focus on DeFi and dApp development.

**Cons:**
- Smaller ecosystem than EVM chains.
- Soroban is newer; some tooling is still maturing.
- Contributors unfamiliar with Rust face a steeper onboarding curve.

---

### Option C — NEAR Protocol (Rust)

Write contracts in Rust for the NEAR Protocol.

**Pros:**
- Also uses Rust, similar safety guarantees.
- Good developer tooling.

**Cons:**
- Not aligned with the project's Stellar-centric vision.
- Different event model from Soroban.

---

## Decision

> We will use **Option B** — Soroban smart contracts on Stellar, written in Rust.

Soroban's structured event model is a natural fit for the listener's event-polling architecture. Rust's safety guarantees reduce the risk of contract bugs. The lower transaction fees on Stellar make the system more accessible for frequent interactions (task creation, payments, submissions).

---

## Consequences

### Positive

- Contracts are written in Rust, benefiting from compile-time correctness checks.
- Soroban events map cleanly to the listener's event schema.
- The `stellar-cli` toolchain enables reproducible local builds and testnet deployments.
- Contributors learn Rust and Soroban, which have strong demand in the blockchain ecosystem.

### Negative / Trade-offs

- Contributors must install Rust and the `wasm32-unknown-unknown` target to work on contracts.
- The Soroban ecosystem is less mature than EVM; some patterns require custom implementation.
- Cross-contract calls have limitations compared to EVM chains.

### Neutral / Notes

- Both the AutoShare contract (`contract/contracts/hello-world/`) and the TaskBounty contract (`Documents/Task Bounty/`) use this approach.
- The `stellar contract build` command handles the WebAssembly compilation target automatically.

---

## Links

- Local development guide: [`LOCAL_DEVELOPMENT.md`](../../LOCAL_DEVELOPMENT.md)
- AutoShare contract: [`contract/contracts/hello-world/src/`](../../contract/contracts/hello-world/src/)
- TaskBounty contract: [`Documents/Task Bounty/src/`](../../Documents/Task%20Bounty/src/)
- Contract event reference: [`CONTRACT_EVENT_REFERENCE.md`](../../CONTRACT_EVENT_REFERENCE.md)
- Stellar Soroban docs: https://developers.stellar.org/docs/build/smart-contracts
