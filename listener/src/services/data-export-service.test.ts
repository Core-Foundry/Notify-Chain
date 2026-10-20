import {
  sanitizeEventRecord,
  sanitizeNotificationRecord,
  sanitizeRecipient,
} from './data-export-service';
import { REDACTED_PLACEHOLDER } from '../utils/redact';

describe('DataExportService Sanitization (#850, #945)', () => {
  describe('sanitizeRecipient', () => {
    it('redacts Discord webhook tokens from recipient URLs', () => {
      const webhook = 'https://discord.com/api/webhooks/123456789/my-super-secret-token';
      const sanitized = sanitizeRecipient(webhook);
      expect(sanitized).toBe(`https://discord.com/api/webhooks/123456789/${REDACTED_PLACEHOLDER}`);
    });

    it('masks email addresses properly', () => {
      const email = 'developer@example.com';
      const sanitized = sanitizeRecipient(email);
      expect(sanitized).toBe('de***r@example.com');
    });
  });

  describe('sanitizeEventRecord', () => {
    it('preserves fields when includeSensitive is true', () => {
      const record = {
        event_id: 'evt-001',
        raw_data: JSON.stringify({
          secretKey: 'SB7G3L75X6JUXZ5J3M7QWBBL4B4R6Z4Y4F3Y7M7QWBBL4B4R6Z4Y4F3Y',
        }),
      };
      const result = sanitizeEventRecord(record, true);
      expect(result).toEqual(record);
    });

    it('redacts secrets inside raw_data JSON string when includeSensitive is false', () => {
      const record = {
        event_id: 'evt-002',
        contract_address: 'CDNJ4...',
        raw_data: JSON.stringify({
          id: 'evt-002',
          apiKey: 'secret-api-key-12345',
          stellarSeed: 'SB7G3L75X6JUXZ5J3M7QWBBL4B4R6Z4Y4F3Y7M7QWBBL4B4R6Z4Y4F3Y',
          safeField: 'normal-value',
        }),
      };

      const sanitized = sanitizeEventRecord(record, false);
      expect(typeof sanitized.raw_data).toBe('string');
      const parsed = JSON.parse(sanitized.raw_data as string);

      expect(parsed.apiKey).toBe(REDACTED_PLACEHOLDER);
      expect(parsed.safeField).toBe('normal-value');
    });

    it('redacts raw_data object if not serialized as string', () => {
      const record = {
        event_id: 'evt-003',
        raw_data: {
          token: 'auth-bearer-token',
          nested: {
            password: 'super-secret-password',
            allowed: 'ok',
          },
        },
      };

      const sanitized = sanitizeEventRecord(record, false);
      const raw = sanitized.raw_data as Record<string, any>;
      expect(raw.token).toBe(REDACTED_PLACEHOLDER);
      expect(raw.nested.password).toBe(REDACTED_PLACEHOLDER);
      expect(raw.nested.allowed).toBe('ok');
    });
  });

  describe('sanitizeNotificationRecord', () => {
    it('redacts sensitive fields in payload and metadata', () => {
      const record = {
        id: 'notif-1',
        target_recipient: 'https://discord.com/api/webhooks/99999/secrettoken',
        payload: JSON.stringify({
          client_secret: 'whsec_testsecret123',
          message: 'hello',
        }),
        metadata: JSON.stringify({
          authToken: 'Bearer secret',
        }),
      };

      const sanitized = sanitizeNotificationRecord(record, false);
      expect(sanitized.target_recipient).toBe(
        `https://discord.com/api/webhooks/99999/${REDACTED_PLACEHOLDER}`
      );
      const payload = sanitized.payload as Record<string, unknown>;
      expect(payload.client_secret).toBe(REDACTED_PLACEHOLDER);
      expect(payload.message).toBe('hello');
    });
  });
});
