# ADR-0005: Event Deduplication Strategy

**Date:** 2024-04-22  
**Status:** Accepted  
**Deciders:** Core-Foundry maintainers

---

## Context

The listener polls the Stellar RPC for Soroban contract events on an interval. That polling loop delivers the same event more than once under several ordinary conditions:

- **Overlapping ledger ranges** — a poll window that re-reads a ledger already processed.
- **Retries after a transient RPC or network failure** — the request succeeded server-side but the response was lost.
- **Listener restarts** — the service resumes from a checkpoint that predates events it already handled.
- **Chain reorganisations** — an event is re-observed at a different ledger.

Every duplicate that reaches the delivery layer is a duplicate Discord message or webhook call to a real user. Notification delivery is not idempotent from the recipient's point of view, so the listener must suppress duplicates before dispatch.

The open question is *what identity means* for an event, and *where* that check lives.

---

## Decision Drivers

- Duplicate suppression must happen once, centrally — reimplementing it per channel guarantees drift (a driver already established in [ADR-0001](0001-off-chain-listener-architecture.md)).
- The check sits in the hot path of every polled event; it must be O(1) and allocation-light.
- Memory must be bounded — an unbounded set of seen events is a slow leak in a long-running service.
- Duplicates arriving far apart (hours later, after a reorg) are rarer and less costly than the near-term duplicates that polling produces constantly.
- The strategy must be observable: operators need to know how often it fires and whether it is over- or under-suppressing.

---

## Options Considered

### Option A — Compare raw event IDs in a plain `Set`

Store the raw `eventId` string for every event seen, and reject on membership.

**Pros:**
- Trivial to implement and reason about.
- No hashing cost.

**Cons:**
- Event IDs are not guaranteed unique *across* contracts; two contracts can collide on the same ID and the second event is silently dropped.
- Raw IDs are variable-length, making memory use per entry unpredictable.
- No natural expiry — the set grows without bound for the life of the process.

---

### Option B — Bounded fingerprint cache with a time window (chosen)

Hash `contractAddress:eventId` with SHA-256 into a fixed-width fingerprint, and keep fingerprints in a cache bounded by both a maximum entry count and a time window. Entries older than the window expire; when the cache is full, the oldest entry is evicted.

**Pros:**
- Namespacing by contract address eliminates the cross-contract collision in Option A.
- SHA-256 gives collision resistance and a uniform, fixed-width key regardless of event ID length.
- The dual bound (max size *and* time window) caps memory deterministically.
- Lookup and insert stay O(1) in the polling hot path.
- Naturally exposes metrics — accepted, skipped, evicted, expired, hit ratio.

**Cons:**
- Duplicates arriving after the window expires are not caught.
- Under sustained load the size cap can evict entries before their window elapses, opening a narrow re-delivery gap.
- In-memory only: the cache is empty after a restart, so events straddling a restart can re-deliver once.
- SHA-256 per event is a small but non-zero CPU cost.

---

### Option C — Persist every processed event ID in SQLite and query per event

Use the existing SQLite persistence layer ([ADR-0003](0003-sqlite-for-local-persistence.md)) as the deduplication index.

**Pros:**
- Survives restarts — no re-delivery window after a crash.
- Unbounded history; duplicates are caught no matter how late they arrive.

**Cons:**
- A synchronous disk read on every polled event, in the hot path.
- The index grows without bound and needs its own pruning policy — reintroducing the same expiry question one layer down.
- Couples deduplication to persistence being enabled, which is optional.

---

## Decision

> We will use **Option B** — a bounded SHA-256 fingerprint cache with a time window.

The duplicates the listener actually produces are overwhelmingly *near-term*: overlapping poll windows and immediate retries, all landing within seconds of each other. A time-windowed cache catches essentially all of them at O(1) cost with a hard memory ceiling. Option C's durability guarantee addresses the rarer restart case but pays a disk read on every event in the hot path and defers rather than solves the growth problem. Option A's cross-contract collision risk is disqualifying: silently dropping a legitimate notification is worse than occasionally sending a duplicate.

Defaults are a **10,000-entry** cache over a **60-second** window, both configurable via `NotificationDeduplicatorOptions`.

---

## Consequences

### Positive

- Deduplication lives in one place — `NotificationDeduplicator` — and every channel inherits it.
- Memory is bounded by construction; the service can run indefinitely without a dedup-driven leak.
- Fingerprints are namespaced per contract, so multi-contract deployments cannot collide.
- Metrics (`acceptedRequests`, `skippedDuplicates`, `evictedEntries`, `expiredEntries`, `hitRatio`) let operators tune the window against observed duplicate rates.

### Negative / Trade-offs

- Duplicates separated by more than the window are delivered again; the window is a tuning knob, not a guarantee.
- A restart clears the cache, so events in flight across the restart may deliver twice.
- High event volume can force size-based eviction before the time window elapses, shortening the effective window.

### Neutral / Notes

- `generateExtendedFingerprint()` additionally folds in `eventType` and `ledgerNumber`, for callers that must distinguish the same event re-observed at a different ledger after a reorg.
- Consumers that need exactly-once semantics should layer idempotency keys on top — see `listener/src/services/idempotency-key-service.ts`.
- Persisting fingerprints to SQLite to close the restart gap remains open follow-up work; it would complement, not replace, this cache.

---

## Links

- Deduplicator: [`listener/src/services/notification-deduplicator.ts`](../../listener/src/services/notification-deduplicator.ts)
- Deduplication service: [`listener/src/services/event-deduplication-service.ts`](../../listener/src/services/event-deduplication-service.ts)
- Event subscriber: [`listener/src/services/event-subscriber.ts`](../../listener/src/services/event-subscriber.ts)
- Idempotency keys: [`listener/src/services/idempotency-key-service.ts`](../../listener/src/services/idempotency-key-service.ts)
- Related: [ADR-0001](0001-off-chain-listener-architecture.md), [ADR-0003](0003-sqlite-for-local-persistence.md)
