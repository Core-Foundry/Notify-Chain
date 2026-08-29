import { IncomingMessage, ServerResponse } from 'http';
import { applySecurityHeaders, DEFAULT_SECURITY_HEADERS, HSTS_HEADER } from './security-headers';

describe('Security Headers Middleware (Issue #690)', () => {
  test('attaches core security headers to HTTP responses', () => {
    const headersMap: Record<string, string> = {};
    const req = {} as IncomingMessage;
    const res = {
      hasHeader: jest.fn((name: string) => name in headersMap),
      setHeader: jest.fn((name: string, value: string) => {
        headersMap[name] = value;
      }),
    } as unknown as ServerResponse;

    applySecurityHeaders(req, res, { isProduction: false });

    expect(res.setHeader).toHaveBeenCalledWith('X-Content-Type-Options', 'nosniff');
    expect(res.setHeader).toHaveBeenCalledWith('X-Frame-Options', 'DENY');
    expect(res.setHeader).toHaveBeenCalledWith('Referrer-Policy', 'strict-origin-when-cross-origin');
    expect(res.setHeader).toHaveBeenCalledWith('X-XSS-Protection', '0');
    expect(res.setHeader).toHaveBeenCalledWith('Content-Security-Policy', expect.stringContaining("default-src 'self'"));
  });

  test('enables HSTS in production environments', () => {
    const headersMap: Record<string, string> = {};
    const req = {} as IncomingMessage;
    const res = {
      hasHeader: jest.fn((name: string) => name in headersMap),
      setHeader: jest.fn((name: string, value: string) => {
        headersMap[name] = value;
      }),
    } as unknown as ServerResponse;

    applySecurityHeaders(req, res, { isProduction: true, enableHsts: true });

    expect(res.setHeader).toHaveBeenCalledWith('Strict-Transport-Security', HSTS_HEADER);
  });

  test('does not overwrite existing custom headers', () => {
    const headersMap: Record<string, string> = {
      'X-Frame-Options': 'SAMEORIGIN',
    };
    const req = {} as IncomingMessage;
    const res = {
      hasHeader: jest.fn((name: string) => name in headersMap),
      setHeader: jest.fn((name: string, value: string) => {
        headersMap[name] = value;
      }),
    } as unknown as ServerResponse;

    applySecurityHeaders(req, res, { isProduction: false });

    expect(res.setHeader).not.toHaveBeenCalledWith('X-Frame-Options', 'DENY');
  });
});
