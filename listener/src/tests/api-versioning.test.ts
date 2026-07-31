/**
 * API Route Versioning tests (#386)
 *
 * Validates that:
 *  1. /api/v1/* routes return identical responses to /api/* routes.
 *  2. The X-API-Version: v1 header is present on all responses.
 *  3. Unversioned /api/* routes remain fully functional.
 */
import http from 'http';
import { createEventsServer } from '../api/events-server';

const TEST_PORT = 19800;

function makeRequest(
  path: string,
  options: { headers?: Record<string, string>; method?: string } = {},
): Promise<{ status: number; headers: http.IncomingHttpHeaders; body: string }> {
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        hostname: '127.0.0.1',
        port: TEST_PORT,
        path,
        method: options.method ?? 'GET',
        headers: options.headers,
      },
      (res) => {
        let body = '';
        res.on('data', (chunk) => { body += chunk.toString(); });
        res.on('end', () => resolve({ status: res.statusCode ?? 0, headers: res.headers, body }));
      },
    );
    req.on('error', reject);
    req.end();
  });
}

describe('API Route Versioning (#386)', () => {
  let server: http.Server;

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

  // ── X-API-Version header ──────────────────────────────────────────────────

  test('unversioned /api/events includes X-API-Version: v1', async () => {
    const { headers } = await makeRequest('/api/events');
    expect(headers['x-api-version']).toBe('v1');
  });

  test('/api/v1/events includes X-API-Version: v1', async () => {
    const { headers } = await makeRequest('/api/v1/events');
    expect(headers['x-api-version']).toBe('v1');
  });

  // ── Route equivalence ─────────────────────────────────────────────────────

  test('/api/v1/events and /api/events return same status', async () => {
    const [versioned, legacy] = await Promise.all([
      makeRequest('/api/v1/events'),
      makeRequest('/api/events'),
    ]);
    expect(versioned.status).toBe(legacy.status);
    expect(versioned.status).toBe(200);
  });

  test('/api/v1/events response has events array', async () => {
    const { status, body } = await makeRequest('/api/v1/events');
    expect(status).toBe(200);
    const json = JSON.parse(body);
    expect(json).toHaveProperty('events');
    expect(Array.isArray(json.events)).toBe(true);
  });

  test('/api/v1/events and /api/events return the same body', async () => {
    const [versioned, legacy] = await Promise.all([
      makeRequest('/api/v1/events'),
      makeRequest('/api/events'),
    ]);
    expect(JSON.parse(versioned.body)).toEqual(JSON.parse(legacy.body));
  });

  // ── Unversioned backward compatibility ───────────────────────────────────

  test('unversioned /api/events still returns 200', async () => {
    const { status } = await makeRequest('/api/events');
    expect(status).toBe(200);
  });

  // ── Query string preservation ─────────────────────────────────────────────

  test('/api/v1/events?limit=5 honours the limit parameter', async () => {
    const { status, body } = await makeRequest('/api/v1/events?limit=5');
    expect(status).toBe(200);
    const json = JSON.parse(body);
    expect(json).toHaveProperty('events');
    expect(json.events.length).toBeLessThanOrEqual(5);
  });

  // ── Unknown versioned path ────────────────────────────────────────────────

  test('/api/v1/unknown-route returns 404', async () => {
    const { status } = await makeRequest('/api/v1/unknown-route');
    expect(status).toBe(404);
  });

  // ── Header present on error responses ────────────────────────────────────

  test('X-API-Version: v1 is present even on 404 responses', async () => {
    const { status, headers } = await makeRequest('/api/v1/no-such-route');
    expect(status).toBe(404);
    expect(headers['x-api-version']).toBe('v1');
  });
});
