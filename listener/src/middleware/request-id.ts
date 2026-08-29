/**
 * Request ID Middleware (Issue #686)
 *
 * Assigns or validates a unique request identifier (`X-Request-ID`) for every
 * incoming HTTP request. Ensures consistent traceability across logs and
 * includes the ID in HTTP response headers.
 */

import { IncomingMessage, ServerResponse } from 'http';
import { randomUUID } from 'crypto';

// Regex to validate client-supplied request IDs (alphanumeric, hyphens, underscores, length 1-64)
const VALID_REQUEST_ID_REGEX = /^[a-zA-Z0-9_-]{1,64}$/;

export interface RequestIdOptions {
  headerName?: string;
}

/**
 * Validates whether a client-provided request ID is safe to reuse.
 */
export function isValidRequestId(id: string | undefined): boolean {
  if (!id || typeof id !== 'string') return false;
  return VALID_REQUEST_ID_REGEX.test(id.trim());
}

/**
 * Extracts or generates a valid request ID from an incoming HTTP request.
 */
export function resolveRequestId(req: IncomingMessage, headerName = 'x-request-id'): string {
  const rawHeader = req.headers[headerName.toLowerCase()];
  const clientProvided = Array.isArray(rawHeader) ? rawHeader[0] : rawHeader;

  if (clientProvided && isValidRequestId(clientProvided)) {
    return clientProvided.trim();
  }

  return randomUUID();
}

/**
 * Request ID Middleware function for Node.js HTTP servers.
 */
export function attachRequestId(
  req: IncomingMessage,
  res: ServerResponse,
  headerName = 'X-Request-ID'
): string {
  const reqId = resolveRequestId(req, headerName);

  // Attach to request headers for downstream handler access
  req.headers['x-request-id'] = reqId;

  // Expose on response header
  if (!res.headersSent) {
    res.setHeader(headerName, reqId);
  }

  return reqId;
}
