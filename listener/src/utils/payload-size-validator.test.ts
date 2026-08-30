import { describe, it, expect } from '@jest/globals';
import {
  validatePayloadSize,
  PayloadTooLargeError,
  DEFAULT_MAX_PAYLOAD_SIZE_BYTES,
} from './payload-size-validator';

describe('validatePayloadSize', () => {
  describe('with default limit (64 KB)', () => {
    it('accepts an empty payload', () => {
      expect(() => validatePayloadSize({})).not.toThrow();
    });

    it('accepts a normal, small payload', () => {
      const payload = { message: 'Hello, NotifyChain!', recipient: 'alice' };
      expect(() => validatePayloadSize(payload)).not.toThrow();
    });

    it('accepts a payload whose serialised size is exactly at the limit', () => {
      // Build a payload that serialises to exactly DEFAULT_MAX_PAYLOAD_SIZE_BYTES bytes.
      // JSON.stringify({data:"<value>"}) wraps the value in '{"data":"..."}' (10 chars overhead).
      const overhead = Buffer.byteLength(JSON.stringify({ data: '' }), 'utf8'); // '{"data":""}' = 11
      const fillLength = DEFAULT_MAX_PAYLOAD_SIZE_BYTES - overhead;
      const payload = { data: 'x'.repeat(fillLength) };
      const byteLength = Buffer.byteLength(JSON.stringify(payload), 'utf8');
      expect(byteLength).toBe(DEFAULT_MAX_PAYLOAD_SIZE_BYTES);
      expect(() => validatePayloadSize(payload)).not.toThrow();
    });

    it('rejects a payload whose serialised size exceeds the limit by 1 byte', () => {
      const overhead = Buffer.byteLength(JSON.stringify({ data: '' }), 'utf8');
      const fillLength = DEFAULT_MAX_PAYLOAD_SIZE_BYTES - overhead + 1;
      const payload = { data: 'x'.repeat(fillLength) };
      expect(() => validatePayloadSize(payload)).toThrow(PayloadTooLargeError);
    });

    it('rejects a clearly oversized payload (well over 64 KB)', () => {
      const payload = { data: 'a'.repeat(100_000) };
      expect(() => validatePayloadSize(payload)).toThrow(PayloadTooLargeError);
    });
  });

  describe('with a custom limit', () => {
    it('accepts a payload within a small custom limit', () => {
      const payload = { msg: 'hi' };
      expect(() => validatePayloadSize(payload, 100)).not.toThrow();
    });

    it('rejects a payload that exceeds a small custom limit', () => {
      const payload = { data: 'x'.repeat(200) };
      expect(() => validatePayloadSize(payload, 100)).toThrow(PayloadTooLargeError);
    });

    it('accepts a payload at exactly the custom limit', () => {
      const overhead = Buffer.byteLength(JSON.stringify({ v: '' }), 'utf8'); // '{"v":""}' = 8
      const fillLength = 50 - overhead;
      const payload = { v: 'x'.repeat(fillLength) };
      const byteLength = Buffer.byteLength(JSON.stringify(payload), 'utf8');
      expect(byteLength).toBe(50);
      expect(() => validatePayloadSize(payload, 50)).not.toThrow();
    });
  });

  describe('PayloadTooLargeError metadata', () => {
    it('exposes the actual size and configured limit', () => {
      const limit = 10;
      const payload = { data: 'x'.repeat(20) };
      let thrown: PayloadTooLargeError | undefined;

      try {
        validatePayloadSize(payload, limit);
      } catch (err) {
        thrown = err as PayloadTooLargeError;
      }

      expect(thrown).toBeInstanceOf(PayloadTooLargeError);
      expect(thrown!.name).toBe('PayloadTooLargeError');
      expect(thrown!.maxSizeBytes).toBe(limit);
      expect(thrown!.payloadSizeBytes).toBeGreaterThan(limit);
    });

    it('includes a human-readable message', () => {
      const limit = 10;
      const payload = { data: 'toolarge' };
      let thrown: Error | undefined;

      try {
        validatePayloadSize(payload, limit);
      } catch (err) {
        thrown = err as Error;
      }

      expect(thrown?.message).toContain('too large');
      expect(thrown?.message).toContain(`${limit}`);
    });
  });

  describe('multibyte UTF-8 characters', () => {
    it('measures byte length correctly for multi-byte characters', () => {
      // Each emoji is 4 bytes in UTF-8. Build a payload slightly over a 50-byte limit.
      // The serialised form {"d":"🚀🚀..."} — each emoji = 4 bytes.
      // Overhead for {"d":""} = 7 bytes.
      // 3 emojis → 12 bytes + 7 overhead = 19 bytes (well under 50).
      // 12 emojis → 48 bytes + 7 = 55 bytes (over 50).
      const smallPayload = { d: '🚀'.repeat(3) };
      expect(() => validatePayloadSize(smallPayload, 50)).not.toThrow();

      const largePayload = { d: '🚀'.repeat(12) };
      expect(() => validatePayloadSize(largePayload, 50)).toThrow(PayloadTooLargeError);
    });

    it('handles nested complex structures and deep objects', () => {
      const nestedPayload = {
        level1: {
          level2: {
            array: [1, 2, 3, 'test', { nested: 'value' }],
          },
        },
      };
      expect(() => validatePayloadSize(nestedPayload, 1000)).not.toThrow();
      expect(() => validatePayloadSize(nestedPayload, 20)).toThrow(PayloadTooLargeError);
    });

    it('handles zero limit edge case', () => {
      expect(() => validatePayloadSize({}, 0)).toThrow(PayloadTooLargeError);
    });
  });
});
