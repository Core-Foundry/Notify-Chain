import { assertSafeWebhookDestination } from './webhook-destination-policy';

export interface WebhookSendOptions {
  timeoutMs?: number;
  headers?: Record<string, string>;
  /**
   * Re-resolve the destination and reject non-public addresses immediately
   * before delivery (#994). Defaults to `true`; set `false` only for
   * self-hosted receivers on a private network.
   */
  enforceDestinationPolicy?: boolean;
  /** Allow private destinations (self-hosted receivers). */
  allowPrivateDestination?: boolean;
  /** Injectable resolver, for tests. */
  resolveDestination?: (hostname: string) => Promise<string[]>;
  /**
   * How to treat HTTP redirects on the outbound webhook request (#995).
   *
   * Defaults to `'error'`: a redirect is a policy violation, not a normal
   * delivery outcome. The previous behaviour used the platform default
   * (`'follow'`), which let a receiver bounce the request to a destination the
   * sender never validated — a redirect to `http://169.254.169.254/…` or an
   * internal host would be sent with the payload and our signature headers.
   *
   * `'manual'` is offered for callers that want to observe the 3xx response
   * without following it.
   */
  redirect?: 'error' | 'manual';
}

/** Raised when an outbound webhook responds with a redirect. */
export class WebhookRedirectError extends Error {
  constructor(
    public readonly status: number,
    public readonly location: string | null,
  ) {
    super(
      `Webhook destination responded with redirect ${status}` +
        (location ? ` to ${location}` : '') +
        '; redirects are not followed (see #995).',
    );
    this.name = 'WebhookRedirectError';
  }
}

/**
 * True when `error` represents an outbound webhook redirect.
 */
export function isWebhookRedirectError(
  error: unknown,
): error is WebhookRedirectError {
  return error instanceof WebhookRedirectError;
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

  // Re-resolve immediately before delivery so a DNS answer that changed since
  // the URL was registered (DNS rebinding) cannot redirect us inward (#994).
  if (opts.enforceDestinationPolicy !== false) {
    await assertSafeWebhookDestination(url, {
      allowPrivate: opts.allowPrivateDestination,
      resolve: opts.resolveDestination,
    });
  }

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(opts.headers ?? {}),
      },
      body: JSON.stringify(payload),
      // Never follow a redirect: the receiver could otherwise bounce the
      // request (and our signature headers) to an unvalidated destination.
      // `'manual'` gives us the 3xx response so we can raise a typed error with
      // the status and Location instead of a generic network failure.
      redirect: 'manual',
      signal: controller.signal as any,
    });
    if (response.status >= 300 && response.status < 400) {
      throw new WebhookRedirectError(
        response.status,
        response.headers.get('location'),
      );
    }
    return response;
  } catch (error) {
    // Undici surfaces `redirect: 'error'` as a TypeError mentioning
    // "redirect"; normalise it so every redirect path throws the same type.
    if (
      !isWebhookRedirectError(error) &&
      error instanceof TypeError &&
      /redirect/i.test(error.message)
    ) {
      throw new WebhookRedirectError(0, null);
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}
