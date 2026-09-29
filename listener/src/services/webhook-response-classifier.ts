/**
 * Canonical classification of webhook delivery responses (issue #643).
 *
 * Every webhook attempt has exactly one of three outcomes:
 *
 *   - `success`   - the receiver accepted the payload (HTTP 2xx). Stop.
 *   - `retryable` - a transient failure worth another attempt: HTTP 429, any
 *                   5xx (500/502/503/504/...), and network / timeout errors.
 *   - `permanent` - a client error that will not change on retry: redirects
 *                   (3xx), other 4xx, and 1xx. Stop and surface the failure.
 *
 * Status -> category:
 *
 *   1xx       -> permanent (unexpected for a webhook POST)
 *   2xx       -> success
 *   3xx       -> permanent (redirects are not followed for webhooks)
 *   429       -> retryable (rate limited; back off and try again)
 *   other 4xx -> permanent (bad request, auth failure, not found, ...)
 *   5xx       -> retryable (server-side / transient)
 *
 * Network-level failures and timeouts (AbortError) are retryable; see
 * {@link classifyWebhookError}.
 *
 * This module is the single source of truth for retry decisions so the retry
 * helper and the delivery service can never disagree. It never mutates the
 * response and defaults anything unrecognised to `permanent`, so a bug can only
 * ever under-retry, never loop forever.
 */

export type WebhookResponseCategory = 'success' | 'retryable' | 'permanent';

/** Explicitly retryable status codes (5xx is covered by the generic 5xx rule). */
export const RETRYABLE_STATUS_CODES: ReadonlySet<number> = new Set([429, 500, 502, 503, 504]);

/** Permanent client-error status codes (never retried). */
export const PERMANENT_STATUS_CODES: ReadonlySet<number> = new Set([400, 401, 403, 404, 422]);

/**
 * Classify an HTTP status code into a webhook delivery category.
 *
 * @param status - HTTP response status code.
 * @returns The category that describes whether delivery succeeded, should be
 *          retried, or has permanently failed.
 */
export function classifyWebhookStatus(status: number): WebhookResponseCategory {
  if (status >= 200 && status < 300) {
    return 'success';
  }
  if (status === 429 || status >= 500) {
    return 'retryable';
  }
  return 'permanent';
}

/**
 * Classify a thrown webhook error.
 *
 * Network-level failures and request timeouts (AbortError) are transient and
 * therefore retryable; anything else is treated as a permanent failure.
 *
 * @param error - The error thrown by the webhook attempt, if any.
 * @returns `'retryable'` for any thrown failure, else `'permanent'`.
 */
export function classifyWebhookError(error: unknown): WebhookResponseCategory {
  return error ? 'retryable' : 'permanent';
}

/** True when the HTTP status code represents a retryable failure. */
export function isRetryableStatus(status: number): boolean {
  return classifyWebhookStatus(status) === 'retryable';
}
