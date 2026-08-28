import { randomUUID } from 'crypto';

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
