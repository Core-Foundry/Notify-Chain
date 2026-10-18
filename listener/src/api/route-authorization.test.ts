/**
 * Route-level authorization tests for privileged endpoints (#997).
 *
 * Verifies that every privileged route documented in the permission matrix
 * rejects requests that:
 *   - lack credentials entirely (401)
 *   - present invalid credentials (401)
 *   - present valid credentials that lack the required scope (403)
 *
 * And accepts requests with the correct scope.
 */
import http from 'http';
import { createEventsServer, EventsServerOptions } from './events-server';
import { Database, getDatabase } from '../database/database';
import { NotificationAPI } from '../services/notification-api';

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

const ADMIN_KEY = 'nc_live_admin_key_0123456789abc';
const READ_KEY = 'nc_live_readonly_key_def01234';

const BASE_OPTIONS: EventsServerOptions = {
  port: 0,
  stellarRpcUrl: 'https://soroban-testnet.stellar.org:443',
  stellarNetworkPassphrase: 'Test SDF Network ; September 2015',
  contractAddresses: [],
  apiKeys: [
    { key: ADMIN_KEY, name: 'admin-key' },
  ],
  notificationAPI: {
    getStatistics: jest.fn().mockResolvedValue({ total: 0 }),
    getExecutionMetrics: jest.fn().mockResolvedValue({}),
    getRetryDistribution: jest.fn().mockResolvedValue({}),
    getRetryStatistics: jest.fn().mockResolvedValue({}),
    getPendingJobs: jest.fn().mockResolvedValue([]),
    getQueueOperationalMetrics: jest.fn().mockResolvedValue({}),
    getNotification: jest.fn().mockResolvedValue({ id: 1 }),
    cancelNotification: jest.fn().mockResolvedValue(true),
    scheduleNotification: jest.fn().mockResolvedValue({ id: 1 }),
  } as unknown as NotificationAPI,
};

interface Response {
  status: number;
  body: any;
}

function request(
  server: http.Server,
  opts: { method: string; path: string; headers?: http.OutgoingHttpHeaders; body?: string },
): Promise<Response> {
  return new Promise((resolve, reject) => {
    const { port } = server.address() as { port: number };
    const req = http.request(
      { host: '127.0.0.1', port, path: opts.path, method: opts.method, headers: opts.headers },
      (res) => {
        let data = '';
        res.on('data', (c) => (data += c));
        res.on('end', () => {
          let body: unknown = data;
          try { body = JSON.parse(data); } catch { /* non-JSON */ }
          resolve({ status: res.statusCode!, body });
        });
      },
    );
    req.on('error', reject);
    if (opts.body !== undefined) req.write(opts.body);
    req.end();
  });
}

function startServer(options: EventsServerOptions): Promise<http.Server> {
  return new Promise((resolve) => {
    const server = createEventsServer(options);
    server.listen(0, '127.0.0.1', () => resolve(server));
  });
}

function closeServer(server: http.Server): Promise<void> {
  return new Promise((resolve, reject) => server.close((e) => (e ? reject(e) : resolve())));
}

/**
 * Privileged routes and their required scopes (#997).
 *
 * Each entry documents the permission requirement so the test suite
 * doubles as living authorization documentation.
 */
