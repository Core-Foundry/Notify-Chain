import http from 'http';
import { EventEmitter } from 'events';
import {
  CSRF_TOKEN_COOKIE,
  CSRF_TOKEN_HEADER,
  handleCsrfProtection,
  issueCsrfToken,
  validateCsrfSecret,
  verifyCsrfToken,
} from './csrf-protection';

function makeRequest(method: string, headers: http.IncomingHttpHeaders): http.IncomingMessage {
  const req = new EventEmitter() as http.IncomingMessage;
  req.method = method;
  req.headers = headers;
  return req;
}

function makeResponse(): http.ServerResponse & {
  statusCode: number;
  headers: Record<string, string>;
  body?: unknown;
} {
  const res = new EventEmitter() as any;
  res.statusCode = 0;
  res.headers = {};
  res.setHeader = jest.fn((name: string, value: string) => {
    res.headers[name.toLowerCase()] = value;
    return res;
  });
  res.writeHead = jest.fn((status: number) => {
    res.statusCode = status;
    return res;
  });
  res.end = jest.fn((body?: string) => {
    res.body = body ? JSON.parse(body) : undefined;
    return res;
  });
  return res;
}

const origin = 'https://dashboard.example.test';
const config = {
  pathname: '/api/csrf-token',
  allowedOrigin: origin,
  isProduction: true,
};

describe('CSRF protection', () => {
  it('creates origin-bound tokens that expire and cannot be used from another origin', () => {
    const now = 1_800_000_000_000;
    const token = issueCsrfToken(origin, now);

    expect(verifyCsrfToken(token, origin, now)).toBe(true);
    expect(verifyCsrfToken(token, 'https://attacker.example.test', now)).toBe(false);
    expect(verifyCsrfToken(token, origin, now + 60 * 60 * 1000)).toBe(false);
    expect(verifyCsrfToken(`${token}x`, origin, now)).toBe(false);
  });

  it('supports shared signing secrets and rejects weak configured secrets', () => {
    const secret = 'a'.repeat(32);
    const token = issueCsrfToken(origin, Date.now(), secret);
    expect(verifyCsrfToken(token, origin, Date.now(), secret)).toBe(true);
    expect(verifyCsrfToken(token, origin, Date.now(), 'b'.repeat(32))).toBe(false);
    expect(() => validateCsrfSecret('too-short')).toThrow(
      'CSRF secret must contain at least 32 bytes',
    );
  });

  it('issues a short-lived HttpOnly SameSite=Strict cookie only to the configured origin', () => {
    const req = makeRequest('GET', { origin });
    const res = makeResponse();

    expect(handleCsrfProtection(req, res, config, 1_800_000_000_000)).toBe(true);
    expect(res.statusCode).toBe(200);
    const cookie = res.headers['set-cookie'];
    expect(cookie).toContain(`${CSRF_TOKEN_COOKIE}=`);
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('SameSite=None');
    expect(cookie).toContain('Secure');

    const issuedToken = (res.body as { token: string }).token;
    expect(verifyCsrfToken(issuedToken, origin, 1_800_000_000_000)).toBe(true);

    const rejected = makeResponse();
    expect(
      handleCsrfProtection(
        makeRequest('GET', { origin: 'https://attacker.example.test' }),
        rejected,
        config,
      ),
    ).toBe(true);
    expect(rejected.statusCode).toBe(403);
  });

  it('uses SameSite=Strict without Secure for local HTTP development', () => {
    const res = makeResponse();
    handleCsrfProtection(makeRequest('GET', { origin }), res, {
      ...config,
      isProduction: false,
    });

    expect(res.headers['set-cookie']).toContain('SameSite=Strict');
    expect(res.headers['set-cookie']).not.toContain('Secure');
  });

  it('rejects cross-origin and missing-token browser mutations', () => {
    const attackerResponse = makeResponse();
    expect(
      handleCsrfProtection(
        makeRequest('POST', { origin: 'https://attacker.example.test' }),
        attackerResponse,
        { ...config, pathname: '/api/templates' },
      ),
    ).toBe(true);
    expect(attackerResponse.statusCode).toBe(403);

    const noTokenResponse = makeResponse();
    expect(
      handleCsrfProtection(makeRequest('POST', { origin }), noTokenResponse, {
        ...config,
        pathname: '/api/templates',
      }),
    ).toBe(true);
    expect(noTokenResponse.statusCode).toBe(403);
  });

  it('accepts a matching origin-bound cookie and header, and allows non-cookie API clients', () => {
    const now = 1_800_000_000_000;
    const token = issueCsrfToken(origin, now);
    const req = makeRequest('DELETE', {
      origin,
      cookie: `${CSRF_TOKEN_COOKIE}=${token}`,
      [CSRF_TOKEN_HEADER]: token,
    });

    expect(
      handleCsrfProtection(req, makeResponse(), { ...config, pathname: '/api/templates/123' }, now),
    ).toBe(false);

    expect(
      handleCsrfProtection(makeRequest('POST', {}), makeResponse(), {
        ...config,
        pathname: '/api/integration',
      }),
    ).toBe(false);
  });
});
