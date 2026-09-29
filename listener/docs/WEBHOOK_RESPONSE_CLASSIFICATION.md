# Webhook Response Classification

Webhook deliveries are classified into exactly one of three categories by
`listener/src/services/webhook-response-classifier.ts`. That module is the single
source of truth for retry decisions; both the bounded retry helper
(`webhook-retry-helper.ts`) and the delivery service
(`webhook-delivery-service.ts`) defer to it so they can never disagree.

| Category    | Meaning                                                               | Retried?                                  |
| ----------- | --------------------------------------------------------------------- | ----------------------------------------- |
| `success`   | HTTP 2xx; the receiver accepted the payload.                          | No                                        |
| `retryable` | Transient failure (HTTP 429, any 5xx, network / timeout errors).      | Yes, within the bounded retry budget.     |
| `permanent` | Failure that will not change on retry (3xx redirects, other 4xx, 1xx). | No                                        |

## Status code rules

| HTTP status | Category    | Rationale                                  |
| ----------- | ----------- | ------------------------------------------ |
| 1xx         | `permanent` | Unexpected for a webhook POST.             |
| 200-299     | `success`   | Payload accepted.                          |
| 3xx         | `permanent` | Redirects are not followed for webhooks.   |
| 429         | `retryable` | Rate limited; back off and try again.      |
| Other 4xx   | `permanent` | Bad request, auth failure, not found, ...  |
| 5xx         | `retryable` | Server-side / transient.                   |

## Error rules

Network-level failures and request timeouts (`AbortError`) are classified as
`retryable`. Any unrecognised outcome defaults to `permanent`, so a bug can only
ever under-retry rather than loop forever.

## Usage

```ts
import { classifyWebhookStatus, classifyWebhookError } from './webhook-response-classifier';

const category = classifyWebhookStatus(response.status); // 'success' | 'retryable' | 'permanent'
const retryable = category === 'retryable';
```
