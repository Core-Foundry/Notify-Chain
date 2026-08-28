import { randomUUID } from 'crypto';
import type { IncomingMessage, ServerResponse } from 'http';

/**
 * Generates a short, unique request identifier for tracing a single poll cycle
 * or API request through the notification pipeline.
 */
export function generateRequestId(): string {
  return randomUUID().split('-')[0];
}

/**
 * Generates a non-sensitive identifier for tracing one notification workflow.
 */
export function generateCorrelationId(): string {
  return randomUUID();
}

/**
 * Resolves a correlation ID for a request.
 * Honours an incoming X-Correlation-Id header if present, otherwise generates a new UUID.
 */
export function resolveCorrelationId(incomingHeader: string | string[] | undefined): string {
  const incoming = Array.isArray(incomingHeader) ? incomingHeader[0] : incomingHeader;
  return incoming?.trim() || randomUUID();
}

export interface RequestContext {
  /** Short id minted fresh for this single request; never inherited from a caller. */
  requestId: string;
  /** Id used to trace a request across services; honours an inbound X-Correlation-Id header. */
  correlationId: string;
}

/**
 * Correlation-ID middleware for the events API server.
 *
 * Every incoming HTTP request is assigned a fresh `requestId`, and a
 * `correlationId` is resolved (reusing the caller's `X-Correlation-Id`
 * header when present, otherwise minting a new one). Both are echoed back
 * as `X-Request-Id` / `X-Correlation-Id` response headers so a caller can
 * correlate its request with the server's logs, and both should be passed
 * to every `logger` call made while handling that request.
 *
 * Call this once per request, before any routing logic runs.
 */
export function applyRequestContext(req: IncomingMessage, res: ServerResponse): RequestContext {
  const requestId = generateRequestId();
  const correlationId = resolveCorrelationId(req.headers['x-correlation-id']);
  res.setHeader('X-Request-Id', requestId);
  res.setHeader('X-Correlation-Id', correlationId);
  return { requestId, correlationId };
}
