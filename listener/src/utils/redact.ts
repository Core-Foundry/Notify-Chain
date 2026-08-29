/**
 * Sensitive Field Redaction Utility (Issue #691)
 *
 * Centralized redaction policy for credentials, webhook URLs, bearer tokens,
 * private keys, and authorization headers before emission to log transports.
 */

export const REDACTED_PLACEHOLDER = '[REDACTED]';

// Sensitive key names (case-insensitive substring match)
export const SENSITIVE_KEY_PATTERNS = [
  /password/i,
  /secret/i,
  /authorization/i,
  /auth_token/i,
  /bearer/i,
  /api[_-]?key/i,
  /private[_-]?key/i,
  /secret[_-]?key/i,
  /webhook[_-]?url/i,
  /access[_-]?token/i,
  /refresh[_-]?token/i,
];

// Regex patterns to redact sensitive values embedded inside strings
export const SENSITIVE_VALUE_REGEXES = [
  // Bearer tokens: Bearer <token>
  { regex: /Bearer\s+[A-Za-z0-9._~+/-]+=*/gi, replacement: 'Bearer [REDACTED]' },
  // Discord Webhook URLs: https://discord.com/api/webhooks/<id>/<token>
  {
    regex: /https:\/\/(?:discord|discordapp)\.com\/api\/webhooks\/\d+\/[A-Za-z0-9_-]+/gi,
    replacement: 'https://discord.com/api/webhooks/[REDACTED_WEBHOOK_URL]',
  },
  // Stellar secret keys (starts with S, 56 uppercase chars Base32)
  { regex: /\bS[A-Z2-7]{55}\b/g, replacement: 'S[REDACTED_STELLAR_SECRET_KEY]' },
  // Embedded basic auth credentials in URLs: http(s)://user:pass@host
  { regex: /https?:\/\/[^/:]+:([^/@]+)@/gi, replacement: 'https://[REDACTED_AUTH]@' },
];

/**
 * Checks whether a given object key is considered sensitive.
 */
export function isSensitiveKey(key: string): boolean {
  return SENSITIVE_KEY_PATTERNS.some((pattern) => pattern.test(key));
}

/**
 * Redacts known sensitive patterns inside arbitrary strings.
 */
export function redactString(str: string): string {
  let result = str;
  for (const { regex, replacement } of SENSITIVE_VALUE_REGEXES) {
    result = result.replace(regex, replacement);
  }
  return result;
}

/**
 * Recursively redacts sensitive keys and values from arbitrary objects/data.
 */
export function redactSensitiveData(data: unknown, seen = new WeakSet()): unknown {
  if (data === null || data === undefined) {
    return data;
  }

  if (typeof data === 'string') {
    return redactString(data);
  }

  if (typeof data === 'number' || typeof data === 'boolean') {
    return data;
  }

  if (typeof data === 'object') {
    // Avoid cyclic references
    if (seen.has(data)) {
      return '[Circular Reference]';
    }
    seen.add(data);

    if (Array.isArray(data)) {
      return data.map((item) => redactSensitiveData(item, seen));
    }

    if (data instanceof Error) {
      const copy: Record<string, unknown> = {
        name: data.name,
        message: redactString(data.message),
      };
      if (data.stack) {
        copy.stack = redactString(data.stack);
      }
      if ('cause' in data && data.cause !== undefined) {
        copy.cause = redactSensitiveData(data.cause, seen);
      }
      return copy;
    }

    const redactedObj: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(data)) {
      if (isSensitiveKey(key)) {
        redactedObj[key] = REDACTED_PLACEHOLDER;
      } else {
        redactedObj[key] = redactSensitiveData(value, seen);
      }
    }
    return redactedObj;
  }

  return data;
}
