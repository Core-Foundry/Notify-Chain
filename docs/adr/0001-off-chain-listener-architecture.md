# ADR-0001: Off-Chain Listener Architecture

**Date:** 2024-01-15  
**Status:** Accepted  
**Deciders:** Core-Foundry maintainers

---

## Context

Soroban smart contracts on Stellar emit events when their state changes (e.g., a task is created, a payment is made). Applications and users need to react to these events in near real-time — for example, by sending Discord notifications, updating a dashboard, or triggering webhooks. 

The question is: how should event consumption and notification delivery be structured?

Options range from purely on-chain logic (cost-prohibitive for notification delivery) to pure off-chain polling, to event-driven architectures using dedicated relay infrastructure.

---

## Decision Drivers

- Soroban contracts cannot make outbound HTTP calls — external notifications must be off-chain.
- Polling the Stellar RPC from every client independently would be wasteful and error-prone.
- The system must support multiple downstream consumers (Discord, webhooks, dashboard) from a single event stream.
- The solution should be runnable locally by contributors with minimal infrastructure.
- Event deduplication must be handled somewhere to prevent duplicate notifications.

---

## Options Considered

### Option A — Each consumer polls the RPC directly

Every notification channel (Discord, dashboard, webhooks) independently polls the Stellar RPC endpoint for contract events.

**Pros:**
- No shared service to maintain.
- Each consumer is fully autonomous.

**Cons:**
- Duplicate RPC calls; each consumer re-fetches the same raw events.
- Deduplication must be reimplemented in every consumer.
- No central event log for debugging or replay.
- Harder to add new consumers without duplicating polling logic.

---

### Option B — Centralised off-chain listener service (chosen)

A single Node.js listener service polls the Stellar RPC, deduplicates events, stores them in an in-memory registry, and exposes them via an HTTP API. Notification channels (Discord, webhooks) and the dashboard all consume from this single service.

**Pros:**
- Single source of truth for event state.
- Deduplication logic lives in one place.
- Adding a new consumer (e.g., Slack, email) requires no RPC polling changes.
- The HTTP events API allows the dashboard and external tools to query history.
- Contributors can run everything locally with one service.

**Cons:**
- Single point of failure if the listener service goes down.
- In-memory storage means events are lost on restart (addressed by optional SQLite persistence).

---

### Option C — Managed event streaming platform (e.g., Kafka, SQS)

Route Stellar events through a managed streaming platform.

**Pros:**
- Battle-tested reliability and replay capabilities.
- Scales horizontally.

**Cons:**
- Significant operational overhead for an open-source project.
- Overkill for the current scale and contributor base.
- Creates a hard infrastructure dependency that blocks local development.

---

## Decision

> We will use **Option B** — a centralised off-chain listener service.

The listener service is the simplest design that satisfies all current requirements: it eliminates duplicate polling, centralises deduplication, and provides a stable API for all consumers. The single-point-of-failure risk is acceptable at current scale and can be addressed incrementally with persistence (SQLite) and health-check monitoring.

---

## Consequences

### Positive

- All event consumers share one polling connection to the Stellar RPC.
- The `/api/events` HTTP endpoint gives the dashboard and any future consumer a clean interface.
- Deduplication is implemented once in `NotificationDeduplicator`.
- The listener can be run standalone, making it easy to test and contribute to in isolation.

### Negative / Trade-offs

- Events held in memory are lost on listener restart unless SQLite persistence is enabled.
- A second deployment (listener + dashboard) is required for the full system.

### Neutral / Notes

- The listener's persistence layer (`listener/src/database/`) uses SQLite when `DATABASE_PATH` is configured, providing durability without external dependencies.
- Future work may add a replay endpoint to re-emit stored events to new consumers.

---

## Links

- Architecture diagram: [`SYSTEM_ARCHITECTURE.md`](../../SYSTEM_ARCHITECTURE.md)
- Listener source: [`listener/src/services/event-subscriber.ts`](../../listener/src/services/event-subscriber.ts)
- Deduplicator: [`listener/src/services/notification-deduplicator.ts`](../../listener/src/services/notification-deduplicator.ts)
