# ADR-0004: TypeScript for Listener Service

**Date:** 2024-02-08  
**Status:** Accepted  
**Deciders:** Core-Foundry maintainers

---

## Context

The off-chain listener (see [ADR-0001](0001-off-chain-listener-architecture.md)) is the largest non-contract component in the project. It polls the Stellar RPC, normalises Soroban event payloads, deduplicates them, persists them, and exposes an HTTP API consumed by the dashboard and external integrators.

Soroban event payloads arrive as loosely-typed `ScVal` structures. They are converted into domain objects (`DisplayEvent`, `ScheduledNotification`, `NotificationTemplate`) that flow through many layers — subscriber, deduplicator, repository, HTTP handler — before reaching a consumer. A field renamed in one layer and missed in another produces a silent runtime failure that only shows up as a malformed notification in production.

The language choice for this service determines how much of that class of bug is caught before merge, and how approachable the codebase is to contributors.

---

## Decision Drivers

- Event payload shapes are the core domain model and change often as contracts evolve; renames must be caught mechanically, not by review.
- The dashboard is already a TypeScript React app — sharing type definitions across the boundary avoids drift.
- The Stellar SDK (`@stellar/stellar-sdk`) ships first-class TypeScript definitions.
- Contributors are frequently new to the project; editor autocomplete over domain types materially lowers the ramp-up cost.
- The project must stay runnable with `npm install && npm run dev` — no additional toolchain beyond Node.

---

## Options Considered

### Option A — Plain JavaScript (Node + JSDoc)

Write the listener in JavaScript, optionally annotating types via JSDoc comments.

**Pros:**
- No build step; `node src/index.js` runs directly.
- Lowest barrier for contributors unfamiliar with typed languages.
- No compiler configuration to maintain.

**Cons:**
- `ScVal` conversion errors surface only at runtime, typically as a malformed notification already delivered to a user.
- JSDoc annotations are advisory — nothing fails when they drift from reality.
- No shared type contract with the TypeScript dashboard; the HTTP response shape must be kept in sync by hand.
- Refactoring across the subscriber → store → API chain becomes grep-driven and error-prone.

---

### Option B — TypeScript (chosen)

Write the listener in TypeScript, compiled with `tsc`, with domain types centralised under `listener/src/types/`.

**Pros:**
- Event and notification shapes are enforced at compile time across every layer.
- `npm run typecheck` (`tsc --noEmit`) acts as a fast, dependency-free lint gate in CI.
- Domain types can be shared conceptually with the dashboard, which is already TypeScript.
- The Stellar SDK's bundled types make RPC and `ScVal` handling self-documenting.
- Editor autocomplete over `DisplayEvent`, `ScheduledNotification`, etc. speeds up onboarding.

**Cons:**
- Adds a compile step (`npm run build`) between source and `dist/`.
- `ts-node` in development is slower to start than plain `node`.
- Contributors unfamiliar with TypeScript face an initial learning curve.
- Type definitions for the loosely-typed `ScVal` boundary require deliberate care; `any` at that seam can give false confidence.

---

### Option C — Rust for the listener as well

Reuse the contract language for the off-chain service, giving the project a single language.

**Pros:**
- One language across contracts and services.
- Strongest compile-time guarantees and runtime performance.

**Cons:**
- Shrinks the contributor pool sharply — most web contributors can write TypeScript but not Rust.
- Notification-provider ecosystem (Discord, webhooks, templating) is far richer in the Node ecosystem.
- Rebuild-per-change cycle is significantly slower for an I/O-bound service where performance is not the constraint.
- The listener is I/O-bound on RPC polling and HTTP delivery; Rust's performance advantage is largely irrelevant here.

---

## Decision

> We will use **Option B** — TypeScript for the listener service.

The listener's dominant risk is *shape drift* in event payloads as contracts evolve, not throughput. TypeScript targets exactly that risk while keeping the service approachable to the web contributors who make up most of the project. Option C's guarantees are real but purchased at a contributor-pool cost the project cannot absorb, and the performance it buys does not apply to an I/O-bound service. Option A's simplicity is not worth shipping payload-shape bugs to users.

---

## Consequences

### Positive

- Domain types under `listener/src/types/` are a single source of truth for event and notification shapes.
- `npm run typecheck` catches cross-layer breakage before tests run, with no extra dependency.
- The dashboard and listener speak the same conceptual types across the HTTP boundary.
- New contributors get autocomplete-driven discovery of the domain model.

### Negative / Trade-offs

- A build step (`npm run build` → `dist/`) is required before `npm start`.
- Development startup via `ts-node` is measurably slower than plain Node.
- The `ScVal` → domain-object boundary still needs runtime validation; types alone do not make untrusted RPC input safe.

### Neutral / Notes

- `npm run lint` is currently aliased to `tsc --noEmit`; adding ESLint with typed rules remains open follow-up work.
- Contract code stays in Rust — this decision covers the listener service only (see [ADR-0002](0002-soroban-smart-contracts.md)).

---

## Links

- Listener entry point: [`listener/src/index.ts`](../../listener/src/index.ts)
- Domain types: [`listener/src/types/`](../../listener/src/types/)
- `ScVal` conversion: [`listener/src/utils/scval-format.ts`](../../listener/src/utils/scval-format.ts)
- Related: [ADR-0001](0001-off-chain-listener-architecture.md), [ADR-0002](0002-soroban-smart-contracts.md)
