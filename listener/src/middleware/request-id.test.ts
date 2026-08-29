import { IncomingMessage, ServerResponse } from 'http';
import { attachRequestId, isValidRequestId, resolveRequestId } from './request-id';

describe('Request ID Middleware (Issue #686)', () => {
  describe('isValidRequestId', () => {
    test('accepts valid UUIDs and alphanumeric tokens', () => {
      expect(isValidRequestId('c9bf9e57-1685-4c89-bafb-ff5af830be8a')).toBe(true);
      expect(isValidRequestId('req-123456_abc')).toBe(true);
      expect(isValidRequestId('simpleid')).toBe(true);
    });

    test('rejects empty, invalid characters or oversized IDs', () => {
      expect(isValidRequestId('')).toBe(false);
      expect(isValidRequestId('   ')).toBe(false);
      expect(isValidRequestId('req<script>')).toBe(false);
      expect(isValidRequestId('req with spaces')).toBe(false);
      expect(isValidRequestId('a'.repeat(65))).toBe(false);
    });
  });

  describe('resolveRequestId & attachRequestId', () => {
    test('generates a new UUID when client header is missing', () => {
      const req = { headers: {} } as unknown as IncomingMessage;
      const res = {
        headersSent: false,
        setHeader: jest.fn(),
      } as unknown as ServerResponse;

      const reqId = attachRequestId(req, res);

      expect(reqId).toBeDefined();
      expect(req.headers['x-request-id']).toBe(reqId);
      expect(res.setHeader).toHaveBeenCalledWith('X-Request-ID', reqId);
    });

    test('reuses valid client-supplied request ID', () => {
      const clientReqId = 'client-provided-trace-id-123';
      const req = {
        headers: { 'x-request-id': clientReqId },
      } as unknown as IncomingMessage;
      const res = {
        headersSent: false,
        setHeader: jest.fn(),
      } as unknown as ServerResponse;

      const reqId = attachRequestId(req, res);

      expect(reqId).toBe(clientReqId);
      expect(res.setHeader).toHaveBeenCalledWith('X-Request-ID', clientReqId);
    });

    test('replaces invalid client-supplied request ID with secure random UUID', () => {
      const invalidClientReqId = 'invalid id with spaces & symbols !@#$';
      const req = {
        headers: { 'x-request-id': invalidClientReqId },
      } as unknown as IncomingMessage;
      const res = {
        headersSent: false,
        setHeader: jest.fn(),
      } as unknown as ServerResponse;

      const reqId = attachRequestId(req, res);

      expect(reqId).not.toBe(invalidClientReqId);
      expect(isValidRequestId(reqId)).toBe(true);
      expect(res.setHeader).toHaveBeenCalledWith('X-Request-ID', reqId);
    });
  });
});
