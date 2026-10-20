import http from 'http';
import { createEventsServer } from '../api/events-server';

const TEST_PORT = 19876;

function makeRequest(
  path: string,
  options: { headers?: Record<string, string>; method?: string; port?: number } = {}
): Promise<{ status: number; headers: http.IncomingHttpHeaders; body: any }> {
  return new Promise((resolve, reject) => {
    const req = http.request(
      { hostname: '127.0.0.1', port: options.port ?? TEST_PORT, path, method: options.method ?? 'GET', headers: options.headers },
      (res) => {
        let data = '';
        res.on('data', (chunk) => data += chunk);
        res.on('end', () => {
          let body = data;
          try { body = JSON.parse(data); } catch (e) {}
          resolve({ status: res.statusCode ?? 0, headers: res.headers, body });
        });
      }
    );
    req.on('error', reject);
    req.end();
  });
}

let server: http.Server;

beforeAll((done) => {
  server = createEventsServer({
    port: TEST_PORT,
    stellarRpcUrl: 'http://localhost:8000',
    stellarNetworkPassphrase: 'Test SDF Network ; September 2015',
    contractAddresses: [],
  });
  server.listen(TEST_PORT, () => {
    // Add 150 mock events to the registry
    const { eventRegistry } = require('../store/event-registry');
    for (let i = 0; i < 150; i++) {
      eventRegistry.addFromInput({
        eventId: `0000000000000000-${i}`,
        contractAddress: 'CCEMX6JKPEUGYAOU4YZP3WBXGPWK7AEFDEDLRXFIDIJPQFMRXTHUVIO',
        eventName: 'autoshare_created',
        ledger: 1000 + i,
        type: 'contract',
        topic: ['test'],
        value: 'test',
        txHash: '0x123',
        receivedAt: Date.now(),
      });
    }
    done();
  });
});

afterAll((done) => {
  server.close(done);
});

describe('correlation ID propagation', () => {
  test('generates a correlation ID when none is provided', async () => {
    const { headers } = await makeRequest('/api/events');
    expect(headers['x-correlation-id']).toBeTruthy();
  });

  test('echoes back the caller-supplied correlation ID', async () => {
    const myId = 'my-trace-abc123';
    const { headers } = await makeRequest('/api/events', {
      headers: { 'x-correlation-id': myId },
    });
    expect(headers['x-correlation-id']).toBe(myId);
  });

  test('always includes x-request-id alongside correlation ID', async () => {
    const { headers } = await makeRequest('/api/events');
    expect(headers['x-request-id']).toBeTruthy();
    expect(headers['x-correlation-id']).toBeTruthy();
    expect(headers['x-request-id']).not.toBe(headers['x-correlation-id']);
  });

  test('correlation ID flows through on 404 responses', async () => {
    const myId = 'trace-404-test';
    const { status, headers } = await makeRequest('/no-such-route', {
      headers: { 'x-correlation-id': myId },
    });
    expect(status).toBe(404);
    expect(headers['x-correlation-id']).toBe(myId);
  });
});

describe('security headers', () => {
  test('sets baseline headers on preflight responses without changing cache policy', async () => {
    const { status, headers } = await makeRequest('/api/events', { method: 'OPTIONS' });

    expect(status).toBe(204);
    expect(headers['x-content-type-options']).toBe('nosniff');
    expect(headers['x-frame-options']).toBe('SAMEORIGIN');
    expect(headers['referrer-policy']).toBe('strict-origin-when-cross-origin');
    expect(headers['strict-transport-security']).toBeUndefined();
    expect(headers['cache-control']).toBeUndefined();
  });

  test('sets baseline headers on not-found responses', async () => {
    const { status, headers } = await makeRequest('/no-such-route');

    expect(status).toBe(404);
    expect(headers['x-content-type-options']).toBe('nosniff');
    expect(headers['x-frame-options']).toBe('SAMEORIGIN');
    expect(headers['referrer-policy']).toBe('strict-origin-when-cross-origin');
  });

  test('sets HSTS only when production is explicitly enabled', async () => {
    const productionServer = createEventsServer({
      port: 0,
      isProduction: true,
      stellarRpcUrl: 'http://localhost:8000',
      stellarNetworkPassphrase: 'Test SDF Network ; September 2015',
      contractAddresses: [],
    });

    await new Promise<void>((resolve) => productionServer.listen(0, '127.0.0.1', resolve));

    try {
      const address = productionServer.address() as { port: number };
      const { headers } = await makeRequest('/no-such-route', { port: address.port });

      expect(headers['strict-transport-security']).toBe('max-age=31536000');
    } finally {
      await new Promise<void>((resolve) => productionServer.close(() => resolve()));
    }
  });
});

