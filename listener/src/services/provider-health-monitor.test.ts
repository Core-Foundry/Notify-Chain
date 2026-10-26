import {
  checkHttpProviderHealth,
  getProviderHealthReport,
  sanitizeProviderUrl,
} from './provider-health-monitor';

describe('Notification Provider Health Checks (Issue #709)', () => {
  describe('sanitizeProviderUrl', () => {
    test('strips discord secret tokens from webhook URLs', () => {
      const raw = 'https://discord.com/api/webhooks/1234567890/SecretAuthTokenXYZ';
      const sanitized = sanitizeProviderUrl(raw);

      expect(sanitized).toBe('https://discord.com/api/webhooks/1234567890/[REDACTED_TOKEN]');
      expect(sanitized).not.toContain('SecretAuthTokenXYZ');
    });

    test('strips basic auth username/passwords from URLs', () => {
      const raw = 'https://user:mypassword@example.com/webhook';
      const sanitized = sanitizeProviderUrl(raw);

      expect(sanitized).not.toContain('mypassword');
      expect(sanitized).toContain('[REDACTED]');
    });
  });

  describe('checkHttpProviderHealth', () => {
    test('returns disabled status when provider URL is not configured', async () => {
      const health = await checkHttpProviderHealth('Webhook', undefined);
      expect(health.status).toBe('disabled');
      expect(health.sanitizedTarget).toBe('Not Configured');
    });

    test('returns healthy status when provider responds 200 OK', async () => {
      const mockFetch = jest.fn().mockResolvedValue({
        ok: true,
        status: 200,
      }) as unknown as typeof fetch;

      const health = await checkHttpProviderHealth('Discord', 'https://discord.com/api/webhooks/123/token', {
        fetchFn: mockFetch,
      });

      expect(health.status).toBe('healthy');
      expect(health.sanitizedTarget).toContain('[REDACTED_TOKEN]');
      expect(health.latencyMs).toBeGreaterThanOrEqual(0);
    });

    test('handles provider failures without leaking credentials', async () => {
      const mockFetch = jest.fn().mockRejectedValue(new Error('Connection refused to secret-server.com:8443')) as unknown as typeof fetch;

      const health = await checkHttpProviderHealth('Webhook', 'https://secret-server.com/hook', {
        fetchFn: mockFetch,
      });

      expect(health.status).toBe('unhealthy');
      expect(health.error).toBeDefined();
    });
  });

  describe('getProviderHealthReport', () => {
    test('aggregates overall health across multiple providers', async () => {
      const mockFetch = jest.fn().mockImplementation((url: string) => {
        if (url.includes('healthy')) {
          return Promise.resolve({ ok: true, status: 200 });
        }
        return Promise.resolve({ ok: false, status: 503 });
      }) as unknown as typeof fetch;

      const report = await getProviderHealthReport(
        [
          { name: 'ProviderA', url: 'https://healthy.com/hook' },
          { name: 'ProviderB', url: 'https://unhealthy.com/hook' },
        ],
        { fetchFn: mockFetch }
      );

      expect(report.status).toBe('unhealthy');
      expect(report.providers.ProviderA.status).toBe('healthy');
      expect(report.providers.ProviderB.status).toBe('unhealthy');
    });
  });
});
