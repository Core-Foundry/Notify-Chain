import { IncomingMessage, ServerResponse } from 'http';
import { generateRequestId, resolveCorrelationId, applyRequestContext } from './request-id';

function makeReq(headers: Record<string, string | string[] | undefined> = {}): IncomingMessage {
  return { headers } as unknown as IncomingMessage;
}

function makeRes(): ServerResponse {
  const headers: Record<string, string> = {};
  return {
    setHeader: (name: string, value: string) => {
      headers[name] = value;
    },
    getHeader: (name: string) => headers[name],
  } as unknown as ServerResponse;
}

describe('generateRequestId', () => {
  it('generates a short, unique id for each call', () => {
    const a = generateRequestId();
    const b = generateRequestId();
    expect(a).not.toEqual(b);
    expect(a.length).toBeGreaterThan(0);
  });
});

describe('resolveCorrelationId', () => {
  it('reuses an incoming header value', () => {
    expect(resolveCorrelationId('abc-123')).toBe('abc-123');
  });

  it('trims whitespace from an incoming header value', () => {
    expect(resolveCorrelationId('  abc-123  ')).toBe('abc-123');
  });

  it('uses the first value when the header is an array', () => {
    expect(resolveCorrelationId(['first', 'second'])).toBe('first');
  });

  it('generates a new id when no header is present', () => {
    const id = resolveCorrelationId(undefined);
    expect(typeof id).toBe('string');
    expect(id.length).toBeGreaterThan(0);
  });

  it('generates a new id when the header is blank', () => {
    const id = resolveCorrelationId('   ');
    expect(id.trim().length).toBeGreaterThan(0);
  });
});

describe('applyRequestContext', () => {
  it('assigns a fresh requestId to every request', () => {
    const res = makeRes();
    const { requestId: first } = applyRequestContext(makeReq(), res);
    const { requestId: second } = applyRequestContext(makeReq(), makeRes());
    expect(first).not.toEqual(second);
  });

  it('honours an incoming X-Correlation-Id header', () => {
    const res = makeRes();
    const { correlationId } = applyRequestContext(
      makeReq({ 'x-correlation-id': 'caller-supplied-id' }),
      res
    );
    expect(correlationId).toBe('caller-supplied-id');
  });

  it('generates a correlationId when none is supplied', () => {
    const res = makeRes();
    const { correlationId } = applyRequestContext(makeReq(), res);
    expect(correlationId.length).toBeGreaterThan(0);
  });

  it('echoes requestId and correlationId back as response headers', () => {
    const res = makeRes();
    const { requestId, correlationId } = applyRequestContext(makeReq(), res);
    expect(res.getHeader('X-Request-Id')).toBe(requestId);
    expect(res.getHeader('X-Correlation-Id')).toBe(correlationId);
  });
});
