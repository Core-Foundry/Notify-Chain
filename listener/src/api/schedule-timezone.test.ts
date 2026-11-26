/**
 * Timezone normalization for POST /api/schedule (#1162).
 *
 * Verifies that timezone-aware schedule requests are interpreted correctly,
 * normalized to UTC for storage, echoed back in the response, and that
 * invalid timezones are rejected.
 */
import http from 'http';
import { createEventsServer } from './events-server';
import { NotificationAPI } from '../services/notification-api';

jest.mock(
  '@stellar/stellar-sdk',
  () => ({
    rpc: {
      Server: jest.fn().mockImplementation(() => ({
        getHealth: jest.fn().mockResolvedValue({ status: 'healthy' }),
      })),
    },
  }),
  { virtual: true },
);

jest.mock('../utils/logger', () => ({
  __esModule: true,
  default: { info: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn() },
  sanitizeUrl: jest.fn((url: string) => url),
}));

describe('POST /api/schedule timezone handling', () => {
  let server: http.Server;
  let mockNotificationAPI: any;

  beforeEach((done) => {
    mockNotificationAPI = {
      scheduleNotification: jest.fn().mockResolvedValue(42),
      maxPayloadSizeBytes: 65536,
    };

    server = createEventsServer({
      port: 0,
      stellarRpcUrl: 'http://localhost:8000',
      stellarNetworkPassphrase: 'Test SDF Network ; September 2015',
      contractAddresses: [],
      notificationAPI: mockNotificationAPI as unknown as NotificationAPI,
    });

    server.listen(0, '127.0.0.1', done);
  });

  afterEach((done) => {
    server.close(done);
  });

  function post(body: object): Promise<{ status: number; body: any }> {
    return new Promise((resolve, reject) => {
      const port = (server.address() as { port: number }).port;
      const payload = JSON.stringify(body);
      const req = http.request(
        {
          hostname: '127.0.0.1',
          port,
          path: '/api/schedule',
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) },
        },
        (res) => {
          let data = '';
          res.on('data', (chunk) => (data += chunk));
          res.on('end', () => resolve({ status: res.statusCode!, body: data ? JSON.parse(data) : {} }));
        },
      );
      req.on('error', reject);
      req.write(payload);
      req.end();
    });
  }

  const basePayload = { payload: { foo: 'bar' }, targetRecipient: 'recipient-1' };

  it('resolves a timeZone + localDateTime schedule and reports the zone back', async () => {
    const res = await post({
      ...basePayload,
      timeZone: 'America/New_York',
      localDateTime: '2026-06-15T09:00:00',
    });

    expect(res.status).toBe(201);
    expect(res.body.timezone).toBe('America/New_York');
    expect(res.body.executeAt).toBe('2026-06-15T13:00:00.000Z'); // EDT = UTC-4
    expect(res.body.executeAtLocal).toBe('2026-06-15T09:00:00');
  });

  it('defaults a plain executeAt to UTC', async () => {
    const res = await post({ ...basePayload, executeAt: '2026-06-15T13:00:00.000Z' });

    expect(res.status).toBe(201);
    expect(res.body.timezone).toBe('UTC');
    expect(res.body.executeAt).toBe('2026-06-15T13:00:00.000Z');
  });

  it('accepts a naive executeAt paired with a timezone field', async () => {
    const res = await post({
      ...basePayload,
      executeAt: '2026-06-15T09:00:00',
      timezone: 'America/New_York',
    });

    expect(res.status).toBe(201);
    expect(res.body.timezone).toBe('America/New_York');
    expect(res.body.executeAt).toBe('2026-06-15T13:00:00.000Z');
  });

  it('rejects an invalid timezone identifier', async () => {
    const res = await post({
      ...basePayload,
      executeAt: '2026-06-15T09:00:00',
      timezone: 'Not/AZone',
    });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('INVALID_TIMEZONE');
  });
});
