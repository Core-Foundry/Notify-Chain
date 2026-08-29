import { randomUUID } from 'crypto';
import type { IncomingMessage, ServerResponse } from 'http';

// Regex to validate client-supplied request/correlation IDs (alphanumeric, hyphens, underscores, length 1-64)
const VALID_ID_REGEX = /^[a-zA-Z0-9_-]{1,64}$/;

/**
 * Validates whether a client-provided request/correlation ID is safe to reuse.
 */
export function isValidRequestId(id: string | undefined): boolean {
  if (!id || typeof id !== 'string') return false;
  return VALID_ID_REGEX.test(id.trim());
}

/**
 * Generates a short, unique request identifier for tracing a single poll cycle
 * or API request through the notification pipeline.
 */
export function generateRequestId(): string {
  return randomUUID().split('-')[0];
}

/**
 * Resolves a request ID for an incoming request.
 * Validates and honours client-supplied X-Request-ID headers, otherwise generates a fresh ID.
 */
export function resolveRequestId(incomingHeader: string | string[] | undefined): string {
  const incoming = Array.isArray(incomingHeader) ? incomingHeader[0] : incomingHeader;
  if (incoming && isValidRequestId(incoming)) {
    return incoming.trim();
  }
  return generateRequestId();
}

/**
 * Resolves a correlation ID for a request.
 * Honours and validates an incoming X-Correlation-Id header if present, otherwise generates a new UUID.
 */
export function resolveCorrelationId(incomingHeader: string | string[] | undefined): string {
  const incoming = Array.isArray(incomingHeader) ? incomingHeader[0] : incomingHeader;
  if (incoming && isValidRequestId(incoming)) {
    return incoming.trim();
  }
  return randomUUID();
}

export interface RequestContext {
  /** Short id minted or validated for this single request. */
  requestId: string;
  /** Id used to trace a request across services; honours an inbound X-Correlation-Id header. */
  correlationId: string;
}

/**
 * Request ID & Correlation ID middleware for the events API server.
 *
 * Every incoming HTTP request resolves a validated `requestId` (reusing a valid
 * client-supplied `X-Request-ID` or generating a new one), and a `correlationId`.
 * Both are echoed back as `X-Request-ID` / `X-Correlation-ID` response headers.
 */
export function applyRequestContext(req: IncomingMessage, res: ServerResponse): RequestContext {
  const requestId = resolveRequestId(req.headers['x-request-id']);
  const correlationId = resolveCorrelationId(req.headers['x-correlation-id']);

  req.headers['x-request-id'] = requestId;
  req.headers['x-correlation-id'] = correlationId;

  if (!res.headersSent) {
    res.setHeader('X-Request-ID', requestId);
    res.setHeader('X-Correlation-ID', correlationId);
  }

  return { requestId, correlationId };
}
