import http from 'http';

/**
 * Standard API error response shape used by all endpoints.
 */
export interface ApiErrorBody {
  error: string;
}

/**
 * Write a JSON error response with a consistent `{ error }` shape.
 * This is the single place where error responses are serialised and sent —
 * all route handlers call this instead of writing inline.
 *
 * @param res     - The outgoing HTTP response object.
 * @param status  - HTTP status code (e.g. 400, 404, 500).
 * @param message - Human-readable error description.
 */
export function sendError(
  res: http.ServerResponse,
  status: number,
  message: string,
): void {
  const body: ApiErrorBody = { error: message };
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

/**
 * A typed error class that carries an HTTP status code alongside its message.
 * Throw this anywhere in route logic; the top-level catch in each handler
 * can then forward it to `sendError` without an extra status-code lookup.
 *
 * @example
 *   throw new ApiError(404, 'Notification not found');
 */
export class ApiError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}
