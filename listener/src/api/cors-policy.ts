/**
 * Environment-Specific CORS Policy Engine (#998)
 *
 * Enforces explicit, environment-specific browser-origin access controls:
 * - Development: Permissive defaults for local development (e.g. localhost, 127.0.0.1)
 *   when unconfigured. Wildcard allowed if explicitly specified.
 * - Staging: Restrictive defaults. Rejects wildcard origins; requires explicit origin configuration.
 * - Production: Strictly restrictive defaults. Empty/no cross-origin access by default;
 *   wildcard origins are strictly prohibited.
 *
 * Handles preflight (OPTIONS) requests and rejected origin requests explicitly.
 */

import http from 'http';
import { sendErr, ErrorCode } from '../utils/response';
import logger from '../utils/logger';

export interface CorsPolicyConfig {
  /** Raw comma-separated string, JSON array string, or array of allowed origins */
  origins?: string | string[];
  /** Runtime environment (development, staging, production, test) */
  nodeEnv?: string;
  /** Whether wildcard is allowed in production (strictly false by default) */
  allowProductionWildcard?: boolean;
}

export interface CorsPolicy {
  allowedOrigins: string[];
  isWildcard: boolean;
  nodeEnv: string;
  isOriginAllowed(origin: string | undefined): boolean;
  handleCors(req: http.IncomingMessage, res: http.ServerResponse): { allowed: boolean; isPreflight: boolean };
}

const DEFAULT_DEV_ORIGINS = [
  'http://localhost:3000',
  'http://localhost:5173',
  'http://127.0.0.1:3000',
  'http://127.0.0.1:5173',
];

export function parseAllowedOrigins(raw: string | string[] | undefined): string[] | '*' {
  if (!raw) return [];
  if (Array.isArray(raw)) {
    return raw.map((o) => o.trim()).filter(Boolean);
  }
  const trimmed = raw.trim();
  if (trimmed === '*') return '*';

  if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) {
        return parsed.map((o) => String(o).trim()).filter(Boolean);
      }
    } catch {
      throw new Error(`CORS Configuration Error: Invalid JSON array format in CORS origins: ${trimmed}`);
    }
  }

  return trimmed.split(',').map((o) => o.trim()).filter(Boolean);
}

export function validateOriginUrl(origin: string): void {
  try {
    const url = new URL(origin);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      throw new Error(`Protocol must be http: or https: (received ${url.protocol})`);
    }
    if (url.pathname !== '' && url.pathname !== '/') {
      throw new Error(`Origin cannot contain path segments (received ${url.pathname})`);
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`CORS Configuration Error: Invalid origin URL "${origin}". Reason: ${msg}`);
  }
}

/**
 * Creates and initializes an environment-specific CORS policy.
 */
export function createCorsPolicy(config: CorsPolicyConfig = {}): CorsPolicy {
  const nodeEnv = (config.nodeEnv || process.env.NODE_ENV || 'development').toLowerCase();
  const isProduction = nodeEnv === 'production' || nodeEnv === 'prod';
  const isStaging = nodeEnv === 'staging';
  const isSensitiveEnv = isProduction || isStaging;

  const parsed = parseAllowedOrigins(config.origins ?? process.env.CORS_ALLOWED_ORIGINS ?? process.env.EVENTS_API_CORS_ORIGIN);

  let allowedOrigins: string[] = [];
  let isWildcard = false;

  if (parsed === '*') {
    if (isSensitiveEnv && !config.allowProductionWildcard) {
      throw new Error(
        `CORS Security Violation: Wildcard origin ("*") is prohibited in ${nodeEnv}. Explicitly list allowed origins.`
      );
    }
    isWildcard = true;
    allowedOrigins = ['*'];
  } else if (parsed.length > 0) {
    for (const origin of parsed) {
      validateOriginUrl(origin);
    }
    allowedOrigins = [...parsed];
  } else {
    // Unconfigured defaults based on environment
    if (isProduction) {
      // Production defaults are strictly restrictive: no external browser origins allowed by default
      logger.info('CORS: Production environment with no explicit origins configured; cross-origin access restricted.');
      allowedOrigins = [];
    } else if (isStaging) {
      logger.info('CORS: Staging environment with no explicit origins configured; cross-origin access restricted.');
      allowedOrigins = [];
    } else {
      // Development / Test defaults
      allowedOrigins = [...DEFAULT_DEV_ORIGINS];
    }
  }

  function isOriginAllowed(origin: string | undefined): boolean {
    if (!origin) return false;
    if (isWildcard) return true;
    const normalized = origin.trim().toLowerCase().replace(/\/$/, '');
    return allowedOrigins.some((allowed) => allowed.toLowerCase().replace(/\/$/, '') === normalized);
  }

  function handleCors(
    req: http.IncomingMessage,
    res: http.ServerResponse
  ): { allowed: boolean; isPreflight: boolean } {
    const originHeader = req.headers['origin'];
    const origin = Array.isArray(originHeader) ? originHeader[0] : originHeader;
    const isOptions = req.method === 'OPTIONS';

    // Non-browser or same-origin requests without an Origin header
    if (!origin) {
      if (isOptions) {
        // Preflight without origin header
        res.writeHead(204);
        res.end();
        return { allowed: true, isPreflight: true };
      }
      return { allowed: true, isPreflight: false };
    }

    // Origin header is present: evaluate policy
    const allowed = isOriginAllowed(origin);

    if (allowed) {
      const allowedOriginValue = isWildcard && !req.headers['authorization'] && !req.headers['x-api-key'] ? '*' : origin;
      res.setHeader('Access-Control-Allow-Origin', allowedOriginValue);
      res.setHeader('Vary', 'Origin');
      res.setHeader('Access-Control-Allow-Credentials', 'true');
      res.setHeader(
        'Access-Control-Allow-Methods',
        'GET, POST, PUT, DELETE, OPTIONS, HEAD, PATCH'
      );
      res.setHeader(
        'Access-Control-Allow-Headers',
        'Content-Type, X-API-Key, Authorization, X-Correlation-Id, X-Request-Id, If-None-Match'
      );
      res.setHeader(
        'Access-Control-Expose-Headers',
        'X-Request-Id, X-Correlation-Id, X-Response-Time, ETag'
      );
      res.setHeader('Access-Control-Max-Age', '86400');

      if (isOptions) {
        res.writeHead(204);
        res.end();
        return { allowed: true, isPreflight: true };
      }

      return { allowed: true, isPreflight: false };
    }

    // Rejected origin: Do NOT emit Access-Control-Allow-Origin
    logger.warn('CORS request rejected for untrusted origin', {
      origin,
      nodeEnv,
      method: req.method,
      url: req.url,
    });

    if (isOptions) {
      // Preflight rejected
      sendErr(res, 403, `CORS preflight rejected: origin "${origin}" is not permitted`, ErrorCode.FORBIDDEN);
      return { allowed: false, isPreflight: true };
    }

    // Direct cross-origin request rejected
    sendErr(res, 403, `CORS policy violation: origin "${origin}" is not permitted`, ErrorCode.FORBIDDEN);
    return { allowed: false, isPreflight: false };
  }

  return {
    allowedOrigins,
    isWildcard,
    nodeEnv,
    isOriginAllowed,
    handleCors,
  };
}
