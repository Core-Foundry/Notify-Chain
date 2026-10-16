# Batch Subscribe Gas Notes

## Overview

`batch_subscribe(channel_ids, subscriber)` lets a user subscribe to many
notification channels in **one transaction**. Individual channel failures
(missing channel, inactive channel, already subscribed) are skipped; they do
**not** roll back successful subscriptions or leave partial/corrupt state for
the failed ids.

## Why batching saves gas

| Cost component | N individual `subscribe` txs | 1 `batch_subscribe` tx |
|---|---|---|
| Transaction base fee | N × base | 1 × base |
| Auth / signature overhead | N | 1 |
| Contract invocation overhead | N | 1 |
| Per-channel storage writes | N | N (same) |
| Summary event | N × ChannelSubscribed | N × ChannelSubscribed + 1 × BatchSubscribeCompleted |

**Takeaway:** storage work still scales with N, but you avoid repeating the
transaction envelope, auth, and invocation overhead N times. For typical
batches of 5–20 channels this is a measurable wallet-fee win.

## Limits

- Minimum batch size: **1**
- Maximum batch size: **50** (`MAX_BATCH_SUBSCRIBE`)
- Empty batches and oversized batches abort **before** any state mutation

## Failure semantics (no state corruption)

1. Structural errors (`InvalidInput`, `BatchTooLarge`, `ContractPaused`) →
   entire call reverts; no subscriptions written.
2. Per-channel errors → counted in `failed`, skipped; successful channels keep
   their new subscription and updated `subscriber_count`.

## Benchmark guidance

When measuring on a local/testnet network:

1. Create K channels once.
2. Measure gas for K separate `subscribe` calls (sum of fee charged).
3. Measure gas for one `batch_subscribe` of the same K ids (fresh subscriber).
4. Record `gas_saved ≈ sum(individual) - batch`.

Expected: batch < sum(individual) for K ≥ 2, with savings growing roughly
linearly with K due to avoided base fees.
