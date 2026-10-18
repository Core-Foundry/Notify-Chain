/**
 * Tests for per-client usage accounting (#989).
 *
 * Verifies that:
 *   - Usage records distinguish clients by type (credential, legacy key, IP, anonymous).
 *   - Aggregation is testable and returns correct summaries.
 *   - Stored identifiers do not expose credential secrets.
 */

import http from 'http';
import { createEventsServer, EventsServerOptions } from '../api/events-server';
import { Database, getDatabase } from '../database/database';
import {
  ClientUsageAccountingService,
  identifyClientSafely,
} from './client-usage-accounting';

jest.mock('@stellar/stellar-sdk', () => ({
  rpc: {
    Server: jest.fn().mockImplementation(() => ({
      getHealth: jest.fn().mockResolvedValue({ status: 'healthy' }),
    })),
  },
}), { virtual: true });

jest.mock('../utils/logger', () => ({
  __esModule: true,
  default: { info: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn() },
  sanitizeUrl: (u: string) => u,
}));

// ─── Unit tests for identifyClientSafely ───────────────────────────────────────

describe('identifyClientSafely (#989)', () => {
  function makeReq(headers: Record<string, string | string[]> = {}, remoteAddress?: string): http.IncomingMessage {
    return {
      headers,
      socket: remoteAddress ? { remoteAddress } : { remoteAddress: '127.0.0.1' },
    } as unknown as http.IncomingMessage;
  }

  it('identifies scoped credentials without exposing the secret', () => {
    const identity = identifyClientSafely(
      makeReq({ 'x-api-key': 'nck_abc123def456_secretvalue123' }),
    );
    expect(identity.clientType).toBe('CREDENTIAL');
    expect(identity.clientId).toBe('credential:abc123def456');
    expect(identity.clientId).not.toContain('secretvalue');
    expect(identity.clientId).not.toContain('nck_');
  });

  it('identifies legacy keys as SHA-256 fingerprints, not raw key', () => {
    const rawKey = 'nc_live_my_legacy_key_abc123';
    const identity = identifyClientSafely(makeReq({ 'x-api-key': rawKey }));
    expect(identity.clientType).toBe('LEGACY_KEY');
    expect(identity.clientId).toMatch(/^legacy:[a-f0-9]{16}$/);
    expect(identity.clientId).not.toContain(rawKey);
  });

  it('identifies Bearer tokens by fingerprint', () => {
    const identity = identifyClientSafely(
      makeReq({ authorization: 'Bearer my-secret-token-value' }),
    );
    expect(identity.clientType).toBe('LEGACY_KEY');
    expect(identity.clientId).toMatch(/^token:[a-f0-9]{16}$/);
    expect(identity.clientId).not.toContain('my-secret-token-value');
  });

  it('identifies clients by IP address (hashed)', () => {
    const identity = identifyClientSafely(
      makeReq({}, '203.0.113.42'),
    );
    expect(identity.clientType).toBe('IP');
    expect(identity.clientId).toMatch(/^ip:[a-f0-9]{16}$/);
    expect(identity.clientId).not.toContain('203.0.113.42');
  });

  it('falls back to anonymous for localhost without credentials', () => {
    const identity = identifyClientSafely(
      makeReq({}, '127.0.0.1'),
    );
    expect(identity.clientType).toBe('ANONYMOUS');
    expect(identity.clientId).toBe('anonymous');
  });

  it('falls back to anonymous when no headers are present', () => {
    const identity = identifyClientSafely(makeReq({}));
    expect(identity.clientType).toBe('ANONYMOUS');
    expect(identity.clientId).toBe('anonymous');
  });
});

// ─── Unit tests for ClientUsageAccountingService ──────────────────────────────

