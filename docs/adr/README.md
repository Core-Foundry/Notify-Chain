# Architecture Decision Records (ADR)

This directory contains Architecture Decision Records for NotifyChain. An ADR documents a significant architectural or technical decision, the context that led to it, the options considered, and the reasoning behind the chosen approach.

## Why ADRs?

ADRs give future contributors the *why* behind design choices, not just the *what*. When you read code and wonder "why was it built this way?", the relevant ADR should answer that question.

## How to Use This Directory

- **Reading an ADR**: Each record is self-contained. Start with the status and context, then read the decision and consequences.
- **Writing a new ADR**: Copy [`0000-template.md`](0000-template.md), increment the number, fill in all sections, and open a PR.
- **Superseding an ADR**: Mark the old ADR status as `Superseded by ADR-XXXX` and reference the new one.

## ADR Lifecycle

| Status | Meaning |
|--------|---------|
| `Proposed` | Under discussion — not yet accepted |
| `Accepted` | Agreed upon and actively guiding the project |
| `Superseded` | Replaced by a newer decision (link provided) |
| `Deprecated` | No longer relevant but kept for historical record |
| `Rejected` | Considered and explicitly declined |

## Index

| ADR | Title | Status |
|-----|-------|--------|
| [ADR-0001](0001-off-chain-listener-architecture.md) | Off-Chain Listener Architecture | Accepted |
| [ADR-0002](0002-soroban-smart-contracts.md) | Soroban Smart Contracts on Stellar | Accepted |
| [ADR-0003](0003-sqlite-for-local-persistence.md) | SQLite for Local Notification Persistence | Accepted |
| [ADR-0004](0004-typescript-for-listener-service.md) | TypeScript for Listener Service | Accepted |
| [ADR-0005](0005-event-deduplication-strategy.md) | Event Deduplication Strategy | Accepted |

---

New ADRs should be numbered sequentially. When in doubt, open a GitHub Discussion or tag a maintainer before writing a full ADR.