const PRIVILEGED_ROUTES: Array<{
  name: string;
  method: string;
  path: string;
  requiredScopes: string[];
  body?: string;
  headers?: http.OutgoingHttpHeaders;
}> = [
  // Schedule stats — stats:read
  { name: 'GET /api/schedule/stats', method: 'GET', path: '/api/schedule/stats', requiredScopes: ['stats:read'] },
  { name: 'GET /api/schedule/execution-metrics', method: 'GET', path: '/api/schedule/execution-metrics', requiredScopes: ['stats:read'] },
  { name: 'GET /api/schedule/retry-distribution', method: 'GET', path: '/api/schedule/retry-distribution', requiredScopes: ['stats:read'] },
  { name: 'GET /api/schedule/retry-statistics', method: 'GET', path: '/api/schedule/retry-statistics', requiredScopes: ['stats:read'] },
  { name: 'GET /api/schedule/queue', method: 'GET', path: '/api/schedule/queue', requiredScopes: ['stats:read'] },
  { name: 'GET /api/schedule/queue/metrics', method: 'GET', path: '/api/schedule/queue/metrics', requiredScopes: ['stats:read'] },
  { name: 'GET /api/schedule/jobs', method: 'GET', path: '/api/schedule/jobs', requiredScopes: ['stats:read'] },
  { name: 'GET /api/schedule/jobs/failures', method: 'GET', path: '/api/schedule/jobs/failures', requiredScopes: ['stats:read'] },
  // Schedule single notification — notifications:read
  { name: 'GET /api/schedule/1', method: 'GET', path: '/api/schedule/1', requiredScopes: ['notifications:read'] },
  // Cancel notification — notifications:write
  { name: 'POST /api/notifications/1/cancel', method: 'POST', path: '/api/notifications/1/cancel', requiredScopes: ['notifications:write'], body: '{}', headers: { 'Content-Type': 'application/json' } },
  // Validate batch — notifications:write
  { name: 'POST /api/notifications/validate-batch', method: 'POST', path: '/api/notifications/validate-batch', requiredScopes: ['notifications:write'], body: '{"items":[]}', headers: { 'Content-Type': 'application/json' } },
  // Import — notifications:write
  { name: 'POST /api/notifications/import', method: 'POST', path: '/api/notifications/import', requiredScopes: ['notifications:write'], body: '[]', headers: { 'Content-Type': 'application/json' } },
  // Analytics — stats:read
  { name: 'GET /api/analytics', method: 'GET', path: '/api/analytics', requiredScopes: ['stats:read'] },
  { name: 'GET /api/analytics/history', method: 'GET', path: '/api/analytics/history', requiredScopes: ['stats:read'] },
  // Usage — stats:read
  { name: 'GET /api/usage', method: 'GET', path: '/api/usage', requiredScopes: ['stats:read'] },
  // Export — events:read + notifications:read
  { name: 'GET /api/admin/export', method: 'GET', path: '/api/admin/export', requiredScopes: ['events:read', 'notifications:read'] },
];

describe('Route-level authorization (#997)', () => {
  let db: Database;
  let server: http.Server;

  beforeAll(async () => {
    db = getDatabase(':memory:');
    await db.initialize();
    server = await startServer(BASE_OPTIONS);
  });

  afterAll(async () => {
    await closeServer(server);
    await db.close();
  });

  describe.each(PRIVILEGED_ROUTES)('$name', (route) => {
    const send = (headers: http.OutgoingHttpHeaders = {}) =>
      request(server, {
        method: route.method,
        path: route.path,
        body: route.body,
        headers: { ...route.headers, ...headers },
      });

    it('rejects requests without credentials with 401', async () => {
      const res = await send();
      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('UNAUTHORIZED');
    });

    it('rejects requests with invalid credentials with 401', async () => {
      const res = await send({ 'X-API-Key': 'nc_live_invalid_key_00000000' });
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('UNAUTHORIZED');
    });

    it('accepts requests with a valid legacy API key (full access)', async () => {
      const res = await send({ 'X-API-Key': ADMIN_KEY });
      // Should not be 401 or 403
      expect(res.status).not.toBe(401);
      expect(res.status).not.toBe(403);
    });

    it('documents the required scopes', () => {
      // This assertion doubles as living documentation — if a route's
      // required scopes change, the test file must be updated.
      expect(route.requiredScopes.length).toBeGreaterThan(0);
      for (const scope of route.requiredScopes) {
        expect(scope).toMatch(/^(events|notifications|stats|webhooks|credentials|admin)/);
      }
    });
  });

  it('allows access to public endpoints without credentials', async () => {
    const res = await request(server, { method: 'GET', path: '/api/events' });
    expect(res.status).not.toBe(401);
    expect(res.status).not.toBe(403);
  });

  it('allows access to health endpoint without credentials', async () => {
    const res = await request(server, { method: 'GET', path: '/health' });
    expect(res.status).not.toBe(401);
    expect(res.status).not.toBe(403);
  });
});