describe('ClientUsageAccountingService (#989)', () => {
  let service: ClientUsageAccountingService;

  beforeEach(() => {
    service = new ClientUsageAccountingService({ useDatabase: false });
  });

  it('records and aggregates usage by client', () => {
    service.recordUsage({
      clientId: 'credential:abc',
      clientType: 'CREDENTIAL',
      endpoint: '/api/events',
      method: 'GET',
      statusCode: 200,
      responseTimeMs: 50,
    });
    service.recordUsage({
      clientId: 'credential:abc',
      clientType: 'CREDENTIAL',
      endpoint: '/api/events',
      method: 'GET',
      statusCode: 200,
      responseTimeMs: 30,
    });
    service.recordUsage({
      clientId: 'credential:abc',
      clientType: 'CREDENTIAL',
      endpoint: '/api/schedule',
      method: 'POST',
      statusCode: 404,
      responseTimeMs: 100,
    });

    const summaries = service.getUsageSummary();
    expect(summaries).toHaveLength(1);
    const summary = summaries[0];
    expect(summary.totalRequests).toBe(3);
    expect(summary.successfulRequests).toBe(2);
    expect(summary.clientErrorRequests).toBe(1);
    expect(summary.serverErrorRequests).toBe(0);
    expect(summary.endpoints['/api/events']).toBe(2);
    expect(summary.endpoints['/api/schedule']).toBe(1);
    expect(summary.methods['GET']).toBe(2);
    expect(summary.methods['POST']).toBe(1);
    expect(summary.averageResponseTimeMs).toBe(60); // (50+30+100)/3
  });

  it('distinguishes between different clients', () => {
    service.recordUsage({
      clientId: 'credential:abc',
      clientType: 'CREDENTIAL',
      endpoint: '/api/events',
      method: 'GET',
      statusCode: 200,
    });
    service.recordUsage({
      clientId: 'legacy:def',
      clientType: 'LEGACY_KEY',
      endpoint: '/api/events',
      method: 'GET',
      statusCode: 200,
    });
    service.recordUsage({
      clientId: 'ip:ghi',
      clientType: 'IP',
      endpoint: '/api/events',
      method: 'GET',
      statusCode: 200,
    });

    const summaries = service.getUsageSummary();
    expect(summaries).toHaveLength(3);
    const types = summaries.map((s) => s.clientType).sort();
    expect(types).toEqual(['CREDENTIAL', 'IP', 'LEGACY_KEY']);
  });

  it('filters by clientId', () => {
    service.recordUsage({
      clientId: 'credential:abc',
      clientType: 'CREDENTIAL',
      endpoint: '/api/events',
      method: 'GET',
      statusCode: 200,
    });
    service.recordUsage({
      clientId: 'legacy:def',
      clientType: 'LEGACY_KEY',
      endpoint: '/api/events',
      method: 'GET',
      statusCode: 200,
    });

    const summaries = service.getUsageSummary({ clientId: 'credential:abc' });
    expect(summaries).toHaveLength(1);
    expect(summaries[0].clientId).toBe('credential:abc');
  });

  it('filters by time range', () => {
    service.recordUsage({
      clientId: 'credential:abc',
      clientType: 'CREDENTIAL',
      endpoint: '/api/events',
      method: 'GET',
      statusCode: 200,
      timestamp: '2024-01-01T00:00:00Z',
    });
    service.recordUsage({
      clientId: 'credential:abc',
      clientType: 'CREDENTIAL',
      endpoint: '/api/events',
      method: 'GET',
      statusCode: 200,
      timestamp: '2024-06-01T00:00:00Z',
    });

    const summaries = service.getUsageSummary({
      since: '2024-03-01T00:00:00Z',
    });
    expect(summaries).toHaveLength(1);
    expect(summaries[0].totalRequests).toBe(1);
    expect(summaries[0].firstSeen).toBe('2024-06-01T00:00:00Z');
  });

  it('counts 5xx responses as server errors', () => {
    service.recordUsage({
      clientId: 'credential:abc',
      clientType: 'CREDENTIAL',
      endpoint: '/api/events',
      method: 'GET',
      statusCode: 500,
    });
    service.recordUsage({
      clientId: 'credential:abc',
      clientType: 'CREDENTIAL',
      endpoint: '/api/events',
      method: 'GET',
      statusCode: 503,
    });

    const summaries = service.getUsageSummary();
    expect(summaries[0].serverErrorRequests).toBe(2);
    expect(summaries[0].successfulRequests).toBe(0);
  });

  it('does not expose credential secrets in stored data', () => {
    const rawKey = 'nck_abc123def456_supersecret123';
    const identity = identifyClientSafely({
      headers: { 'x-api-key': rawKey },
      socket: { remoteAddress: '127.0.0.1' },
    } as unknown as http.IncomingMessage);

    service.recordUsage({
      clientId: identity.clientId,
      clientType: identity.clientType,
      endpoint: '/api/events',
      method: 'GET',
      statusCode: 200,
    });

    const summaries = service.getUsageSummary();
    const json = JSON.stringify(summaries);
    expect(json).not.toContain('supersecret123');
    expect(json).not.toContain(rawKey);
  });

  it('resets in-memory records', () => {
    service.recordUsage({
      clientId: 'credential:abc',
      clientType: 'CREDENTIAL',
      endpoint: '/api/events',
      method: 'GET',
      statusCode: 200,
    });

    service.reset();
    expect(service.getUsageSummary()).toHaveLength(0);
  });
});

