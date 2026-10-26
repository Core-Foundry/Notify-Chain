/**
 * #990 - Typed client SDK: typed methods, consistent failure model, tests.
 *
 * Every test drives the client through an injected stub transport — no live
 * server, no network.
 */
import {
  NotifyChainClient,
  NotifyChainError,
  errorCodeFromStatus,
  type FetchLike,
} from './typed-client';

/** Build a stub transport that records calls and replays a canned response. */
function stub(responses: Array<{
  status: number;
  body?: unknown;
  headers?: Record<string, string>;
}>) {
  const calls: Array<{ url: string; method: string; body?: string; headers: Record<string, string> }> = [];
  let i = 0;
  const impl: FetchLike = async (url, init) => {
    calls.push({ url, method: init.method, body: init.body, headers: init.headers });
    const r = responses[Math.min(i, responses.length - 1)];
    i += 1;
    const text = r.body === undefined ? '' : JSON.stringify(r.body);
    return {
      ok: r.status >= 200 && r.status < 300,
      status: r.status,
      headers: { get: (n: string) => r.headers?.[n.toLowerCase()] ?? null },
      text: async () => text,
    };
  };
  return { impl, calls };
}

const ok = (body: unknown, status = 200, headers: Record<string, string> = {}) => ({
  status,
  body,
  headers,
});

describe('NotifyChainClient construction (#990)', () => {
  it('requires a baseUrl', () => {
    expect(() => new NotifyChainClient({ baseUrl: '' })).toThrow(NotifyChainError);
  });

  it('normalises a trailing slash on baseUrl', async () => {
    const { impl, calls } = stub([ok({ status: 'ok' })]);
    const c = new NotifyChainClient({ baseUrl: 'http://x/', fetchImpl: impl });
    await c.health();
    expect(calls[0].url).toBe('http://x/health');
  });

  it('sends the API key as a bearer token when configured', async () => {
    const { impl, calls } = stub([ok({ status: 'ok' })]);
    const c = new NotifyChainClient({ baseUrl: 'http://x', apiKey: 'k-123', fetchImpl: impl });
    await c.health();
    expect(calls[0].headers.authorization).toBe('Bearer k-123');
  });

  it('omits the authorization header without an API key', async () => {
    const { impl, calls } = stub([ok({ status: 'ok' })]);
    const c = new NotifyChainClient({ baseUrl: 'http://x', fetchImpl: impl });
    await c.health();
    expect(calls[0].headers.authorization).toBeUndefined();
  });
});

describe('typed operations (#990)', () => {
  it('GET health returns parsed data', async () => {
    const { impl } = stub([ok({ status: 'ok', version: '1.0.0' })]);
    const c = new NotifyChainClient({ baseUrl: 'http://x', fetchImpl: impl });
    const r = await c.health();
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.data.status).toBe('ok');
      expect(r.data.version).toBe('1.0.0');
      expect(r.status).toBe(200);
    }
  });

  it('POST createWebhook serialises the body and sets content-type', async () => {
    const { impl, calls } = stub([ok({ id: 'w1', url: 'https://e', events: [] }, 201)]);
    const c = new NotifyChainClient({ baseUrl: 'http://x', fetchImpl: impl });
    const r = await c.createWebhook({ url: 'https://e', events: ['ping'] });
    expect(r.ok).toBe(true);
    expect(calls[0].method).toBe('POST');
    expect(calls[0].headers['content-type']).toBe('application/json');
    expect(JSON.parse(calls[0].body!)).toEqual({ url: 'https://e', events: ['ping'] });
  });

  it('builds eventHistory query params', async () => {
    const { impl, calls } = stub([ok({ items: [], total: 0 })]);
    const c = new NotifyChainClient({ baseUrl: 'http://x', fetchImpl: impl });
    await c.eventHistory({ since: '2026-01-01', limit: 10 });
    expect(calls[0].url).toBe('http://x/api/events/history?since=2026-01-01&limit=10');
  });

  it('omits the query string when no params are given', async () => {
    const { impl, calls } = stub([ok({ items: [], total: 0 })]);
    const c = new NotifyChainClient({ baseUrl: 'http://x', fetchImpl: impl });
    await c.eventHistory();
    expect(calls[0].url).toBe('http://x/api/events/history');
  });

  it('percent-encodes path segments', async () => {
    const { impl, calls } = stub([ok({ deleted: true })]);
    const c = new NotifyChainClient({ baseUrl: 'http://x', fetchImpl: impl });
    await c.deleteWebhook('a/b c');
    expect(calls[0].url).toBe('http://x/api/webhooks/a%2Fb%20c');
  });

  it('POST validates a batch', async () => {
    const { impl } = stub([ok({ valid: 2, invalid: 0 })]);
    const c = new NotifyChainClient({ baseUrl: 'http://x', fetchImpl: impl });
    const r = await c.validateBatch([{ a: 1 }, { b: 2 }]);
    expect(r.ok && r.data.valid).toBe(2);
  });
});

