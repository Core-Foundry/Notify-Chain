/**
 * Content Security Policy for the dashboard (#1134).
 *
 * Pure functions, no I/O, so the policy can be unit tested and reused by
 * `vite.config.ts` (dev server + `vite preview`) or copied to whatever host
 * serves the built `dist/` in production. See
 * docs/security/content-security-policy.md for the rationale and rollout.
 *
 * Design:
 *  - Scripts: same-origin only. Production allows no inline script and no
 *    `eval`, so an injected `<script>` or `javascript:` payload is blocked. The
 *    dev server needs one inline module for React fast refresh, so only
 *    `development` mode adds `'unsafe-inline'` to `script-src`.
 *  - Styles: same-origin stylesheets. React's `style={{...}}` props compile to
 *    inline style attributes, which can only be allowed with
 *    `style-src-attr 'unsafe-inline'`; that is scoped to attributes so inline
 *    `<style>` elements stay blocked in production.
 *  - Connections: same-origin, the API origins taken from the VITE_* URLs, and
 *    the public Stellar endpoints. Anything else is opt-in via CSP_CONNECT_SRC.
 *  - Images: same-origin, `data:`/`blob:` and `https:`. Notification template
 *    previews render server-supplied HTML that may reference remote images;
 *    images cannot execute code. Tighten with CSP_IMG_SRC.
 *  - Framing, plugins, <base> and form targets are locked down.
 */

export type CspMode = 'development' | 'production';

export interface CspOptions {
  mode: CspMode;
  /** URLs whose origin may be fetched (API, health endpoints). Non-http(s) and relative values are ignored. */
  apiUrls?: Array<string | undefined>;
  /** Extra connect-src origins, e.g. a custom Soroban RPC. Invalid entries are dropped. */
  extraConnectSrc?: string[];
  /** Replaces the default image sources (after 'self'). Invalid entries are dropped. */
  imgSrc?: string[];
  /** Where browsers POST violation reports (`report-uri`). Invalid values are dropped. */
  reportUri?: string;
}

/** Public Stellar endpoints the dashboard talks to (see VITE_STELLAR_NETWORK). */
export const STELLAR_CONNECT_SRC = [
  'https://soroban-testnet.stellar.org',
  'https://horizon-testnet.stellar.org',
  'https://horizon.stellar.org',
];

/** Default image sources beyond 'self'. */
export const DEFAULT_IMG_SRC = ['data:', 'blob:', 'https:'];

/**
 * Host sources accepted from the environment: a scheme, an optional `*.`
 * wildcard label, a hostname and an optional port. Everything else (keywords,
 * quotes, semicolons, whitespace, bare `*`) is rejected so an environment value
 * can never widen the policy beyond a host or smuggle in another directive.
 */
const HOST_SOURCE = /^(?:https?|wss?):\/\/(?:\*\.)?[a-z0-9-]+(?:\.[a-z0-9-]+)*(?::(?:\d{1,5}|\*))?$/i;

/** Scheme sources (`data:`, `blob:`, `https:`) allowed for images only. */
const IMG_SCHEME_SOURCE = /^(?:data|blob|https):$/i;

/** `http(s)` origin of a URL, or null for relative, malformed or other-scheme values. */
export function toOrigin(value: string | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.origin : null;
  } catch {
    return null;
  }
}

/** Split a comma/whitespace separated environment list. */
export function parseList(raw: string | undefined): string[] {
  return (raw ?? '').split(/[\s,]+/).filter(Boolean);
}

const unique = (values: string[]): string[] => [...new Set(values)];

const reportUriOrNull = (value: string | undefined): string | null => {
  if (!value) return null;
  if (/[\s;,'"]/.test(value)) return null;
  return value.startsWith('/') || toOrigin(value) !== null ? value : null;
};

export function buildContentSecurityPolicy(options: CspOptions): string {
  const dev = options.mode === 'development';

  const apiOrigins = (options.apiUrls ?? [])
    .map(toOrigin)
    .filter((origin): origin is string => origin !== null);
  const extraConnect = (options.extraConnectSrc ?? []).filter((source) => HOST_SOURCE.test(source));
  const devConnect = dev
    ? ['http://localhost:*', 'http://127.0.0.1:*', 'ws://localhost:*', 'ws://127.0.0.1:*']
    : [];
  const connectSrc = unique(["'self'", ...STELLAR_CONNECT_SRC, ...apiOrigins, ...extraConnect, ...devConnect]);

  const customImg = (options.imgSrc ?? []).filter(
    (source) => HOST_SOURCE.test(source) || IMG_SCHEME_SOURCE.test(source),
  );
  const imgSrc = unique(["'self'", ...(options.imgSrc ? customImg : DEFAULT_IMG_SRC)]);

  const directives = [
    "default-src 'self'",
    dev ? "script-src 'self' 'unsafe-inline'" : "script-src 'self'",
    dev ? "style-src 'self' 'unsafe-inline'" : "style-src 'self'",
    "style-src-attr 'unsafe-inline'",
    `img-src ${imgSrc.join(' ')}`,
    "font-src 'self' data:",
    `connect-src ${connectSrc.join(' ')}`,
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'self'",
  ];

  const reportUri = reportUriOrNull(options.reportUri);
  if (reportUri) directives.push(`report-uri ${reportUri}`);

  return directives.join('; ');
}

/** Baseline headers the dashboard already sent before the CSP was added. */
export const BASE_SECURITY_HEADERS: Record<string, string> = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'SAMEORIGIN',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
};

/**
 * Headers for the dev server and `vite preview`.
 *
 *   CSP_REPORT_ONLY=true     send Content-Security-Policy-Report-Only: violations
 *                            are reported but nothing is blocked (safe rollout)
 *   CSP_REPORT_URI=<url>     collect violation reports
 *   CSP_CONNECT_SRC=<list>   extra connect-src origins
 *   CSP_IMG_SRC=<list>       replace the default img-src sources
 *   CSP_ENABLED=false        emit no CSP header (rollback switch)
 */
export function buildSecurityHeaders(
  env: Record<string, string | undefined>,
  mode: string,
): Record<string, string> {
  if (env.CSP_ENABLED === 'false') return { ...BASE_SECURITY_HEADERS };

  const policy = buildContentSecurityPolicy({
    mode: mode === 'development' ? 'development' : 'production',
    apiUrls: [
      env.VITE_EVENTS_API_URL,
      env.VITE_API_URL,
      env.VITE_NOTIFICATION_HEALTH_URL,
      env.VITE_INDEXING_HEALTH_URL,
    ],
    extraConnectSrc: parseList(env.CSP_CONNECT_SRC),
    imgSrc: env.CSP_IMG_SRC ? parseList(env.CSP_IMG_SRC) : undefined,
    reportUri: env.CSP_REPORT_URI,
  });

  const headerName =
    env.CSP_REPORT_ONLY === 'true' ? 'Content-Security-Policy-Report-Only' : 'Content-Security-Policy';
  return { ...BASE_SECURITY_HEADERS, [headerName]: policy };
}
