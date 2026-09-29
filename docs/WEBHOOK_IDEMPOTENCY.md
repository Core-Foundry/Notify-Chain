# Opt-in idempotent scheduled webhooks

This proposal extends scheduled webhook delivery for receivers that enforce a
durable idempotency contract. It does not make ordinary webhooks, Discord, email
or SMS exactly-once. It permits repeated HTTP attempts while preventing repeated
receiver-side business effects **under the contract below**.

## Sender setup

Register an opted-in provider in the registry shared by both schedulers:

```ts
const providers = new ProviderRegistry().register(
  new WebhookNotificationProvider({ receiverSupportsIdempotency: true }),
);

const scheduler = new NotificationScheduler(repository, schedulerConfig, discordService, undefined, providers);
const retries = new RetryScheduler(repository, retryConfig, discordService, undefined, providers);
```

The default is false and preserves ordinary webhook behavior. The application
does not enable the option automatically. Enable it only when **every destination
handled by this provider** implements the receiver contract. Mixed deployments
need a separately agreed per-destination routing policy before enabling it.
Every process sharing this queue must use the same provider policy, including
after restarts. Removing the opt-in or bypassing the registry loses protection.

Before the first send, the repository persists a random UUID in
`scheduled_notification_delivery_keys`, keyed by scheduled notification ID. Its
insert resolves concurrent requests for the same job to one stored value. This
operation uses a separate SQLite connection and returns only after its own
transaction commits. An existing write lock can make it fail with SQLITE_BUSY;
it must not send with an uncommitted or substitute key. The feature requires a
file-backed database, not an in-memory database. This
table is created for both new and existing databases without changing existing
notification columns. Retry, lock recovery and manual dead-letter requeue reuse
the key. Deleting a notification removes its key through a foreign-key cascade;
creating a new logical notification gets a new key even if its content is identical.

Both schedulers pass the stored value as `DeliveryPayload.deliveryKey`. An opted-in
webhook provider sends it as `Idempotency-Key`; a missing/invalid key prevents the
HTTP request. Do not put a shared Idempotency-Key in default headers. Failure to
persist the key prevents delivery; there is no transient-key fallback.

## Required receiver behavior

1. Scope the key to the authenticated sender and endpoint, and persist it with a
   fingerprint of the intended request. The key is not authentication.
2. Commit the business effect, receipt and result atomically. Serialize concurrent
   uses of the same key. A local receipt committed separately from another
   non-idempotent external side effect leaves the original crash window open.
3. On the same key and same request, return the previously committed successful
   result without repeating the business effect, including after receiver restart.
4. Reject reuse of the same key for different content (the test receiver uses HTTP 409).
   Do not acknowledge a failed/uncommitted effect as success.
5. Retain the receipt for the entire possible replay lifetime, including manual
   dead-letter retries and restored backups. There is no bounded replay lifetime
   in this repository, so a finite TTL cannot currently give a permanent guarantee.

Deployment must drain or explicitly reconcile old in-flight jobs first. A newly
introduced key cannot deduplicate an older request sent without that key. Payload
and destination must remain stable for retries of one logical notification.

## Verification

`scheduler-idempotency-crash.integration.test.ts` launches an actual sender child
process against a local HTTP receiver with a real SQLite receipt/effect table.
The sender terminates after the production webhook provider receives HTTP 200 but
before the scheduler writes COMPLETED. The test restarts the receiver, then runs
the retry scheduler in a fresh sender process against the same sender database.
It asserts two HTTP attempts with the same key, one durable business effect, and
no new attempt after a third sender restart. Conflicting request content is rejected.
Time is controlled to expire the sender lease; this is not production or power-loss
testing. The receiver fixture's database insert is its business effect; production
receivers must supply equivalent atomicity for their own effect.

`delivery-idempotency.integration.test.ts` checks persisted/concurrent identities,
distinct jobs, legacy database setup, dead-letter requeue, provider opt-in and
header validation. The original restart coverage remains in place. Existing
repository installation, typecheck and unrelated full-suite failures are separate
prerequisites and are not resolved by this proposal.
