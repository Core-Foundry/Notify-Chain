import http from 'http';
import { createEventsServer } from './events-server';
import { Database, getDatabase } from '../database/database';

jest.mock('@stellar/stellar-sdk', () => ({
  rpc: {
    Server: jest.fn().mockImplementation(() => ({
      getHealth: jest.fn().mockResolvedValue({ status: 'healthy' }),
    })),
  },
}));

jest.mock('../utils/logger', () => ({
  __esModule: true,
  default: { info: jest.fn(), error: jest.fn(), warn: jest.fn() },
}));

const BASE_OPTIONS = {
  port: 0,
  stellarRpcUrl: 'https://soroban-testnet.stellar.org:443',
};

function makeRequest(
  server: http.Server,
  path: string
): Promise<{ status: number; body: unknown }> {
  return new Promise((resolve, reject) => {
    const addr = server.address() as { port: number };
    const req = http.request(
      { host: '127.0.0.1', port: addr.port, path, method: 'GET' },
      (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => resolve({ status: res.statusCode!, body: JSON.parse(data) }));
      }
    );
    req.on('error', reject);
    req.end();
  });
}

function startServer(options: Parameters<typeof createEventsServer>[0]): Promise<http.Server> {
  return new Promise((resolve) => {
    const server = createEventsServer(options);
    server.listen(0, '127.0.0.1', () => resolve(server));
  });
}

function closeServer(server: http.Server): Promise<void> {
  return new Promise((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
}

describe('GET /api/notifications/history', () => {
  let server: http.Server;
  let db: Database;

  beforeAll(async () => {
    db = getDatabase(':memory:');
    await db.initialize();
  });

  afterAll(async () => {
    await db.close();
  });

  afterEach(async () => {
    if (server) await closeServer(server);
  });

  it('returns empty history with correct structure', async () => {
    server = await startServer(BASE_OPTIONS);
    const { status, body } = await makeRequest(server, '/api/notifications/history');

    expect(status).toBe(200);
    expect((body as any).records).toEqual([]);
    expect((body as any).total).toBe(0);
    expect((body as any).limit).toBeDefined();
    expect((body as any).offset).toBeDefined();
  });

  it('supports pagination with limit and offset', async () => {
    server = await startServer(BASE_OPTIONS);
    
    // Insert parent records first
    for (let i = 0; i < 5; i++) {
      await db.run(
        `INSERT INTO scheduled_notifications 
         (payload, notification_type, target_recipient, execute_at, status)
         VALUES (?, ?, ?, ?, ?)`,
        [JSON.stringify({ test: true }), 'discord', 'test_user', new Date().toISOString(), 'COMPLETED']
      );
    }

    // Insert execution log records
    for (let i = 1; i <= 5; i++) {
      await db.run(
        `INSERT INTO notification_execution_log 
         (scheduled_notification_id, execution_attempt, execution_time, status, duration_ms)
         VALUES (?, ?, ?, ?, ?)`,
        [i, 1, new Date().toISOString(), 'SUCCESS', 100]
      );
    }

    const { status, body } = await makeRequest(
      server,
      '/api/notifications/history?limit=2&offset=0'
    );

    expect(status).toBe(200);
    expect((body as any).records.length).toBe(2);
    expect((body as any).total).toBe(5);
    expect((body as any).limit).toBe(2);
    expect((body as any).offset).toBe(0);
  });

  it('filters by status', async () => {
    server = await startServer(BASE_OPTIONS);
    
    // Insert parent records
    for (let i = 0; i < 2; i++) {
      await db.run(
        `INSERT INTO scheduled_notifications 
         (payload, notification_type, target_recipient, execute_at, status)
         VALUES (?, ?, ?, ?, ?)`,
        [JSON.stringify({ test: true }), 'discord', 'test_user', new Date().toISOString(), 'COMPLETED']
      );
    }

    // Insert mixed status data
    await db.run(
      `INSERT INTO notification_execution_log 
       (scheduled_notification_id, execution_attempt, execution_time, status, duration_ms)
       VALUES (?, ?, ?, ?, ?)`,
      [1, 1, new Date().toISOString(), 'SUCCESS', 100]
    );
    await db.run(
      `INSERT INTO notification_execution_log 
       (scheduled_notification_id, execution_attempt, execution_time, status, duration_ms)
       VALUES (?, ?, ?, ?, ?)`,
      [2, 1, new Date().toISOString(), 'FAILED', 200]
    );

    const { status, body } = await makeRequest(
      server,
      '/api/notifications/history?status=SUCCESS'
    );

    expect(status).toBe(200);
    expect((body as any).records.length).toBeGreaterThan(0);
    (body as any).records.forEach((record: any) => {
      expect(record.status).toBe('SUCCESS');
    });
  });

  it('enforces maximum limit of 100', async () => {
    server = await startServer(BASE_OPTIONS);
    const { status, body } = await makeRequest(
      server,
      '/api/notifications/history?limit=200'
    );

    expect(status).toBe(200);
    expect((body as any).limit).toBeLessThanOrEqual(100);
  });

  it('returns 500 on database error', async () => {
    server = await startServer(BASE_OPTIONS);
    
    // Close database to cause error
    await db.close();

    const { status } = await makeRequest(server, '/api/notifications/history');
    expect(status).toBe(500);
  });
});