describe('GET /api/events pagination', () => {
  test('defaults to 20 items when limit is not provided', async () => {
    const { status, body } = await makeRequest('/api/events');
    const events = body.data?.events ?? body.events;
    const count = body.data?.count ?? body.count;
    expect(status).toBe(200);
    expect(events.length).toBe(20);
    expect(count).toBeGreaterThanOrEqual(150);
  });

  test('respects limit when provided within bounds', async () => {
    const { status, body } = await makeRequest('/api/events?limit=50');
    const events = body.data?.events ?? body.events;
    expect(status).toBe(200);
    expect(events.length).toBe(50);
  });

  test('caps excessively large limit at 100', async () => {
    const { status, body } = await makeRequest('/api/events?limit=200');
    const events = body.data?.events ?? body.events;
    expect(status).toBe(200);
    expect(events.length).toBe(100);
  });

  test('handles negative limits by falling back to minimum (1)', async () => {
    const { status, body } = await makeRequest('/api/events?limit=-10');
    const events = body.data?.events ?? body.events;
    expect(status).toBe(200);
    expect(events.length).toBe(1);
  });
  
  test('handles invalid limit by falling back to default', async () => {
    const { status, body } = await makeRequest('/api/events?limit=invalid');
    const events = body.data?.events ?? body.events;
    expect(status).toBe(200);
    expect(events.length).toBe(20);
  });
});

describe('raw event retention endpoints (Issue #945)', () => {
  const testContract = 'CCEMX6JKPEUGYAOU4YZP3WBXGPWK7AEFDEDLRXFIDIJPQFMRXTHUVIO';
  const testEventId = '0000000000000000-0';

  test('GET /api/events includes raw representation by default', async () => {
    const { status, body } = await makeRequest('/api/events?limit=5');
    expect(status).toBe(200);
    const events = body.data?.events ?? body.events;
    expect(events.length).toBeGreaterThan(0);
    const first = events[0];
    expect(first.raw).toBeDefined();
    expect(first.raw.format).toBe('raw');
    expect(typeof first.raw.capturedAt).toBe('string');
    expect(typeof first.raw.sizeBytes).toBe('number');
  });

  test('GET /api/events?raw=false excludes raw representation', async () => {
    const { status, body } = await makeRequest('/api/events?limit=5&raw=false');
    expect(status).toBe(200);
    const events = body.data?.events ?? body.events;
    expect(events.length).toBeGreaterThan(0);
    const first = events[0];
    expect(first.raw).toBeUndefined();
    expect(first.eventId).toBeDefined();
  });

  test('GET /api/events/:contractAddress/:eventId/raw returns raw representation', async () => {
    const { status, body } = await makeRequest(
      `/api/events/${testContract}/${testEventId}/raw`,
    );
    expect(status).toBe(200);
    const raw = body.data ?? body;
    expect(raw.format).toBe('raw');
    expect(typeof raw.capturedAt).toBe('string');
    expect(raw.sizeBytes).toBeGreaterThan(0);
  });

  test('GET /api/events/:eventId/raw returns raw representation by eventId', async () => {
    const { status, body } = await makeRequest(`/api/events/${testEventId}/raw`);
    expect(status).toBe(200);
    const raw = body.data ?? body;
    expect(raw.format).toBe('raw');
    expect(raw.sizeBytes).toBeGreaterThan(0);
  });

  test('GET /api/events/:contractAddress/:eventId/raw returns 404 for nonexistent event', async () => {
    const { status, body } = await makeRequest(
      `/api/events/${testContract}/nonexistent-event-id/raw`,
    );
    expect(status).toBe(404);
  });

  test('GET /api/events/:contractAddress/:eventId returns single event', async () => {
    const { status, body } = await makeRequest(
      `/api/events/${testContract}/${testEventId}`,
    );
    expect(status).toBe(200);
    const event = body.data ?? body;
    expect(event.eventId).toBe(testEventId);
    expect(event.contractAddress).toBe(testContract);
  });
});
