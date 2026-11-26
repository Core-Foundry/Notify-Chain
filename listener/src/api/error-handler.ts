import http from 'http';
import logger from '../utils/logger';
import { sendErr, sendJson, ErrorCode } from '../utils/response';
import { ValidationError } from '../utils/validation';
import { toPublicError, toInternalDiagnostic } from '../utils/safe-error-serializer';
import { NotificationAmplificationError } from '../utils/notification-amplification-guard';
import { redactString, redactValue } from '../utils/redact';

export class ApiError extends Error {
  public readonly statusCode: number;
  public readonly errorCode: string;
  public readonly details?: unknown;

  constructor(
    message: string,
    statusCode: number,
    errorCode: string = ErrorCode.INTERNAL_ERROR,
    details?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
    this.statusCode = statusCode;
    this.errorCode = errorCode;
    this.details = details;
  }

  static badRequest(message: string, details?: unknown): ApiError {
    return new ApiError(message, 400, ErrorCode.BAD_REQUEST, details);
  }

  static unauthorized(message: string): ApiError {
    return new ApiError(message, 401, ErrorCode.UNAUTHORIZED);
  }

  static invalidPermissions(
    message = 'The provided credentials lack the necessary scope for this action.',
    details?: unknown,
  ): ApiError {
    return new ApiError(message, 403, ErrorCode.INVALID_PERMISSIONS, details);
  }

  static notFound(message: string): ApiError {
    return new ApiError(message, 404, ErrorCode.NOT_FOUND);
  }

  static conflict(message: string): ApiError {
    return new ApiError(message, 409, ErrorCode.CONFLICT);
  }

  static unprocessable(message: string, details?: unknown): ApiError {
    return new ApiError(message, 422, ErrorCode.UNPROCESSABLE, details);
  }

  static payloadTooLarge(message: string, details?: unknown): ApiError {
    return new ApiError(message, 413, ErrorCode.PAYLOAD_TOO_LARGE, details);
  }

  static unsupportedMediaType(message: string, details?: unknown): ApiError {
    return new ApiError(message, 415, ErrorCode.UNSUPPORTED_MEDIA_TYPE, details);
  }

  static rateLimited(message: string): ApiError {
    return new ApiError(message, 429, ErrorCode.RATE_LIMITED);
  }

  static serviceUnavailable(message: string): ApiError {
    return new ApiError(message, 503, ErrorCode.SERVICE_UNAVAILABLE);
  }

  static queryTimeout(message: string): ApiError {
    return new ApiError(message, 504, ErrorCode.QUERY_TIMEOUT);
  }

  static internal(message: string, details?: unknown): ApiError {
    return new ApiError(message, 500, ErrorCode.INTERNAL_ERROR, details);
  }
}

export function handleApiError(
  res: http.ServerResponse,
  error: unknown,
  requestId?: string,
  correlationId?: string,
): void {
  if (error instanceof ApiError) {
    logger.error('API error', {
      requestId,
      correlationId,
      statusCode: error.statusCode,
      errorCode: error.errorCode,
      message: error.message,
    });
    sendErr(res, error.statusCode, error.message, error.errorCode, error.details, correlationId);
    return;
  }

  if (error instanceof NotificationAmplificationError) {
    logger.warn('Notification amplification blocked', { reason: error.reason, requestId, correlationId });
    sendErr(res, error.statusCode, error.message, ErrorCode.RATE_LIMITED, undefined, correlationId);
    return;
  }

  if (error instanceof ValidationError) {
    logger.warn('Validation error', {
      requestId,
      correlationId,
      issues: error.issues,
    });
    sendErr(
      res,
      400,
      `Validation failed: ${error.message}`,
      ErrorCode.BAD_REQUEST,
      error.issues,
      correlationId,
    );
    return;
  }

  if (error instanceof DatabaseQueryTimeoutError) {
    const timeoutError = ApiError.queryTimeout(error.message);
    logger.error('Database query timed out', {
      requestId,
      correlationId,
      timeoutMs: error.timeoutMs,
    });
    sendErr(
      res,
      timeoutError.statusCode,
      timeoutError.message,
      timeoutError.errorCode,
      undefined,
      correlationId,
    );
    return;
  }

  const message = error instanceof Error ? error.message : String(error);
  // Unhandled / unexpected error: log full internal detail but send a safe
  // generic message to the client (#1141).
  logger.error('Unhandled API error', {
    requestId,
    ...toInternalDiagnostic(error, correlationId),
  });
  sendJson(res, 500, toPublicError(ErrorCode.INTERNAL_ERROR, correlationId));
    correlationId,
    error: redactValue(error),
  });
  const safeMessage = process.env.NODE_ENV === 'production' ? 'An unexpected error occurred' : redactString(message);
  sendErr(res, 500, safeMessage, ErrorCode.INTERNAL_ERROR, undefined, correlationId);
}

export function handleOperationalError(
  res: http.ServerResponse,
  error: unknown,
  options: {
    requestId?: string;
    correlationId?: string;
    fallbackMessage?: string;
  } = {},
): void {
  if (handleQueryTimeout(res, error, options.requestId, options.correlationId)) return;

  const message =
    options.fallbackMessage ?? (error instanceof Error ? error.message : String(error));
  sendErr(
    res,
    500,
    message,
    ErrorCode.INTERNAL_ERROR,
    undefined,
    options.correlationId,
  );
}

export function handleQueryTimeout(
  res: http.ServerResponse,
  error: unknown,
  requestId?: string,
  correlationId?: string,
): boolean {
  if (!(error instanceof DatabaseQueryTimeoutError)) return false;
  handleApiError(res, error, requestId, correlationId);
  return true;
}

export function wrapAsyncHandler(
  handler: (req: http.IncomingMessage, res: http.ServerResponse, url: URL) => Promise<void>,
): (req: http.IncomingMessage, res: http.ServerResponse, url: URL) => void {
  return (req: http.IncomingMessage, res: http.ServerResponse, url: URL): void => {
    handler(req, res, url).catch((error: unknown) => {
      handleApiError(res, error);
    });
  };
}
