/**
 * Environment-specific CORS policy (#998).
 *
 * `validateCorsOrigin` (#689) already rejects a wildcard in production, but the
 * request-time decision is still a bare string comparison scattered across the
 * API servers. This module centralises the *runtime* policy:
 *
 * - Each environment has an explicit default profile, so a missing
 *   configuration can never silently become "allow everything".
 * - Development may allow any localhost origin (any port) without listing it,
 *   which is what a dev server actually needs.
 * - Production matches only exact, pre-listed origins.
 * - Preflight (`OPTIONS`) and rejected-origin cases are expressed as pure
 *   functions so they can be tested without a live server.
 */

export type CorsEnvironment = 'development' | 'test' | 'staging' | 'production';

export interface CorsPolicy {
  environment: CorsEnvironment;
  /** Explicitly allowed origins (exact match, no trailing slash). */
  allowedOrigins: string[];
  /** Allow the `*` wildcard. Never true for production/staging. */
  allowWildcard: boolean;
  /** In development, accept any http(s)://localhost or 127.0.0.1 origin. */
  allowAnyLocalhost: boolean;
  /** Methods advertised on preflight. */
  methods: string[];
  /** Headers advertised on preflight. */
  allowedHeaders: string[];
  /** Whether credentials may be sent. Cannot be combined with a wildcard. */
  allowCredentials: boolean;
}

const SAFE_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'];
const SAFE_HEADERS = ['Content-Type', 'Authorization', 'X-Request-Id', 'X-Webhook-Timestamp'];

export class CorsConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CorsConfigurationError';
  }
}

function normalise(origin: string): string {
  return origin.trim().replace(/\/+$/, '');
}

function isLocalhostOrigin(origin: string): boolean {
  try {
    const url = new URL(origin);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      return false;
    }
    return (
      url.hostname === 'localhost' ||
      url.hostname === '127.0.0.1' ||
      url.hostname === '[::1]' ||
      url.hostname === '::1'
    );
  } catch {
    return false;
  }
}

/**
 * Build a policy for an environment.
 *
 * Production and staging default to NO allowed origins: access must be granted
 * explicitly via configuration, so a deployment that forgets to set
 * `EVENTS_API_CORS_ORIGIN` fails closed instead of open.
 */
export function buildCorsPolicy(
  environment: CorsEnvironment,
  configuredOrigins: string[] = [],
): CorsPolicy {
  const origins = configuredOrigins.map(normalise).filter(Boolean);

  if (environment === 'production' || environment === 'staging') {
    if (origins.includes('*')) {
      throw new CorsConfigurationError(
        `Wildcard CORS origin is not permitted in ${environment}.`,
      );
    }
    return {
      environment,
      allowedOrigins: origins,
      allowWildcard: false,
      allowAnyLocalhost: false,
      methods: SAFE_METHODS,
      allowedHeaders: SAFE_HEADERS,
      allowCredentials: true,
    };
  }

  // development / test: localhost is implicitly allowed, wildcard is tolerated.
  const allowWildcard = origins.includes('*');
  return {
    environment,
    allowedOrigins: origins.filter((o) => o !== '*'),
    allowWildcard,
    allowAnyLocalhost: environment === 'development',
    methods: SAFE_METHODS,
    allowedHeaders: SAFE_HEADERS,
    // A wildcard cannot be combined with credentials per the CORS spec.
    allowCredentials: !allowWildcard,
  };
}

/**
 * Decide whether a request origin is allowed by the policy.
 *
 * Returns the value to echo in `Access-Control-Allow-Origin`, or `null` when
 * the origin must be rejected (no CORS headers emitted at all).
 */
export function resolveAllowedOrigin(
  origin: string | undefined,
  policy: CorsPolicy,
): string | null {
  // Same-origin / non-browser requests send no Origin header: nothing to allow.
  if (!origin) {
    return null;
  }
  const candidate = normalise(origin);

  if (policy.allowWildcard && !policy.allowCredentials) {
    return '*';
  }
  if (policy.allowedOrigins.includes(candidate)) {
    return candidate;
  }
  if (policy.allowAnyLocalhost && isLocalhostOrigin(candidate)) {
    return candidate;
  }
  return null;
}

export interface PreflightResult {
  allowed: boolean;
  headers: Record<string, string>;
}

/**
 * Build the response headers for a preflight (OPTIONS) request.
 *
 * When the origin is not allowed the result carries no CORS headers, so the
 * browser blocks the actual request.
 */
export function buildPreflightHeaders(
  origin: string | undefined,
  requestedMethod: string | undefined,
  policy: CorsPolicy,
): PreflightResult {
  const allowedOrigin = resolveAllowedOrigin(origin, policy);
  if (!allowedOrigin) {
    return { allowed: false, headers: {} };
  }

  const method = (requestedMethod ?? 'GET').toUpperCase();
  const methodAllowed = policy.methods.includes(method);

  const headers: Record<string, string> = {
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Methods': policy.methods.join(', '),
    'Access-Control-Allow-Headers': policy.allowedHeaders.join(', '),
    Vary: 'Origin',
    'Access-Control-Max-Age': '600',
  };
  if (policy.allowCredentials) {
    headers['Access-Control-Allow-Credentials'] = 'true';
  }

  return { allowed: methodAllowed, headers };
}
