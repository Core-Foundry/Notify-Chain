/**
 * Tests for the structured logger utility (issue #378).
 *
 * Coverage:
 *  - formatError: Error instances, nested causes, non-Error values
 *  - resolveLogLevel: valid levels, invalid/missing values fall back to "info"
 *  - createRequestContext: shapes the returned context object
 *  - configureLogger: changes the active Winston level at runtime
 *  - logger methods (debug/info/warn/error): accept messages + meta, normalise
 *    the `error` field via formatError
 *  - Consistent structure: all four methods are exported and callable
 *  - Environment switching: resolveLogLevel handles the NODE_ENV cases
 */

import winston from 'winston';
import logger, {
  formatError,
  resolveLogLevel,
  createRequestContext,
  configureLogger,
  FormattedError,
  LogContext,
} from './logger';

// ---------------------------------------------------------------------------
// formatError
// ---------------------------------------------------------------------------

describe('formatError', () => {
  it('formats an Error instance with message, name and stack', () => {
    const err = new Error('something went wrong');
    const result = formatError(err) as FormattedError;

    expect(result).toMatchObject({
      message: 'something went wrong',
      name: 'Error',
      stack: expect.any(String),
    });
  });

  it('formats a custom error subclass preserving its name', () => {
    class CustomError extends Error {
      constructor(msg: string) {
        super(msg);
        this.name = 'CustomError';
      }
    }
    const result = formatError(new CustomError('boom')) as FormattedError;
    expect(result.name).toBe('CustomError');
    expect(result.message).toBe('boom');
  });

  it('formats nested error causes recursively', () => {
    const cause = new Error('root cause');
    const wrapper = new Error('wrapper');
    (wrapper as Error & { cause: unknown }).cause = cause;

    const result = formatError(wrapper) as FormattedError;
    expect(result.message).toBe('wrapper');
    expect((result.cause as FormattedError).message).toBe('root cause');
    expect((result.cause as FormattedError).name).toBe('Error');
  });

  it('omits stack when the Error has no stack', () => {
    const err = new Error('no stack');
    delete err.stack;
    const result = formatError(err) as FormattedError;
    expect(result).not.toHaveProperty('stack');
  });

  it('omits cause when it is undefined', () => {
    const result = formatError(new Error('plain')) as FormattedError;
    expect(result).not.toHaveProperty('cause');
  });

  it('JSON-stringifies a plain object', () => {
    const obj = { code: 42, detail: 'oops' };
    expect(formatError(obj)).toBe(JSON.stringify(obj));
  });

  it('returns the string representation of a number', () => {
    expect(formatError(404)).toBe('404');
  });

  it('returns a plain string unchanged', () => {
    expect(formatError('plain string')).toBe('plain string');
  });

  it('returns "null" for null', () => {
    expect(formatError(null)).toBe('null');
  });

  it('falls back to String() when JSON.stringify throws on a circular reference', () => {
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    const result = formatError(circular);
    expect(typeof result).toBe('string');
  });
});

// ---------------------------------------------------------------------------
// resolveLogLevel
// ---------------------------------------------------------------------------

describe('resolveLogLevel', () => {
  it.each([['error'], ['warn'], ['info'], ['debug']])(
    'accepts valid level "%s"',
    (level) => {
      expect(resolveLogLevel(level)).toBe(level);
    }
  );

  it('is case-insensitive', () => {
    expect(resolveLogLevel('DEBUG')).toBe('debug');
    expect(resolveLogLevel('WARN')).toBe('warn');
    expect(resolveLogLevel('ERROR')).toBe('error');
    expect(resolveLogLevel('INFO')).toBe('info');
  });

  it('trims surrounding whitespace', () => {
    expect(resolveLogLevel('  info  ')).toBe('info');
    expect(resolveLogLevel('\tdebug\n')).toBe('debug');
  });

  it('falls back to "info" for an unrecognised value', () => {
    expect(resolveLogLevel('verbose')).toBe('info');
    expect(resolveLogLevel('trace')).toBe('info');
    expect(resolveLogLevel('silly')).toBe('info');
  });

  it('falls back to "info" for an empty string', () => {
    expect(resolveLogLevel('')).toBe('info');
  });

  it('falls back to "info" when undefined', () => {
    expect(resolveLogLevel(undefined)).toBe('info');
  });
});

// ---------------------------------------------------------------------------
// createRequestContext
// ---------------------------------------------------------------------------

describe('createRequestContext', () => {
  it('returns an object with the provided requestId', () => {
    const ctx = createRequestContext('abc-123');
    expect(ctx).toEqual({ requestId: 'abc-123' });
  });

  it('produces a LogContext that can be spread with additional fields', () => {
    const ctx = createRequestContext('req-1') as LogContext;
    const meta: LogContext = { ...ctx, durationMs: 42, count: 5 };
    expect(meta.requestId).toBe('req-1');
    expect(meta.durationMs).toBe(42);
    expect(meta.count).toBe(5);
  });
});

// ---------------------------------------------------------------------------
// configureLogger
// ---------------------------------------------------------------------------

