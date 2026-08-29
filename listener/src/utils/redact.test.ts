import {
  isSensitiveKey,
  redactSensitiveData,
  redactString,
  REDACTED_PLACEHOLDER,
} from './redact';

describe('Sensitive Field Redaction (Issue #691)', () => {
  describe('isSensitiveKey', () => {
    test('identifies sensitive key names regardless of casing', () => {
      expect(isSensitiveKey('password')).toBe(true);
      expect(isSensitiveKey('PASSWORD')).toBe(true);
      expect(isSensitiveKey('userSecret')).toBe(true);
      expect(isSensitiveKey('authorization')).toBe(true);
      expect(isSensitiveKey('bearer_token')).toBe(true);
      expect(isSensitiveKey('api_key')).toBe(true);
      expect(isSensitiveKey('apiKey')).toBe(true);
      expect(isSensitiveKey('webhook_url')).toBe(true);
      expect(isSensitiveKey('stellar_secret_key')).toBe(true);
    });

    test('ignores non-sensitive key names', () => {
      expect(isSensitiveKey('username')).toBe(false);
      expect(isSensitiveKey('contractAddress')).toBe(false);
      expect(isSensitiveKey('ledgerSequence')).toBe(false);
      expect(isSensitiveKey('eventId')).toBe(false);
    });
  });

  describe('redactString', () => {
    test('redacts bearer tokens in string headers', () => {
      const input = 'Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.xyz';
      const output = redactString(input);
      expect(output).toBe('Authorization: Bearer [REDACTED]');
    });

    test('redacts Discord webhook URLs', () => {
      const input = 'Sending notification to https://discord.com/api/webhooks/123456789/AbCdEfG_SecretToken';
      const output = redactString(input);
      expect(output).toBe('Sending notification to https://discord.com/api/webhooks/[REDACTED_WEBHOOK_URL]');
    });

    test('redacts Stellar secret keys', () => {
      const secret = 'SCZANGBA5YHTNYVVV4C3U252E2B6P6IRKD45DCAHSKV2U2B6P6IRKD45';
      const input = `Sign transaction using ${secret}`;
      const output = redactString(input);
      expect(output).toContain('S[REDACTED_STELLAR_SECRET_KEY]');
      expect(output).not.toContain(secret);
    });
  });

  describe('redactSensitiveData', () => {
    test('redacts sensitive fields in nested objects', () => {
      const rawPayload = {
        userId: 'user-001',
        credentials: {
          apiKey: 'super-secret-key-12345',
          password: 'my-plaintext-password',
        },
        webhookUrl: 'https://discord.com/api/webhooks/999/secret_token',
        status: 'active',
      };

      const sanitized = redactSensitiveData(rawPayload) as typeof rawPayload;

      expect(sanitized.userId).toBe('user-001');
      expect(sanitized.status).toBe('active');
      expect(sanitized.credentials.apiKey).toBe(REDACTED_PLACEHOLDER);
      expect(sanitized.credentials.password).toBe(REDACTED_PLACEHOLDER);
      expect(sanitized.webhookUrl).toBe(REDACTED_PLACEHOLDER);
    });

    test('redacts sensitive information in Error instances and stack traces', () => {
      const secret = 'SCZANGBA5YHTNYVVV4C3U252E2B6P6IRKD45DCAHSKV2U2B6P6IRKD45';
      const err = new Error(`Connection failed with key ${secret}`);

      const sanitized = redactSensitiveData(err) as Record<string, unknown>;

      expect(sanitized.name).toBe('Error');
      expect(sanitized.message).not.toContain(secret);
      expect(sanitized.message).toContain('S[REDACTED_STELLAR_SECRET_KEY]');
      if (sanitized.stack) {
        expect(sanitized.stack).not.toContain(secret);
      }
    });

    test('handles circular references gracefully without crashing', () => {
      const circular: Record<string, unknown> = { name: 'cyclic' };
      circular.self = circular;

      expect(() => redactSensitiveData(circular)).not.toThrow();
    });
  });
});
