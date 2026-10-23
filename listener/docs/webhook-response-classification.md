# Webhook response classification

Webhook delivery outcomes are classified by
`listener/src/services/webhook-retry-helper.ts` so retries use one rule set.
The classification is exercised by
`listener/src/services/webhook-retry-helper.test.ts`.

| Outcome | HTTP response / error | Retried? |
| ------- | --------------------- | -------- |
| Success | Any `2xx` | No |
| Retryable | `408`, `425`, `429`, any `5xx`, request timeout, network error | Yes, bounded |
| Permanent | `400`, `401`, `403`, `404`, `410`, `422`, other `4xx`, `1xx`, `3xx` | No |

## Rules

1. A response with a `2xx` status is a success.
2. `408`, `425`, `429`, and every `5xx` status are retryable.
3. Timeouts and network-level failures are retryable.
4. Explicit permanent client errors (`400`, `401`, `403`, `404`, `410`, `422`)
   and any other non-retryable status are permanent.
5. Retries are bounded to the initial attempt plus two retries (`MAX_RETRY_ATTEMPTS`)
   with a fixed delay (`RETRY_DELAY_MS`), so a permanent failure cannot loop
   indefinitely.
6. A response that is neither successful nor explicitly retryable defaults to
   permanent. An unknown classification therefore under-retries rather than
   retrying forever.

The delivery path and the retry helper both call `classifyWebhookFailure`, so
changing a status code here changes both consistently.
