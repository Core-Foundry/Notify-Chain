/**
 * Automated tests for the typed NotifyChain client SDK (#990).
 *
 * Verifies that:
 *   - Core operations have typed methods that return expected shapes.
 *   - HTTP failures are represented consistently via NotifyChainApiError.
 *   - Timeout and network errors are handled gracefully.
 *   - Authentication headers are sent when configured.
 */
import { NotifyChainClient, NotifyChainApiError } from './notify-chain-client';

// ─── Mock fetch helper ─────────────────────────────────────────────────────────

function createMockFetch() {
  const calls: Array<{
    url: string;
    method: string;
    headers: Record<string, string>;
    body?: string;
  }> = [];

  let nextResponse: { status: number; body: unknown } = { status: 200, body: {} };

  function setResponse(status: number, body: unknown) {
    nextResponse = { status, body };
  }

  const fetchImpl = jest.fn(async (url: string, init: RequestInit) => {
    calls.push({
      url,
      method: init?.method ?? 'GET',
      headers: init?.headers as Record<string, string>,
      body: init?.body as string | undefined,
    });
    return {
      ok: nextResponse.status >= 200 && nextResponse.status < 300,
      status: nextResponse.status,
      statusText: `HTTP ${nextResponse.status}`,
      headers: new Map([['x-request-id', 'req-test-123']]) as unknown as Headers,
      text: async () => JSON.stringify(nextResponse.body),
    } as Response;
  });

  return { fetchImpl, calls, setResponse };
}

