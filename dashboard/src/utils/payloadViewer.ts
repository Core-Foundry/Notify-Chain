/**
 * Payload Viewer & Copy Utilities
 * Resolves Issue #609 — Add Raw Event Payload Viewer
 * Resolves Issue #610 — Add Event Payload Copy Action
 */

import { copyTextToClipboard } from './clipboard';

/**
 * List of property names considered sensitive configuration or security credentials.
 * Matching fields will be redacted in the raw JSON view to prevent credential leakage.
 */
const SENSITIVE_KEY_PATTERNS = [
  /api[_-]?key/i,
  /secret/i,
  /password/i,
  /private[_-]?key/i,
  /token/i,
  /auth(orization)?/i,
  /credential/i,
  /session/i,
  /cookie/i,
  /bearer/i,
];

/**
 * Recursively redacts sensitive configuration values from an object or array payload.
 */
export function sanitizePayload(data: unknown): unknown {
  if (data === null || data === undefined) {
    return data;
  }

  if (typeof data !== 'object') {
    return data;
  }

  if (Array.isArray(data)) {
    return data.map(sanitizePayload);
  }

  const sanitized: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(data as Record<string, unknown>)) {
    const isSensitive = SENSITIVE_KEY_PATTERNS.some((pattern) => pattern.test(key));
    if (isSensitive && typeof value === 'string') {
      sanitized[key] = '[REDACTED]';
    } else if (isSensitive && typeof value === 'number') {
      sanitized[key] = 0;
    } else if (isSensitive) {
      sanitized[key] = '[REDACTED]';
    } else {
      sanitized[key] = sanitizePayload(value);
    }
  }

  return sanitized;
}

export interface FormattedPayloadResult {
  /** The formatted string ready for rendering or copying */
  formatted: string;
  /** True if the original value was valid JSON */
  isValidJson: boolean;
  /** True if sensitive configuration fields were detected and redacted */
  hasRedactions: boolean;
}

/**
 * Parses and formats an event payload for display or clipboard copy.
 * Ensures invalid JSON payloads do not crash the UI (Issue #609).
 */
export function formatRawPayload(value: string | unknown): FormattedPayloadResult {
  if (value === null || value === undefined) {
    return { formatted: 'null', isValidJson: false, hasRedactions: false };
  }

  let parsed: unknown = value;
  let isValidJson = false;

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if ((trimmed.startsWith('{') && trimmed.endsWith('}')) || (trimmed.startsWith('[') && trimmed.endsWith(']'))) {
      try {
        parsed = JSON.parse(trimmed);
        isValidJson = true;
      } catch {
        isValidJson = false;
      }
    } else {
      // Check if primitive string can be parsed as JSON number/boolean
      try {
        parsed = JSON.parse(trimmed);
        isValidJson = typeof parsed === 'object' && parsed !== null;
      } catch {
        isValidJson = false;
      }
    }
  } else {
    isValidJson = typeof value === 'object';
  }

  if (isValidJson && parsed !== null) {
    const sanitized = sanitizePayload(parsed);
    const originalStr = JSON.stringify(parsed);
    const sanitizedStr = JSON.stringify(sanitized);
    const hasRedactions = originalStr !== sanitizedStr;

    try {
      const formatted = JSON.stringify(sanitized, null, 2);
      return { formatted, isValidJson: true, hasRedactions };
    } catch {
      return { formatted: String(value), isValidJson: false, hasRedactions: false };
    }
  }

  // Fallback for non-JSON string or invalid payloads
  return { formatted: String(value), isValidJson: false, hasRedactions: false };
}

export interface CopyPayloadResult {
  success: boolean;
  copiedText: string;
  isJson: boolean;
}

/**
 * Copies the event payload to the clipboard as valid formatted JSON where possible (Issue #610).
 * Handles clipboard errors gracefully without throwing.
 */
export async function copyPayloadToClipboard(value: string | unknown): Promise<CopyPayloadResult> {
  const { formatted, isValidJson } = formatRawPayload(value);

  try {
    const success = await copyTextToClipboard(formatted);
    return {
      success,
      copiedText: formatted,
      isJson: isValidJson,
    };
  } catch {
    return {
      success: false,
      copiedText: formatted,
      isJson: isValidJson,
    };
  }
}
