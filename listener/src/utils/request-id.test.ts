import { IncomingMessage, ServerResponse } from 'http';
import {
  applyRequestContext,
  isValidRequestId,
  resolveRequestId,
  resolveCorrelationId,
} from './request-id';

describe('Request ID & Correlation ID Utilities (Issue #686)', () => {
  describe('isValidRequestId', () => {
    test('validates safe alphanumeric and uuid tokens', () => {
      expect(isValidRequestId('c9bf9e57-1685-4c89-bafb-ff5af830be8a')).toBe(true);
      expect(isValidRequestId('req-123456_abc')).toBe(true);
      expect(isValidRequestId('simpleid')).toBe(true);
    });

    test('rejects unsafe, empty or oversized IDs', () => {
      expect(isValidRequestId('')).toBe(false);
      expect(isValidRequestId('   ')).toBe(false);
      expect(isValidRequestId('req<script>')).toBe(false);
      expect(isValidRequestId('req with spaces')).toBe(false);
      expect(isValidRequestId('a'.repeat(65))).toBe(false);
    });
  });

  describe('resolveRequestId & resolveCorrelationId', () => {
    test('reuses valid client-supplied headers', () => {
      expect(resolveRequestId('client-req-001')).toBe('client-req-001');
      expect(resolveCorrelationId('corr-id-xyz')).toBe('corr-id-xyz');
    });

    test('generates fresh IDs when header is missing or invalid', () => {
      const generatedReqId = resolveRequestId(undefined);
      expect(generatedReqId).toBeDefined();
      expect(typeof generatedReqId).toBe('string');

      const sanitizedReqId = resolveRequestId('invalid id with spaces');
      expect(sanitizedReqId).not.toBe('invalid id with spaces');
      expect(isValidRequestId(sanitizedReqId)).toBe(true);
    });
  });

  describe('applyRequestContext', () => {
    test('attaches headers to request and response objects', () => {
      const req = { headers: { 'x-request-id': 'valid-trace-id' } } as unknown as IncomingMessage;
      const res = {
        headersSent: false,
        setHeader: jest.fn(),
      } as unknown as ServerResponse;

      const ctx = applyRequestContext(req, res);

      expect(ctx.requestId).toBe('valid-trace-id');
      expect(req.headers['x-request-id']).toBe('valid-trace-id');
      expect(res.setHeader).toHaveBeenCalledWith('X-Request-ID', 'valid-trace-id');
      expect(res.setHeader).toHaveBeenCalledWith('X-Correlation-ID', expect.any(String));
    });
  });
});