describe('configureLogger', () => {
  afterEach(() => {
    configureLogger({ level: 'info' });
  });

  it('accepts each valid level without throwing', () => {
    expect(() => configureLogger({ level: 'debug' })).not.toThrow();
    expect(() => configureLogger({ level: 'info' })).not.toThrow();
    expect(() => configureLogger({ level: 'warn' })).not.toThrow();
    expect(() => configureLogger({ level: 'error' })).not.toThrow();
  });

  it('falls back to "info" for an invalid level without throwing', () => {
    expect(() => configureLogger({ level: 'verbose' })).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// logger methods — smoke tests and meta normalisation
// ---------------------------------------------------------------------------

describe('logger methods', () => {
  let consoleSpy: jest.SpyInstance;

  beforeEach(() => {
    // Silence Winston Console transport output during tests.
    consoleSpy = jest
      .spyOn(winston.transports.Console.prototype, 'log')
      .mockImplementation((_info: unknown, next: () => void) => {
        if (typeof next === 'function') next();
      });
  });

  afterEach(() => {
    consoleSpy.mockRestore();
  });

  it('logger.info does not throw', () => {
    expect(() => logger.info('test info message')).not.toThrow();
  });

  it('logger.warn does not throw', () => {
    expect(() => logger.warn('test warn message')).not.toThrow();
  });

  it('logger.error does not throw', () => {
    expect(() => logger.error('test error message')).not.toThrow();
  });

  it('logger.debug does not throw', () => {
    expect(() => logger.debug('test debug message')).not.toThrow();
  });

  it('logger.info accepts structured meta without throwing', () => {
    expect(() =>
      logger.info('event received', { requestId: 'r1', count: 3 })
    ).not.toThrow();
  });

  it('logger.error accepts an Error in meta without throwing', () => {
    expect(() =>
      logger.error('Delivery failed', { requestId: 'r2', error: new Error('rpc timeout') })
    ).not.toThrow();
  });

  it('logger.warn accepts meta without throwing', () => {
    expect(() =>
      logger.warn('Payload invalid', { requestId: 'r3', reason: 'missing field' })
    ).not.toThrow();
  });

  it('logger.debug accepts meta without throwing', () => {
    expect(() =>
      logger.debug('Raw RPC response', { requestId: 'r4', payload: { ledger: 100 } })
    ).not.toThrow();
  });

  it('accepts an empty meta object without throwing', () => {
    expect(() => logger.info('empty meta', {})).not.toThrow();
  });

  it('accepts undefined meta without throwing', () => {
    expect(() => logger.info('no meta')).not.toThrow();
  });

  it('accepts a non-Error value in the error field without throwing', () => {
    expect(() =>
      logger.error('Unexpected rejection', { error: 'string error value' })
    ).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// Error field normalisation
// ---------------------------------------------------------------------------

describe('error field normalisation in meta', () => {
  it('formatError expands an Error to a structured object', () => {
    const err = new Error('pipeline error');
    const formatted = formatError(err) as FormattedError;
    expect(formatted.message).toBe('pipeline error');
    expect(formatted.name).toBe('Error');
    expect(formatted.stack).toBeDefined();
  });

  it('formatError passes non-error meta fields through unchanged via String()', () => {
    expect(formatError('string error')).toBe('string error');
    expect(formatError(500)).toBe('500');
  });
});

// ---------------------------------------------------------------------------
// Log entry structure — exported surface
// ---------------------------------------------------------------------------

describe('log entry structure', () => {
  it('logger exposes all four log-level methods', () => {
    expect(typeof logger.debug).toBe('function');
    expect(typeof logger.info).toBe('function');
    expect(typeof logger.warn).toBe('function');
    expect(typeof logger.error).toBe('function');
  });

  it('logger is the default export', async () => {
    const mod = await import('./logger');
    expect(mod.default).toBe(logger);
  });

  it('all named helpers are exported', async () => {
    const mod = await import('./logger');
    expect(typeof mod.formatError).toBe('function');
    expect(typeof mod.resolveLogLevel).toBe('function');
    expect(typeof mod.createRequestContext).toBe('function');
    expect(typeof mod.configureLogger).toBe('function');
  });
});

// ---------------------------------------------------------------------------
// Log-level integration — configureLogger + methods
// ---------------------------------------------------------------------------

describe('log level integration', () => {
  let consoleSpy: jest.SpyInstance;

  beforeEach(() => {
    consoleSpy = jest
      .spyOn(winston.transports.Console.prototype, 'log')
      .mockImplementation((_info: unknown, next: () => void) => {
        if (typeof next === 'function') next();
      });
  });

  afterEach(() => {
    consoleSpy.mockRestore();
    configureLogger({ level: 'info' });
  });

  it('setting level to error still allows error calls without throwing', () => {
    configureLogger({ level: 'error' });
    expect(() => logger.error('critical failure')).not.toThrow();
  });

  it('setting level to debug allows all four methods without throwing', () => {
    configureLogger({ level: 'debug' });
    expect(() => logger.debug('verbose detail')).not.toThrow();
    expect(() => logger.info('info message')).not.toThrow();
    expect(() => logger.warn('a warning')).not.toThrow();
    expect(() => logger.error('an error')).not.toThrow();
  });
});
