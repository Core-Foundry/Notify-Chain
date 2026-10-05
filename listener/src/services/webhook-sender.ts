export interface WebhookSendOptions {
  timeoutMs?: number;
  headers?: Record<string, string>;
}

/**
 * Classification of an outbound webhook failure.
 *
 * Kept deliberately coarse so that retry decisions and observability can tell
 * a request timeout apart from a generic network error or an HTTP-level
 * failure without string-matching error messages.
 */
export type WebhookFailureReason =
  | 'timeout'
  | 'network'
  | 'http_retryable'
  | 'http_permanent';

/**
 * True when `error` represents an aborted (timed-out) webhook request.
 *
 * `AbortController.abort()` surfaces as an `AbortError` under Node's `fetch`;
 * `TimeoutError` is accepted as well because some runtimes raise it for a
 * signal-driven timeout. Callers use this instead of comparing
 * `error.name === 'AbortError'` so a timeout stays distinguishable in one
 * place.
 */
export function isWebhookTimeoutError(error: unknown): boolean {
  return (
    error instanceof Error &&
    (error.name === 'AbortError' || error.name === 'TimeoutError')
  );
}

export async function sendWebhook(
  url: string,
  payload: any,
  opts: WebhookSendOptions = {},
): Promise<Response> {
  const timeoutMs = opts.timeoutMs ?? 5000;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(opts.headers ?? {}),
      },
      body: JSON.stringify(payload),
      signal: controller.signal as any,
    });
    return response;
  } finally {
    clearTimeout(timeoutId);
  }
}
