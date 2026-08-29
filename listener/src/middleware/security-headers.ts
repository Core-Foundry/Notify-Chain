/**
 * Security Headers Middleware (Issue #690)
 *
 * Attaches industry-standard HTTP security headers to all responses from the
 * NotifyChain API server to mitigate clickjacking, MIME-sniffing, and XSS attacks.
 */

import { IncomingMessage, ServerResponse } from 'http';

export interface SecurityHeadersConfig {
  isProduction?: boolean;
  enableHsts?: boolean;
  customCsp?: string;
}

export const DEFAULT_SECURITY_HEADERS: Record<string, string> = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'X-XSS-Protection': '0',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
  'Content-Security-Policy': "default-src 'self'; frame-ancestors 'none';",
};

export const HSTS_HEADER = 'max-age=31536000; includeSubDomains; preload';

/**
 * Attaches configured security headers to an HTTP ServerResponse.
 */
export function applySecurityHeaders(
  req: IncomingMessage,
  res: ServerResponse,
  config: SecurityHeadersConfig = {}
): void {
  const isProd = config.isProduction ?? process.env.NODE_ENV === 'production';
  const enableHsts = config.enableHsts ?? isProd;

  for (const [header, value] of Object.entries(DEFAULT_SECURITY_HEADERS)) {
    if (!res.hasHeader(header)) {
      res.setHeader(header, value);
    }
  }

  if (enableHsts && !res.hasHeader('Strict-Transport-Security')) {
    res.setHeader('Strict-Transport-Security', HSTS_HEADER);
  }
}