describe('consistent HTTP failure model (#990)', () => {
  it('returns ok:false with a typed error for a 404', async () => {
    const { impl } = stub([ok({ message: 'Not found' }, 404)]);
    const c = new NotifyChainClient({ baseUrl: 'http://x', fetchImpl: impl });
    const r = await c.health();
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error).toBeInstanceOf(NotifyChainError);
      expect(r.error.status).toBe(404);
      expect(r.error.code).toBe('not_found');
      expect(r.error.message).toBe('Not found');
      expect(r.error.retryable).toBe(false);
    }
  });

  it('marks 429 and 5xx as retryable', async () => {
    const { impl } = stub([ok({ message: 'slow down' }, 429)]);
    const c = new NotifyChainClient({ baseUrl: 'http://x', fetchImpl: impl });
    const r = await c.health();
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.retryable).toBe(true);
  });

  it('captures the correlation id from response headers', async () => {
    const { impl } = stub([
      { status: 500, body: { message: 'boom' }, headers: { 'x-correlation-id': 'corr-9' } },
    ]);
    const c = new NotifyChainClient({ baseUrl: 'http://x', fetchImpl: impl });
    const r = await c.health();
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.correlationId).toBe('corr-9');
  });

  it('falls back to an HTTP-status message when the body has none', async () => {
    const { impl } = stub([ok('not json', 502)]);
    const c = new NotifyChainClient({ baseUrl: 'http://x', fetchImpl: impl });
    const r = await c.health();
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.message).toBe('HTTP 502');
      expect(r.error.body).toBe('not json');
    }
  });

  it('surfaces a transport exception as a network error', async () => {
    const impl: FetchLike = async () => {
      throw new Error('ECONNREFUSED');
    };
    const c = new NotifyChainClient({ baseUrl: 'http://x', fetchImpl: impl });
    const r = await c.health();
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.code).toBe('network');
      expect(r.error.status).toBe(0);
      expect(r.error.retryable).toBe(true);
      expect(r.error.body).toBe('ECONNREFUSED');
    }
  });
});

describe('errorCodeFromStatus (#990)', () => {
  it('maps the documented statuses', () => {
    expect(errorCodeFromStatus(400)).toBe('bad_request');
    expect(errorCodeFromStatus(401)).toBe('unauthorized');
    expect(errorCodeFromStatus(403)).toBe('forbidden');
    expect(errorCodeFromStatus(409)).toBe('conflict');
    expect(errorCodeFromStatus(413)).toBe('payload_too_large');
    expect(errorCodeFromStatus(415)).toBe('unsupported_media_type');
    expect(errorCodeFromStatus(422)).toBe('validation_failed');
    expect(errorCodeFromStatus(429)).toBe('too_many_requests');
    expect(errorCodeFromStatus(500)).toBe('internal');
    expect(errorCodeFromStatus(418)).toBe('unknown');
  });
});

describe('NotifyChainError (#990)', () => {
  it('is an Error with fields preserved', () => {
    const e = new NotifyChainError('nope', { status: 403, code: 'forbidden' });
    expect(e).toBeInstanceOf(Error);
    expect(e.name).toBe('NotifyChainError');
    expect(e.status).toBe(403);
    expect(e.code).toBe('forbidden');
    expect(e.retryable).toBe(false);
  });

  it('treats network code as retryable regardless of status', () => {
    const e = new NotifyChainError('down', { status: 0, code: 'network' });
    expect(e.retryable).toBe(true);
  });
});
