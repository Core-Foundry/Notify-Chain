/**
 * Request correlation IDs (#986).
 *
 * A correlation ID lets an operator tie together every log line and downstream
 * operation for one client request. Accepting a client-supplied ID is useful
 * (the client can correlate across its own systems) but dangerous if reused
 * verbatim: an unvalidated header value can inject newlines into logs, spoof
 * another request's ID, or blow up log size. This module generates a safe ID
 * and validates any client-provided one before reuse.
 */
import crypto from 'crypto';

/** Header a client may use to supply its own correlation ID. */
export const CORRELATION_ID_HEADER = 'x-correlation-id';

/** Response header echoing the effective correlation ID. */
export const CORRELATION_ID_RESPONSE_HEADER = 'x-correlation-id';

/**
 * Conservative allowlist: 8-128 characters of [A-Za-z0-9._:-]. This covers
 * UUIDs, trace IDs and W3C traceparent-style values while excluding
 * whitespace, newlines and control characters that could forge log entries.
 */
const CORRELATION_ID_RE = /^[A-Za-z0-9._:-]{8,128}$/;

/** Generate a fresh, safe correlation ID (UUID v4). */
export function generateCorrelationId(): string {
  return crypto.randomUUID();
}

/**
 * True when a client-supplied value is safe to reuse as a correlation ID.
 *
 * Rejects anything that is not a string, is the wrong length, or contains
 * characters outside the allowlist.
 */
export function isValidCorrelationId(value: unknown): value is string {
  return typeof value === 'string' && CORRELATION_ID_RE.test(value);
}

export type CorrelationIdSource = 'client' | 'generated';

export interface ResolvedCorrelationId {
  id: string;
  source: CorrelationIdSource;
}

/**
 * Resolve the effective correlation ID for a request.
 *
 * A valid client-supplied ID (from `x-correlation-id`) is reused; anything
 * invalid or absent is replaced with a freshly generated one. The source is
 * returned so callers can log/annotate which happened.
 */
export function resolveCorrelationId(
  headerValue: string | string[] | undefined,
): ResolvedCorrelationId {
  // Duplicate headers are ambiguous - never trust one over the other.
  if (Array.isArray(headerValue)) {
    return { id: generateCorrelationId(), source: 'generated' };
  }
  if (isValidCorrelationId(headerValue)) {
    return { id: headerValue, source: 'client' };
  }
  return { id: generateCorrelationId(), source: 'generated' };
}