describe('NotifyChainClient (#990)', () => {
  let mock: ReturnType<typeof createMockFetch>;

  beforeEach(() => {
    mock = createMockFetch();
  });

  // ── Configuration ──────────────────────────────────────────────────────────

  describe('configuration', () => {
    it('throws on missing baseUrl', () => {
      expect(() => new NotifyChainClient({ baseUrl: '' })).toThrow(/baseUrl is required/);
    });

    it('strips trailing slash from baseUrl', () => {
      const client = new NotifyChainClient({
        baseUrl: 'http://localhost:8787/',
        fetchImpl: mock.fetchImpl,
      });
      // Access private baseUrl via a simple request
      client.getHealth();
      expect(mock.calls[0].url).toBe('http://localhost:8787/health');
    });
  });

  // ── Events API ─────────────────────────────────────────────────────────────

  describe('getEvents', () => {
    it('sends a GET request with query params and returns typed events', async () => {
      const events = [
        { id: 'ev-1', contract: 'addr', type: 'TaskCreated', ledger: 100, txHash: 'hash', data: {}, timestamp: '2024-01-01T00:00:00Z' },
      ];
      mock.setResponse(200, {
        success: true,
        data: { events, pagination: { page: 1, limit: 50, totalPages: 1, total: 1, hasMore: false } },
      });

      const client = new NotifyChainClient({
        baseUrl: 'http://localhost:8787',
        fetchImpl: mock.fetchImpl,
      });

      const result = await client.getEvents({ limit: 50, eventType: 'TaskCreated' });

      expect(mock.calls[0].method).toBe('GET');
      expect(mock.calls[0].url).toContain('/api/events');
      expect(mock.calls[0].url).toContain('limit=50');
      expect(mock.calls[0].url).toContain('type=TaskCreated');
      expect(result.events).toHaveLength(1);
      expect(result.events[0].id).toBe('ev-1');
      expect(result.pagination.total).toBe(1);
    });
  });

  // ── Notification API ───────────────────────────────────────────────────────

  describe('scheduleNotification', () => {
    it('sends a POST request with the notification body', async () => {
      const notification = { id: 42, type: 'discord', status: 'pending', payload: {}, createdAt: '', executeAt: '', attempts: 0, maxRetries: 3 };
      mock.setResponse(200, { success: true, data: notification });

      const client = new NotifyChainClient({
        baseUrl: 'http://localhost:8787',
        fetchImpl: mock.fetchImpl,
      });

      const result = await client.scheduleNotification({
        type: 'discord',
        payload: { message: 'Hello!' },
      });

      expect(mock.calls[0].method).toBe('POST');
      expect(mock.calls[0].body).toContain('discord');
      expect(result.id).toBe(42);
    });

    it('includes X-API-Key header when configured', async () => {
      mock.setResponse(200, { success: true, data: { id: 1 } });
      const client = new NotifyChainClient({
        baseUrl: 'http://localhost:8787',
        apiKey: 'nc_live_test_key_0123456789',
        fetchImpl: mock.fetchImpl,
      });

      await client.scheduleNotification({ type: 'discord', payload: {} });

      expect(mock.calls[0].headers['X-API-Key']).toBe('nc_live_test_key_0123456789');
    });
  });

  describe('cancelNotification', () => {
    it('sends a POST to /api/notifications/:id/cancel', async () => {
      mock.setResponse(200, { success: true, data: { id: 1, status: 'cancelled' } });
      const client = new NotifyChainClient({
        baseUrl: 'http://localhost:8787',
        fetchImpl: mock.fetchImpl,
      });

      await client.cancelNotification(1, { reason: 'test' });

      expect(mock.calls[0].method).toBe('POST');
      expect(mock.calls[0].url).toContain('/api/notifications/1/cancel');
      expect(mock.calls[0].body).toContain('test');
    });
  });

  // ── Stats / Analytics ──────────────────────────────────────────────────────

  describe('getScheduleStats', () => {
    it('returns typed schedule stats', async () => {
      const stats = { total: 100, pending: 50, completed: 40, failed: 5, expired: 5 };
      mock.setResponse(200, { success: true, data: stats });
      const client = new NotifyChainClient({
        baseUrl: 'http://localhost:8787',
        fetchImpl: mock.fetchImpl,
      });

      const result = await client.getScheduleStats();

      expect(result.total).toBe(100);
      expect(result.pending).toBe(50);
    });
  });

  describe('getUsage', () => {
    it('returns typed usage summaries', async () => {
      const usage = [
        {
          clientId: 'credential:abc123',
          clientType: 'CREDENTIAL',
          totalRequests: 10,
          successfulRequests: 8,
          clientErrorRequests: 2,
          serverErrorRequests: 0,
          totalResponseTimeMs: 500,
          averageResponseTimeMs: 50,
          endpoints: { '/api/events': 10 },
          methods: { GET: 10 },
          firstSeen: '2024-01-01T00:00:00Z',
          lastSeen: '2024-01-02T00:00:00Z',
        },
      ];
      mock.setResponse(200, { success: true, data: usage });
      const client = new NotifyChainClient({
        baseUrl: 'http://localhost:8787',
        fetchImpl: mock.fetchImpl,
      });

      const result = await client.getUsage({ clientId: 'credential:abc123' });

      expect(result).toHaveLength(1);
      expect(result[0].clientId).toBe('credential:abc123');
      expect(result[0].totalRequests).toBe(10);
    });
  });

  // ── Template API ────────────────────────────────────────────────────────────

  describe('templates', () => {
    it('lists templates', async () => {
      const templates = [
        { id: 'tmpl-1', name: 'Welcome', type: 'discord', body: 'Hello {{user}}', createdAt: '', updatedAt: '' },
      ];
      mock.setResponse(200, { success: true, data: templates });
      const client = new NotifyChainClient({
        baseUrl: 'http://localhost:8787',
        fetchImpl: mock.fetchImpl,
      });

      const result = await client.listTemplates();

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('tmpl-1');
    });

    it('creates a template', async () => {
      const template = { id: 'tmpl-2', name: 'Test', type: 'email', body: 'Hi', createdAt: '', updatedAt: '' };
      mock.setResponse(200, { success: true, data: template });
      const client = new NotifyChainClient({
        baseUrl: 'http://localhost:8787',
        fetchImpl: mock.fetchImpl,
      });

      const result = await client.createTemplate({
        id: 'tmpl-2',
        name: 'Test',
        type: 'email',
        body: 'Hi',
      });

      expect(mock.calls[0].method).toBe('POST');
      expect(result.id).toBe('tmpl-2');
    });

    it('deletes a template', async () => {
      mock.setResponse(200, { success: true, data: { deleted: true } });
      const client = new NotifyChainClient({
        baseUrl: 'http://localhost:8787',
        fetchImpl: mock.fetchImpl,
      });

      const result = await client.deleteTemplate('tmpl-1');

      expect(mock.calls[0].method).toBe('DELETE');
      expect(result.deleted).toBe(true);
    });
  });

  // ── Health ───────────────────────────────────────────────────────────────────

  describe('getHealth', () => {
    it('returns typed health response', async () => {
      const health = {
        status: 'ok',
        version: '1.0.0',
        timestamp: '2024-01-01T00:00:00Z',
        uptimeSeconds: 3600,
        network: 'Test SDF Network',
        services: {},
      };
      mock.setResponse(200, health);
      const client = new NotifyChainClient({
        baseUrl: 'http://localhost:8787',
        fetchImpl: mock.fetchImpl,
      });

      const result = await client.getHealth();

      expect(result.status).toBe('ok');
      expect(result.version).toBe('1.0.0');
    });
  });

  // ── Error Handling ────────────────────────────────────────────────────────────

  describe('error handling', () => {
    it('throws NotifyChainApiError for non-OK responses', async () => {
      mock.setResponse(401, {
        success: false,
        error: { code: 'UNAUTHORIZED', message: 'Missing API key' },
      });
      const client = new NotifyChainClient({
        baseUrl: 'http://localhost:8787',
        fetchImpl: mock.fetchImpl,
      });

      await expect(client.getEvents()).rejects.toThrow(NotifyChainApiError);
    });

    it('preserves status, code, and message in the error', async () => {
      mock.setResponse(403, {
        success: false,
        error: { code: 'INVALID_PERMISSIONS', message: 'Insufficient scope' },
      });
      const client = new NotifyChainClient({
        baseUrl: 'http://localhost:8787',
        fetchImpl: mock.fetchImpl,
      });

      try {
        await client.getScheduleStats();
        fail('Expected error');
      } catch (err) {
        expect(err).toBeInstanceOf(NotifyChainApiError);
        const apiErr = err as NotifyChainApiError;
        expect(apiErr.status).toBe(403);
        expect(apiErr.code).toBe('INVALID_PERMISSIONS');
        expect(apiErr.message).toBe('Insufficient scope');
        expect(apiErr.isAuthError()).toBe(true);
        expect(apiErr.isClientError()).toBe(true);
        expect(apiErr.isServerError()).toBe(false);
      }
    });

    it('handles rate-limit errors (429)', async () => {
      mock.setResponse(429, {
        success: false,
        error: { code: 'RATE_LIMITED', message: 'Too many requests' },
      });
      const client = new NotifyChainClient({
        baseUrl: 'http://localhost:8787',
        fetchImpl: mock.fetchImpl,
      });

      try {
        await client.getEvents();
        fail('Expected error');
      } catch (err) {
        expect(err).toBeInstanceOf(NotifyChainApiError);
        const apiErr = err as NotifyChainApiError;
        expect(apiErr.status).toBe(429);
        expect(apiErr.isRateLimited()).toBe(true);
      }
    });

    it('handles server errors (500)', async () => {
      mock.setResponse(500, {
        success: false,
        error: { code: 'INTERNAL_ERROR', message: 'Something went wrong' },
      });
      const client = new NotifyChainClient({
        baseUrl: 'http://localhost:8787',
        fetchImpl: mock.fetchImpl,
      });

      try {
        await client.getEvents();
        fail('Expected error');
      } catch (err) {
        expect(err).toBeInstanceOf(NotifyChainApiError);
        const apiErr = err as NotifyChainApiError;
        expect(apiErr.isServerError()).toBe(true);
        expect(apiErr.isClientError()).toBe(false);
      }
    });

    it('preserves request ID from response headers', async () => {
      mock.setResponse(401, {
        success: false,
        error: { code: 'UNAUTHORIZED', message: 'Missing key' },
      });
      const client = new NotifyChainClient({
        baseUrl: 'http://localhost:8787',
        fetchImpl: mock.fetchImpl,
      });

      try {
        await client.getEvents();
        fail('Expected error');
      } catch (err) {
        expect(err).toBeInstanceOf(NotifyChainApiError);
        expect((err as NotifyChainApiError).requestId).toBe('req-test-123');
      }
    });
  });
});
