/**
 * Bounded retry helper for transient API failures.
 *
 * Wraps the sendWebhook function with automatic retry logic for
 * transient failures such as:
 *   - Network/connection errors
 *   - Timeout (AbortError)
 *   - HTTP 429 (Too Many Requests)
 *   - HTTP 500, 502, 503, 504 (Server errors)
 *
 * Permanent client errors (400, 401, 403, 404, 422) are NOT retried.
 *
 * Retry attempts are bounded by MAX_RETRY_ATTEMPTS to prevent infinite loops.
 * A delay is added between attempts to reduce load on failing services.
 */

import { sendWebhook, WebhookSendOptions } from './webhook-sender';

/** Maximum number of retry attempts (not counting the initial attempt). */
const MAX_RETRY_ATTEMPTS = 2;

/** Delay in milliseconds between retry attempts. */
const RETRY_DELAY_MS = 1000;

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
  // Network errors and timeouts are retryable
  if (error) {
    return true;
  }

  // Check HTTP status codes
  if (response) {
    // Success responses don't need retry
    if (response.ok) {
      return false;
    }

    // Permanent client errors should not be retried
    if (PERMANENT_CLIENT_ERRORS.has(response.status)) {
      return false;
    }

    // Explicit retryable status codes
    if (RETRYABLE_STATUS_CODES.has(response.status)) {
      return true;
    }

    // Any other 5xx error is retryable
    if (response.status >= 500) {
      return true;
    }

    // Other status codes (e.g., redirects, other 4xx) are not retried
    return false;
  }

  return false;
}

/**
 * Delay execution for the specified number of milliseconds.
 *
 * @param ms - Milliseconds to delay
 */
async function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Send a webhook with bounded retry logic for transient failures.
 *
 * Makes an initial attempt, then retries up to MAX_RETRY_ATTEMPTS times
 * if the failure is retryable. Adds a delay between attempts.
 *
 * @param url - Target webhook URL
 * @param payload - JSON-serializable payload
 * @param opts - Webhook send options (timeout, headers)
 * @returns Response object or throws the final error
 * @throws The last error encountered after all retry attempts are exhausted
 */
export async function sendWebhookWithRetry(
  url: string,
  payload: any,
  opts: WebhookSendOptions = {},
): Promise<Response> {
  let lastError: unknown;
  let lastResponse: Response | undefined;

  // Initial attempt + retry attempts
  const maxAttempts = 1 + MAX_RETRY_ATTEMPTS;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      const response = await sendWebhook(url, payload, opts);

      // Success case
      if (response.ok) {
        return response;
      }

      // Non-retryable failure (permanent client error)
      if (!isRetryable(response, undefined)) {
        return response;
      }

      // Retryable failure - store response and retry if attempts remain
      lastResponse = response;

      if (attempt < maxAttempts - 1) {
        await delay(RETRY_DELAY_MS);
      }
    } catch (error) {
      lastError = error;

      // If this was the last attempt, throw the error
      if (attempt === maxAttempts - 1) {
        throw error;
      }

      // Otherwise, delay and retry
      await delay(RETRY_DELAY_MS);
    }
  }

  // If we got here, we have a failed response (not an exception)
  // Return the last response
  if (lastResponse) {
    return lastResponse;
  }

  // This should not happen, but handle it gracefully
  throw lastError ?? new Error('All retry attempts failed');
}
