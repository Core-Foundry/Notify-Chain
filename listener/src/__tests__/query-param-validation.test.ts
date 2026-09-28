/**
 * Tests for events API query-parameter validation (#646).
 *
 * Unit coverage for validateQueryParams plus live HTTP checks against
 * the events server confirming structured 400s for malformed and
 * unsupported parameters and unchanged behavior for valid ones.
 */
import http from 'http';
import { validateQueryParams } from '../utils/query-validation';
import { createEventsServer } from '../api/events-server';

const params = (qs: string) => new URLSearchParams(qs);

describe('validateQueryParams', () => {
  const spec = {
    limit: { type: 'integer', min: 1, max: 500 },
    offset: { type: 'integer', min: 0 },
    q: { type: 'string', maxLength: 10 },
    sortBy: { type: 'string', values: ['newest', 'oldest'] },
    reset: { type: 'boolean' },
    since: { type: 'date' },
  } as const;

  test('absent parameters stay undefined', () => {
    const r = validateQueryParams(params(''), spec);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.values.limit).toBeUndefined();
  });

  test('valid values parse into typed values', () => {
    const r = validateQueryParams(
      params('limit=25&offset=2&q=abc&sortBy=oldest&reset=true&since=2026-01-01T00:00:00Z'),
      spec
    );
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.values.limit).toBe(25);
      expect(r.values.offset).toBe(2);
      expect(r.values.q).toBe('abc');
      expect(r.values.sortBy).toBe('oldest');
      expect(r.values.reset).toBe(true);
      expect(r.values.since).toBe('2026-01-01T00:00:00Z');
    }
  });

  test('non-integer limit is a structured INVALID_QUERY_PARAMETER error', () => {
    const r = validateQueryParams(params('limit=abc'), spec);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.code).toBe('INVALID_QUERY_PARAMETER');
      expect(r.parameter).toBe('limit');
      expect(r.message).toContain("'limit'");
    }
  });

  test('out-of-range integer is rejected', () => {
    const r = validateQueryParams(params('limit=501'), spec);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.parameter).toBe('limit');
  });

  test('zero offset is allowed (min 0), negative rejected', () => {
    expect(validateQueryParams(params('offset=0'), spec).ok).toBe(true);
    expect(validateQueryParams(params('offset=-1'), spec).ok).toBe(false);
  });

  test('enum violations are rejected with the allowed values in the message', () => {
    const r = validateQueryParams(params('sortBy=random'), spec);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.parameter).toBe('sortBy');
      expect(r.message).toContain('newest');
    }
  });

  test('boolean only accepts true/false', () => {
    expect(validateQueryParams(params('reset=true'), spec).ok).toBe(true);
    expect(validateQueryParams(params('reset=1'), spec).ok).toBe(false);
  });

  test('invalid dates are rejected', () => {
    expect(validateQueryParams(params('since=not-a-date'), spec).ok).toBe(false);
    expect(validateQueryParams(params('since=2026-06-01'), spec).ok).toBe(true);
  });

  test('unsupported parameter names are rejected and list the supported set', () => {
    const r = validateQueryParams(params('bogus=1'), spec);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.code).toBe('UNSUPPORTED_QUERY_PARAMETER');
      expect(r.parameter).toBe('bogus');
      expect(r.supportedParameters).toContain('limit');
      expect(r.message).toContain("'bogus'");
    }
  });

  test('oversized strings are rejected', () => {
    const r = validateQueryParams(params('q=' + 'x'.repeat(11)), spec);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.parameter).toBe('q');
  });
});

describe('events API query validation (HTTP)', () => {
  const TEST_PORT = 19877;
  let server: http.Server;

  function getJson(path: string): Promise<{ status: number; body: any }> {
    return new Promise((resolve, reject) => {
      const req = http.request({ hostname: '127.0.0.1', port: TEST_PORT, path }, (res) => {
        let data = '';
        res.on('data', (c) => (data += c));
        res.on('end', () => {
          let body: any = null;
          try { body = JSON.parse(data); } catch { /* leave null */ }
          resolve({ status: res.statusCode ?? 0, body });
        });
      });
      req.on('error', reject);
      req.end();
    });
  }

  beforeAll((done) => {
    server = createEventsServer({
      port: TEST_PORT,
      stellarRpcUrl: 'http://localhost:8000',
      stellarNetworkPassphrase: 'Test SDF Network ; September 2015',
      contractAddresses: [],
    });
    server.listen(TEST_PORT, done);
  });

  afterAll((done) => {
    server.close(done);
  });

  test('GET /api/events with a valid limit behaves as before', async () => {
    const { status, body } = await getJson('/api/events?limit=5');
    expect(status).toBe(200);
    expect(body.data).toHaveProperty('count');
  });

  test('GET /api/events with a malformed limit returns a structured 400', async () => {
    const { status, body } = await getJson('/api/events?limit=abc');
    expect(status).toBe(400);
    expect(body.error ?? body).toMatchObject({
      code: expect.any(String),
      message: expect.stringContaining("'limit'"),
    });
    const details = (body.error ?? body).details ?? body.details;
    expect(details).toMatchObject({ parameter: 'limit', code: 'INVALID_QUERY_PARAMETER' });
  });

  test('GET /api/events with an unsupported parameter is rejected consistently', async () => {
    const { status, body } = await getJson('/api/events?frobnicate=1');
    expect(status).toBe(400);
    const details = (body.error ?? body).details ?? body.details;
    expect(details).toMatchObject({ parameter: 'frobnicate', code: 'UNSUPPORTED_QUERY_PARAMETER' });
    expect(details.supportedParameters).toContain('limit');
  });

  test('GET /api/schedule/jobs keeps default and clamping behavior for valid input', async () => {
    const okDefault = await getJson('/api/schedule/jobs');
    expect(okDefault.status).toBe(200);
    const okClamped = await getJson('/api/schedule/jobs?limit=999');
    expect(okClamped.status).toBe(200);
    const bad = await getJson('/api/schedule/jobs?limit=-3');
    expect(bad.status).toBe(400);
  });
});
