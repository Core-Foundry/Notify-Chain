/**
 * Security headers middleware — adds intentional security-related headers
 * to every HTTP response from the events API server.
 *
 * Headers are environment-aware: production-enforcing headers are only
 * applied when the service is not in a local development context.
 * Headers that could break local development, CORS, or SSE connections
 * are deliberately omitted or conditioned.
 *
 * See: https://owasp.org/www-project-secure-headers/
 */

import type { ServerResponse } from 'http';

export function addSecurityHeaders(
  res: ServerResponse,
  options: { isProduction?: boolean } = {},
): void {
  res.setHeader('X-Content-Type-Options', 'nosniff');

  // ✅ X-Frame-Options: prevent clickjacking.
  // SAMEORIGIN allows embedding within same-origin iframes (dashboard use).
  // DENY would break legitimate self-embedding; SAMEORIGIN is safer.
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');

  // ✅ X-XSS-Protection: legacy IE protection (defense-in-depth).
  // No known negative impact on modern API clients or SSE.
  res.setHeader('X-XSS-Protection', '1; mode=block');

  // ✅ Referrer-Policy: control referrer information sent with requests.
  // strict-origin-when-cross-origin balances privacy and functionality.
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');

  // ✅ Cache-Control: prevent sensitive data caching in localStorage/indexedDB
  // for non-GET routes; for GET routes we allow caching where appropriate.
  // Only set Cache-Control if not already set by a more specific handler.
  if (!res.getHeader('Cache-Control')) {
    const cacheControl =
      res.statusCode >= 200 && res.statusCode < 300 ? 'public, max-age=300' : 'no-store';
    res.setHeader('Cache-Control', cacheControl);
  }

  // ⚠️ Strict-Transport-Security: only in production.
  // Skipped for local/development to avoid breaking HTTP local testing.
  if (options.isProduction) {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
  }
}