// ─── Integration test: /api/usage endpoint ──────────────────────────────────

describe('GET /api/usage endpoint (#989)', () => {
  let db: Database;
  let server: http.Server;
  const ADMIN_KEY = 'nc_live_admin_key_0123456789abc';

  beforeAll(async () => {
    db = getDatabase(':memory:');
    await db.initialize();
    const usageService = new ClientUsageAccountingService({ useDatabase: false });

    // Seed some usage data
    usageService.recordUsage({
      clientId: 'credential:test',
      clientType: 'CREDENTIAL',
      endpoint: '/api/events',
      method: 'GET',
      statusCode: 200,
      responseTimeMs: 25,
    });

    const options: EventsServerOptions = {
      port: 0,
      stellarRpcUrl: 'https://soroban-testnet.stellar.org:443',
      stellarNetworkPassphrase: 'Test SDF Network ; September 2015',
      contractAddresses: [],
      apiKeys: [{ key: ADMIN_KEY, name: 'admin' }],
      usageAccountingService: usageService,
    };

    server = await new Promise<http.Server>((resolve) => {
      const s = createEventsServer(options);
      s.listen(0, '127.0.0.1', () => resolve(s));
    });
  });

  afterAll(async () => {
    await new Promise<void>((resolve, reject) => server.close((e) => (e ? reject(e) : resolve())));
    await db.close();
  });

  function request(path: string, headers: http.OutgoingHttpHeaders = {}): Promise<{ status: number; body: any }> {
    return new Promise((resolve, reject) => {
      const { port } = server.address() as { port: number };
      const req = http.request(
        { host: '127.0.0.1', port, path, method: 'GET', headers },
        (res) => {
          let data = '';
          res.on('data', (c) => (data += c));
          res.on('end', () => {
            try {
              resolve({ status: res.statusCode!, body: JSON.parse(data) });
            } catch {
              resolve({ status: res.statusCode!, body: data });
            }
          });
        },
      );
      req.on('error', reject);
      req.end();
    });
  }

  it('rejects unauthenticated requests with 401', async () => {
    const res = await request('/api/usage');
    expect(res.status).toBe(401);
  });

  it('returns usage summaries with valid key', async () => {
    const res = await request('/api/usage', { 'X-API-Key': ADMIN_KEY });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toBeDefined();
    expect(res.body.count).toBeGreaterThan(0);
  });

  it('supports clientId filter', async () => {
    const res = await request('/api/usage?clientId=credential:test', { 'X-API-Key': ADMIN_KEY });
    expect(res.status).toBe(200);
    expect(res.body.data[0].clientId).toBe('credential:test');
  });
});
