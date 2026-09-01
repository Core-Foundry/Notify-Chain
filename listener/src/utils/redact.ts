/**
 * Centralized log-redaction engine (#691).
 *
 * All structured log objects and error metadata pass through `redactObject`
 * before being written to any transport so that secrets never appear in logs.
 *
 * ## What gets redacted
 *
 * - **Key-based redaction** – any object key that matches a name in
 *   `SENSITIVE_KEYS` (case-insensitive, partial-match) has its value replaced
 *   with `"[REDACTED]"`.
 * - **URL credential redaction** – string values that contain HTTP(S) URLs
 *   with embedded credentials (`user:pass@host`) have the credential segment
 *   replaced with `[REDACTED]@`.
 * - **Bearer / token header redaction** – string values that look like
 *   `Bearer <token>` or `Token <value>` have the token portion replaced.
 * - **Nested objects & arrays** – redaction recurses into nested objects and
 *   array elements so deeply-nested secrets are also masked.
 *
 * ## Design principles
 *
 * - **Zero-leak guarantee**: matching keys are always replaced; the original
 *   value is never logged, even partially.
 * - **Non-destructive**: the original object is never mutated; a redacted
 *   copy is returned.
 * - **Safe for production**: plain string messages are returned unchanged
 *   unless they contain URL credentials or auth-header patterns.
 */

/** Replacement sentinel used for every redacted value. */
export const REDACTED_PLACEHOLDER = '[REDACTED]';

/**
 * Key fragments that trigger value redaction (case-insensitive, substring
 * match).  Add new entries here to extend the redaction policy; no other
 * file needs to change.
 */
export const SENSITIVE_KEYS: ReadonlyArray<string> = [
  'password',
  'passwd',
  'secret',
  'apikey',
  'api_key',
  'apitoken',
  'api_token',
  'token',
  'authorization',
  'auth',
  'credential',
  'privatekey',
  'private_key',
  'signingkey',
  'signing_key',
  'webhookurl',
  'webhook_url',
  'webhooktoken',
  'webhook_token',
  'accesstoken',
  'access_token',
  'refreshtoken',
  'refresh_token',
  'clientsecret',
  'client_secret',
  'encryptionkey',
  'encryption_key',
  'hmac',
  'jwt',
  'bearertoken',
  'bearer_token',
  'cookie',
  'sessionid',
  'session_id',
  'discordwebhookurl',
  'discord_webhook_url',
  'whsec',
];

// Regex for HTTP(S) URLs with embedded credentials: https://user:pass@host
const URL_CREDENTIALS_RE = /(https?:\/\/)[^:/?#\s]+:[^@\s]+@/gi;

// Regex for Authorization / Bearer / Token header values
const BEARER_HEADER_RE = /\b(bearer|token)\s+\S+/gi;

/**
 * Return `true` when the given object key name should be redacted.
 *
 * Matching is case-insensitive and checks whether any sensitive fragment is
 * contained within the normalized key name so that both `webhookUrl` and
 * `DISCORD_WEBHOOK_URL` are caught.
 */
export function isSensitiveKey(key: string): boolean {
  const normalized = key.toLowerCase().replace(/[-_\s]/g, '');
  return SENSITIVE_KEYS.some((fragment) => {
    const normalizedFragment = fragment.toLowerCase().replace(/[-_\s]/g, '');
    return normalized.includes(normalizedFragment);
  });
}

/**
 * Redact credential patterns from a plain string value:
 *   - URL-embedded credentials (`user:pass@host`)
 *   - Bearer / Token auth header values
 *
 * Returns the sanitized string or the original if no patterns match.
 */
export function redactString(value: string): string {
  let result = value;
  result = result.replace(URL_CREDENTIALS_RE, `$1${REDACTED_PLACEHOLDER}@`);
  result = result.replace(BEARER_HEADER_RE, `$1 ${REDACTED_PLACEHOLDER}`);
  return result;
}

/**
 * Recursively redact an arbitrary value.
 *
 * - Objects: keys matching `isSensitiveKey` have their values replaced with
 *   `REDACTED_PLACEHOLDER`; all other keys are recursed into.
 * - Arrays: each element is recursed into.
 * - Strings: run through `redactString` to catch URL credentials and auth
 *   header patterns.
 * - Everything else (number, boolean, null, undefined): returned as-is.
 *
 * The input is never mutated.
 */
export function redactValue(value: unknown): unknown {
  if (value === null || value === undefined) {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((item) => redactValue(item));
  }

  if (typeof value === 'object') {
    const redacted: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
      redacted[key] = isSensitiveKey(key) ? REDACTED_PLACEHOLDER : redactValue(val);
    }
    return redacted;
  }

  if (typeof value === 'string') {
    return redactString(value);
  }

  return value;
}

/**
 * Convenience wrapper that accepts a log-metadata object (or `undefined`) and
 * returns a fully redacted copy.  Pass the result directly to Winston.
 *
 * ```ts
 * logger.info('Webhook delivered', redactObject({ url, statusCode }));
 * ```
 */
export function redactObject<T extends Record<string, unknown>>(
  meta: T | undefined
): T | undefined {
  if (meta === undefined) {
    return undefined;
  }
  return redactValue(meta) as T;
}
