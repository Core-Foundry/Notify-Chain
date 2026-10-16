/**
 * #986 - correlation ID propagation through the request duration logger.
 */
import { EventEmitter } from 'events';
import { Request, Response } from 'express';
import { createRequestDurationLogger } from './request-duration-logger';

interface LogCall {
  message: string;
  meta?: Record<string, unknown>;
}

function runRequest(headers: Record<string, unknown>): {
  meta?: Record<string, unknown>;
  setHeader: jest.Mock;
} {
  const calls: LogCall[] = [];
  const mockLogger = {
    info: (message: string, meta?: Record<string, unknown>) => {
      calls.push({ message, meta });
    },
  };

  const setHeader = jest.fn();
  const middleware = createRequestDurationLogger(mockLogger);
  const req = {
    method: 'GET',
    originalUrl: '/api/v1/events',
    headers,
    ip: '127.0.0.1',
    socket: { remoteAddress: '127.0.0.1' },
  } as unknown as Request;
  const resEmitter = new EventEmitter();
  const res = Object.assign(resEmitter, {
    statusCode: 200,
    getHeader: jest.fn(),
    setHeader,
  }) as unknown as Response;

  middleware(req, res, jest.fn());
  resEmitter.emit('finish');

  return { meta: calls[0]?.meta, setHeader };
}

describe('correlation ID in request logging (#986)', () => {
  it('reuses a valid client-supplied correlation ID', () => {
    const { meta, setHeader } = runRequest({ 'x-correlation-id': 'client-trace-0001' });
    expect(meta?.correlationId).toBe('client-trace-0001');
    expect(setHeader).toHaveBeenCalledWith('x-correlation-id', 'client-trace-0001');
  });

  it('generates and echoes a correlation ID when none is supplied', () => {
    const { meta, setHeader } = runRequest({});
    expect(typeof meta?.correlationId).toBe('string');
    expect((meta?.correlationId as string).length).toBeGreaterThanOrEqual(8);
    expect(setHeader).toHaveBeenCalledWith('x-correlation-id', meta?.correlationId);
  });

  it('replaces an unsafe client-supplied ID instead of reusing it', () => {
    const { meta } = runRequest({ 'x-correlation-id': 'evil\ninjected' });
    expect(meta?.correlationId).not.toContain('evil');
    expect((meta?.correlationId as string)).not.toContain('\n');
  });
});
