/**
 * Bounded retry helper for transient webhook API failures.
 *
 * Wraps `sendWebhook` with automatic retry logic for transient failures such
 * as network errors, timeouts, HTTP 429, and 5xx responses.  Permanent
 * client errors (400, 401, 403, 404, 422) are never retried.
 *
 * Backoff behavior is fully driven by the provider-independent
 * `RetryBackoffConfig` from `../utils/retry-backoff-config`.  Callers supply
 * an optional `partialBackoff` field inside `opts`; defaults are applied for
 * any omitted field, and the merged result is strictly validated (invalid
 * configs throw before any HTTP call is made).
 */

import { sendWebhook, WebhookSendOptions } from './webhook-sender';
import {
  PartialRetryBackoffConfig,
  RetryBackoffConfig,
  calculateBackoffDelayDeterministic,
  resolveRetryBackoffConfig,
} from '../utils/retry-backoff-config';

/**
 * Extended webhook send options: inherits all fields from the base
 * `WebhookSendOptions` and adds a provider-independent `backoff` field for
 * configuring retry behavior.
 */
export interface WebhookWithRetryOptions extends WebhookSendOptions {
  /**
   * Optional retry backoff configuration.  Any omitted field falls back to
   * the defaults from `RETRY_BACKOFF_DEFAULTS`; the final merged config is
   * strictly validated (throws on invalid values) before the first HTTP
   * attempt is made.
   */
  backoff?: PartialRetryBackoffConfig;
}

/**
 * HTTP status codes that are considered retryable (transient failures).
 */
const RETRYABLE_STATUS_CODES = new Set([429, 500, 502, 503, 504]);

/**
 * HTTP status codes that are permanent client errors (not retryable).
 */
const PERMANENT_CLIENT_ERRORS = new Set([400, 401, 403, 404, 422]);

/**
 * Determines if an error or response should trigger a retry.
 *
 * @param response - The HTTP response, if available
 * @param error - The error thrown, if any
 * @returns true if the failure is retryable
 */
function isRetryable(response?: Response, error?: unknown): boolean {
  if (error) return true;
  if (!response) return false;
  if (response.ok) return false;
  if (PERMANENT_CLIENT_ERRORS.has(response.status)) return false;
  if (RETRYABLE_STATUS_CODES.has(response.status)) return true;
  return response.status >= 500;
}

/**
 * Delay execution for the specified number of milliseconds.
 */
async function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Send a webhook with bounded, configurable retry logic for transient
 * failures.
 *
 * Makes an initial attempt, then retries up to `backoff.maxRetries`
 * additional times if the failure is retryable.  The delay before each
 * retry follows `calculateBackoffDelay` (exponential + optional jitter,
 * clamped to `backoff.maxDelayMs`).
 *
 * Permanent client errors and successful responses are returned immediately
 * without waiting for additional attempts.
 *
 * @param url - Target webhook URL
 * @param payload - JSON-serializable payload
 * @param opts - Extended webhook options, including an optional `backoff`
 *   block for provider-independent retry parameters.
 * @returns The final `Response` (whether success or permanent failure).
 * @throws The last encountered error *only* when all attempts end with an
 *   exception (e.g. DNS error, abort signal).  HTTP responses, even 5xx,
 *   are returned rather than thrown so callers can inspect status codes.
 */
export async function sendWebhookWithRetry(
  url: string,
  payload: any,
  opts: WebhookWithRetryOptions = {},
): Promise<Response> {
  // Validate + resolve backoff config eagerly (before any network call) so
  // configuration bugs surface immediately rather than on a transient retry.
  const { backoff: partialBackoff, ...sendOptions } = opts;
  const backoff: RetryBackoffConfig = resolveRetryBackoffConfig(partialBackoff);

  let lastError: unknown;
  let lastResponse: Response | undefined;

  // 1 initial attempt + N retries, where N = backoff.maxRetries
  const maxAttempts = 1 + backoff.maxRetries;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      const response = await sendWebhook(url, payload, sendOptions);

      if (response.ok) return response;
      if (!isRetryable(response, undefined)) return response;

      lastResponse = response;
      if (attempt < maxAttempts - 1) {
        // Use the deterministic (midpoint-jitter) variant so tests and
        // predictable callers get reproducible delays; the non-deterministic
        // calculator is used by the long-running async schedulers instead.
        await delay(calculateBackoffDelayDeterministic(attempt, backoff));
      }
    } catch (error) {
      lastError = error;
      if (attempt === maxAttempts - 1) {
        throw error;
      }
      await delay(calculateBackoffDelayDeterministic(attempt, backoff));
    }
  }

  if (lastResponse) return lastResponse;
  throw lastError ?? new Error('All retry attempts failed');
}
