import http from 'http';
import { createCorsPolicy, parseAllowedOrigins, validateOriginUrl } from './cors-policy';

describe('Environment-Specific CORS Policies (#998)', () => {
  describe('Origin Parsing and URL Validation', () => {
    it('parses comma-separated origins', () => {
      const parsed = parseAllowedOrigins('https://example.com, https://app.notifychain.io');
      expect(parsed).toEqual(['https://example.com', 'https://app.notifychain.io']);
    });

    it('parses JSON array of origins', () => {
      const parsed = parseAllowedOrigins('["https://example.com", "https://app.notifychain.io"]');
      expect(parsed).toEqual(['https://example.com', 'https://app.notifychain.io']);
    });

    it('rejects invalid protocol URLs', () => {
      expect(() => validateOriginUrl('ftp://example.com')).toThrow(/Protocol must be http: or https:/);
    });

    it('rejects origin URLs with paths', () => {
      expect(() => validateOriginUrl('https://example.com/api')).toThrow(/Origin cannot contain path segments/);
    });
  });

  describe('Environment-Specific Defaults and Restrictions', () => {
    it('provides permissive localhost defaults in development when unconfigured', () => {
      const policy = createCorsPolicy({ nodeEnv: 'development' });
      expect(policy.isOriginAllowed('http://localhost:3000')).toBe(true);
      expect(policy.isOriginAllowed('http://localhost:5173')).toBe(true);
      expect(policy.isOriginAllowed('http://127.0.0.1:3000')).toBe(true);
      expect(policy.isOriginAllowed('https://malicious.com')).toBe(false);
    });

    it('enforces restrictive defaults in production when unconfigured', () => {
      const policy = createCorsPolicy({ nodeEnv: 'production' });
      expect(policy.allowedOrigins).toEqual([]);
      expect(policy.isOriginAllowed('http://localhost:3000')).toBe(false);
      expect(policy.isOriginAllowed('https://example.com')).toBe(false);
    });

    it('enforces restrictive defaults in staging when unconfigured', () => {
      const policy = createCorsPolicy({ nodeEnv: 'staging' });
      expect(policy.allowedOrigins).toEqual([]);
      expect(policy.isOriginAllowed('http://localhost:3000')).toBe(false);
    });

    it('prohibits wildcard origins in production', () => {
      expect(() =>
        createCorsPolicy({ origins: '*', nodeEnv: 'production' })
      ).toThrow(/Wildcard origin .* is prohibited in production/);
    });

    it('prohibits wildcard origins in staging', () => {
      expect(() =>
        createCorsPolicy({ origins: '*', nodeEnv: 'staging' })
      ).toThrow(/Wildcard origin .* is prohibited in staging/);
    });

    it('allows configured origins in production', () => {
      const policy = createCorsPolicy({
        origins: 'https://app.notifychain.io, https://dashboard.notifychain.io',
        nodeEnv: 'production',
      });
      expect(policy.isOriginAllowed('https://app.notifychain.io')).toBe(true);
      expect(policy.isOriginAllowed('https://dashboard.notifychain.io')).toBe(true);
      expect(policy.isOriginAllowed('https://evil.com')).toBe(false);
    });
  });

  describe('Preflight and Rejected-Origin Handling', () => {
    function createMockResponse() {
      const headers: Record<string, string> = {};
      let statusCode = 200;
      let ended = false;
      let body = '';

      return {
        setHeader: jest.fn((key: string, value: string) => {
          headers[key.toLowerCase()] = value;
        }),
        getHeader: jest.fn((key: string) => headers[key.toLowerCase()]),
        writeHead: jest.fn((code: number) => {
          statusCode = code;
        }),
        end: jest.fn((chunk?: string) => {
          if (chunk) body = chunk;
          ended = true;
        }),
        get headers() {
          return headers;
        },
        get statusCode() {
          return statusCode;
        },
        get ended() {
          return ended;
        },
        get body() {
          return body;
        },
      } as unknown as http.ServerResponse & {
        headers: Record<string, string>;
        statusCode: number;
        ended: boolean;
        body: string;
      };
    }

    it('handles preflight OPTIONS request for allowed origin with 204 and CORS headers', () => {
      const policy = createCorsPolicy({
        origins: 'https://app.notifychain.io',
        nodeEnv: 'production',
      });
      const req = {
        method: 'OPTIONS',
        url: '/api/events',
        headers: {
          origin: 'https://app.notifychain.io',
          'access-control-request-method': 'POST',
        },
      } as unknown as http.IncomingMessage;
      const res = createMockResponse();

      const result = policy.handleCors(req, res);

      expect(result.allowed).toBe(true);
      expect(result.isPreflight).toBe(true);
      expect(res.writeHead).toHaveBeenCalledWith(204);
      expect(res.end).toHaveBeenCalled();
      expect(res.headers['access-control-allow-origin']).toBe('https://app.notifychain.io');
      expect(res.headers['access-control-allow-methods']).toContain('POST');
    });

    it('rejects preflight OPTIONS request for unallowed origin with 403 and no CORS headers', () => {
      const policy = createCorsPolicy({
        origins: 'https://app.notifychain.io',
        nodeEnv: 'production',
      });
      const req = {
        method: 'OPTIONS',
        url: '/api/events',
        headers: {
          origin: 'https://attacker.com',
          'access-control-request-method': 'POST',
        },
      } as unknown as http.IncomingMessage;
      const res = createMockResponse();

      const result = policy.handleCors(req, res);

      expect(result.allowed).toBe(false);
      expect(result.isPreflight).toBe(true);
      expect(res.statusCode).toBe(403);
      expect(res.headers['access-control-allow-origin']).toBeUndefined();
    });

    it('allows cross-origin GET request from allowed origin', () => {
      const policy = createCorsPolicy({
        origins: 'https://app.notifychain.io',
        nodeEnv: 'production',
      });
      const req = {
        method: 'GET',
        url: '/api/events',
        headers: {
          origin: 'https://app.notifychain.io',
        },
      } as unknown as http.IncomingMessage;
      const res = createMockResponse();

      const result = policy.handleCors(req, res);

      expect(result.allowed).toBe(true);
      expect(result.isPreflight).toBe(false);
      expect(res.headers['access-control-allow-origin']).toBe('https://app.notifychain.io');
    });

    it('rejects cross-origin GET request from unallowed origin with 403', () => {
      const policy = createCorsPolicy({
        origins: 'https://app.notifychain.io',
        nodeEnv: 'production',
      });
      const req = {
        method: 'GET',
        url: '/api/events',
        headers: {
          origin: 'https://untrusted-site.com',
        },
      } as unknown as http.IncomingMessage;
      const res = createMockResponse();

      const result = policy.handleCors(req, res);

      expect(result.allowed).toBe(false);
      expect(result.isPreflight).toBe(false);
      expect(res.statusCode).toBe(403);
      expect(res.headers['access-control-allow-origin']).toBeUndefined();
    });

    it('passes through server-to-server request without origin header', () => {
      const policy = createCorsPolicy({
        origins: 'https://app.notifychain.io',
        nodeEnv: 'production',
      });
      const req = {
        method: 'GET',
        url: '/api/events',
        headers: {},
      } as unknown as http.IncomingMessage;
      const res = createMockResponse();

      const result = policy.handleCors(req, res);

      expect(result.allowed).toBe(true);
      expect(result.isPreflight).toBe(false);
      expect(res.headers['access-control-allow-origin']).toBeUndefined();
    });
  });
});
