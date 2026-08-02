import winston from 'winston';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface FormattedError {
  message: string;
  name: string;
  stack?: string;
  cause?: FormattedError | string;
}

/** Structured context fields that can be attached to any log call. */
export interface LogContext {
  /** Identifier scoped to a single poll/request cycle for end-to-end tracing. */
  requestId?: string;
  /** Elapsed milliseconds for timed operations (RPC calls, webhook delivery, etc.). */
  durationMs?: number;
  /** Any additional structured fields the caller wants to attach. */
  [key: string]: unknown;
}

// ---------------------------------------------------------------------------
// Log-level helpers
// ---------------------------------------------------------------------------

const VALID_LOG_LEVELS = ['error', 'warn', 'info', 'debug'] as const;
export type LogLevel = (typeof VALID_LOG_LEVELS)[number];

/**
 * Validate and normalize a raw LOG_LEVEL string.
 * Falls back to `"info"` when the value is absent or unrecognised so the
 * service never crashes on a misconfigured environment.
 */
export function resolveLogLevel(raw: string | undefined): LogLevel {
  const normalised = raw?.trim().toLowerCase();
  if (normalised && (VALID_LOG_LEVELS as readonly string[]).includes(normalised)) {
    return normalised as LogLevel;
  }
  return 'info';
}

// ---------------------------------------------------------------------------
// Error formatting
// ---------------------------------------------------------------------------

/**
 * Normalize unknown thrown values into a structured object for logging.
 * Error instances are expanded into `{ message, name, stack?, cause? }`.
 * Non-Error objects are JSON-stringified; primitives are coerced to string.
 */
export function formatError(error: unknown): FormattedError | string {
  if (error instanceof Error) {
    const formatted: FormattedError = {
      message: error.message,
      name: error.name,
    };

    if (error.stack) {
      formatted.stack = error.stack;
    }

    if ('cause' in error && error.cause !== undefined) {
      formatted.cause = formatError(error.cause);
    }

    return formatted;
  }

  if (typeof error === 'object' && error !== null) {
    try {
      return JSON.stringify(error);
    } catch {
      return String(error);
    }
  }

  return String(error);
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function formatMeta(meta: LogContext): LogContext {
  if (!('error' in meta) || meta.error === undefined) {
    return meta;
  }

  return {
    ...meta,
    error: formatError(meta.error),
  };
}

function logWithMeta(
  level: LogLevel,
  message: string,
  meta?: LogContext
): void {
  if (meta && Object.keys(meta).length > 0) {
    baseLogger[level](message, formatMeta(meta));
  } else {
    baseLogger[level](message);
  }
}

// ---------------------------------------------------------------------------
// Winston instance
// ---------------------------------------------------------------------------

/**
 * Structured logger for the notification pipeline.
 *
 * All log entries include:
 *   - timestamp  – ISO 8601 timestamp (added automatically)
 *   - level      – log severity: `error | warn | info | debug`
 *   - message    – human-readable description of the event
 *
 * Recommended optional fields (see LogContext):
 *   - requestId  – identifier scoped to a single poll/request cycle
 *   - durationMs – elapsed time for timed operations
 *
 * **Configuration**
 * Set `LOG_LEVEL` to `debug | info | warn | error` to control verbosity
 * (default: `"info"`). Invalid values are silently downgraded to `"info"`.
 *
 * In development (`NODE_ENV` ≠ `"production"`) logs use a colorised
 * single-line format. In production they emit newline-delimited JSON suitable
 * for log aggregators (Datadog, CloudWatch, Loki, etc.).
 */
const baseLogger = winston.createLogger({
  level: resolveLogLevel(process.env.LOG_LEVEL),
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  transports: [
    new winston.transports.Console({
      format:
        process.env.NODE_ENV === 'production'
          ? winston.format.json()
          : winston.format.combine(
              winston.format.colorize(),
              winston.format.printf(({ timestamp, level, message, ...meta }) => {
                const metaStr = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
                return `${timestamp} ${level}: ${message}${metaStr}`;
              })
            ),
    }),
  ],
});

// ---------------------------------------------------------------------------
// Public logger API
// ---------------------------------------------------------------------------

/**
 * Application-wide structured logger.
 *
 * Usage:
 * ```ts
 * import logger from '../utils/logger';
 *
 * logger.info('Poll cycle complete', { requestId, durationMs });
 * logger.error('Delivery failed',   { requestId, error });
 * logger.warn('Payload invalid',    { requestId, reason });
 * logger.debug('Raw RPC response',  { requestId, payload });
 * ```
 */
const logger = {
  debug: (message: string, meta?: LogContext) => logWithMeta('debug', message, meta),
  info:  (message: string, meta?: LogContext) => logWithMeta('info',  message, meta),
  warn:  (message: string, meta?: LogContext) => logWithMeta('warn',  message, meta),
  error: (message: string, meta?: LogContext) => logWithMeta('error', message, meta),
};

export default logger;

// ---------------------------------------------------------------------------
// Context helpers
// ---------------------------------------------------------------------------

/**
 * Create a log-context object pre-populated with a `requestId`.
 * Thread this through all log calls within a single poll/request cycle so
 * every line can be correlated end-to-end:
 *
 * ```ts
 * const ctx = createRequestContext(requestId);
 * logger.info('Starting poll', ctx);
 * logger.info('Events received', { ...ctx, count: events.length });
 * logger.error('Delivery failed', { ...ctx, error });
 * ```
 */
export function createRequestContext(requestId: string): LogContext {
  return { requestId };
}

/**
 * Reconfigure the underlying Winston logger's active level at runtime.
 * Accepts the same values as the `LOG_LEVEL` env variable; invalid values
 * fall back to `"info"` without throwing.
 *
 * Primarily useful in tests or when hot-reloading config:
 * ```ts
 * configureLogger({ level: 'debug' });
 * ```
 */
export function configureLogger(options: { level: string }): void {
  baseLogger.level = resolveLogLevel(options.level);
}
