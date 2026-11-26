import crypto from 'crypto';
import http from 'http';
import { ErrorCode } from '../errors/api-error-codes';
import { sendErr, sendJson } from '../utils/response';

export const CSRF_TOKEN_COOKIE = 'csrf_token';
export const CSRF_TOKEN_HEADER = 'x-csrf-token';
export const CSRF_TOKEN_TTL_SECONDS = 60 * 60;

const csrfSigningKey = crypto.randomBytes(32);

function resolveSigningKey(secret?: string | Buffer): Buffer {
  if (secret === undefined) return csrfSigningKey;
  const key = Buffer.isBuffer(secret) ? secret : Buffer.from(secret, 'utf8');
  if (key.length < 32) throw new RangeError('CSRF secret must contain at least 32 bytes');
  return key;
}

export function validateCsrfSecret(secret?: string | Buffer): void {
  resolveSigningKey(secret);
}

function signToken(payload: string, origin: string, secret?: string | Buffer): string {
  return crypto
    .createHmac('sha256', resolveSigningKey(secret))
    .update(`${payload}\n${origin}`)
    .digest('hex');
}

export function issueCsrfToken(origin: string, now = Date.now(), secret?: string | Buffer): string {
  const expiresAt = Math.floor(now / 1000) + CSRF_TOKEN_TTL_SECONDS;
  const payload = `${expiresAt}.${crypto.randomBytes(32).toString('base64url')}`;
  return `${payload}.${signToken(payload, origin, secret)}`;
}

export function verifyCsrfToken(
  token: string,
  origin: string,
  now = Date.now(),
  secret?: string | Buffer,
): boolean {
  const [expiresAtText, nonce, signature, ...extra] = token.split('.');
  if (
    extra.length > 0 ||
    !/^\d+$/.test(expiresAtText ?? '') ||
    !/^[A-Za-z0-9_-]{43}$/.test(nonce ?? '') ||
    !/^[a-f0-9]{64}$/.test(signature ?? '')
  ) {
    return false;
  }

  const expiresAt = Number(expiresAtText);
  if (!Number.isSafeInteger(expiresAt) || expiresAt <= Math.floor(now / 1000)) return false;

  const expected = Buffer.from(signToken(`${expiresAtText}.${nonce}`, origin, secret), 'hex');
  const provided = Buffer.from(signature, 'hex');
  return crypto.timingSafeEqual(expected, provided);
}

function readCsrfCookie(cookieHeader: string | undefined): string | undefined {
  if (!cookieHeader) return undefined;
  const matches = cookieHeader
    .split(';')
    .map((part) => part.trim())
    .filter((part) => part.startsWith(`${CSRF_TOKEN_COOKIE}=`));
  if (matches.length !== 1) return undefined;
  return matches[0].slice(CSRF_TOKEN_COOKIE.length + 1);
}

function rejectCsrfRequest(res: http.ServerResponse, message: string): void {
  sendErr(res, 403, message, ErrorCode.FORBIDDEN);
}

export function handleCsrfProtection(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  options: {
    pathname: string;
    allowedOrigin: string;
    isProduction: boolean;
    secret?: string | Buffer;
  },
  now = Date.now(),
): boolean {
  const origin = req.headers.origin;
  const csrfCookie = readCsrfCookie(req.headers.cookie);

  if (req.method === 'GET' && options.pathname === '/api/csrf-token') {
    res.setHeader('Cache-Control', 'no-store');
    if (
      typeof origin !== 'string' ||
      options.allowedOrigin === '*' ||
      origin !== options.allowedOrigin
    ) {
      rejectCsrfRequest(res, 'A trusted Origin is required to request a CSRF token.');
      return true;
    }

    const token =
      csrfCookie && verifyCsrfToken(csrfCookie, origin, now, options.secret)
        ? csrfCookie
        : issueCsrfToken(origin, now, options.secret);
    const secure = options.isProduction ? '; Secure' : '';
    const sameSite = options.isProduction ? 'None' : 'Strict';
    res.setHeader(
      'Set-Cookie',
      `${CSRF_TOKEN_COOKIE}=${token}; Path=/; Max-Age=${CSRF_TOKEN_TTL_SECONDS}; HttpOnly; SameSite=${sameSite}${secure}`,
    );
    sendJson(res, 200, { token, expiresIn: CSRF_TOKEN_TTL_SECONDS });
    return true;
  }

  if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method ?? '')) return false;

  if (typeof origin !== 'string') {
    if (req.headers.cookie) {
      rejectCsrfRequest(res, 'Origin is required for cookie-bearing state changes.');
      return true;
    }
    return false;
  }

  if (options.allowedOrigin === '*' || origin !== options.allowedOrigin) {
    rejectCsrfRequest(res, 'Request Origin is not allowed.');
    return true;
  }

  const header = req.headers[CSRF_TOKEN_HEADER];
  if (
    !csrfCookie ||
    typeof header !== 'string' ||
    header !== csrfCookie ||
    !verifyCsrfToken(csrfCookie, origin, now, options.secret)
  ) {
    rejectCsrfRequest(res, 'A valid CSRF token is required for state-changing requests.');
    return true;
  }

  return false;
}
