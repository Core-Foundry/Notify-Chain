/**
 * Webhook response classification (issue #643).
 *
 * A single, documented rule set that maps an HTTP response (or a thrown
 * network error) into exactly one of three categories:
 *
 * | Category    | Signals                                                        | Retry? |
 * |-------------|----------------------------------------------------------------|--------|
 * | `success`   | HTTP 2xx                                                       | n/a    |
 * | `retryable` | network / timeout error; HTTP 408, 425, 429; any HTTP 5xx      | yes    |
 * | `permanent` | any other HTTP 4xx; 1xx/3xx; missing status with no error      | no     |
 *
 * Retryable means the same request may succeed later (transient). Permanent
 * means retrying cannot help without a change to the request, so it must not
 * be retried indefinitely.
 */

export type WebhookResponseClassification = 'success' | 'retryable' | 'permanent';

/**
 * Non-5xx status codes that are still transient and therefore retryable.
 *  - 408 Request Timeout
 *  - 425 Too Early
 *  - 429 Too Many Requests
 */
export const RETRYABLE_STATUS_CODES: ReadonlySet<number> = new Set([408, 425, 429]);

/** The signal available after one HTTP attempt. */
export interface WebhookResponseSignal {
  /** HTTP status code, or `undefined` when the request never got a response. */
  statusCode?: number;
  /** The thrown error, when the request failed before producing a response. */
  error?: unknown;
}

/**
 * Classify a single webhook attempt.
 *
 * A thrown error always means the attempt is retryable (network failure or
 * timeout). Otherwise the status code decides, per the table above.
 */
export function classifyWebhookResponse(
  signal: WebhookResponseSignal,
): WebhookResponseClassification {
  if (signal.error !== undefined && signal.error !== null) {
    return 'retryable';
  }

  const status = signal.statusCode;
  if (status === undefined || status === null) {
    // No response and no error: nothing to retry safely.
    return 'permanent';
  }

  if (status >= 200 && status < 300) {
    return 'success';
  }
  if (status >= 500) {
    return 'retryable';
  }
  if (RETRYABLE_STATUS_CODES.has(status)) {
    return 'retryable';
  }
  return 'permanent';
}

/** Convenience predicate for the common "should this be retried?" question. */
export function isRetryableClassification(
  classification: WebhookResponseClassification,
): boolean {
  return classification === 'retryable';
}
