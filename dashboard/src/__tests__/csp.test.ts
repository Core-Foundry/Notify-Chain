import {
  BASE_SECURITY_HEADERS,
  STELLAR_CONNECT_SRC,
  buildContentSecurityPolicy,
  buildSecurityHeaders,
  parseList,
  toOrigin,
} from '../security/csp';

/** Parse a policy string into a directive -> sources map. */
const parse = (policy: string): Record<string, string[]> =>
  Object.fromEntries(
    policy.split('; ').map((directive): [string, string[]] => {
      const [name, ...sources] = directive.split(' ');
      return [name, sources];
    }),
  );

describe('toOrigin', () => {
  it('reduces http(s) URLs to their origin', () => {
    expect(toOrigin('http://localhost:8787/api/events')).toBe('http://localhost:8787');
    expect(toOrigin('https://api.example.com/v1?x=1#y')).toBe('https://api.example.com');
  });

  it('ignores relative, malformed and non-http(s) values', () => {
    for (const value of [undefined, '', '/api/events', 'not a url', 'javascript:alert(1)', 'data:text/html,x', 'ftp://x.com']) {
      expect(toOrigin(value)).toBeNull();
    }
  });
});

describe('parseList', () => {
  it('splits on commas and whitespace and drops empties', () => {
    expect(parseList(' https://a.com,https://b.com  https://c.com ,, ')).toEqual([
      'https://a.com',
      'https://b.com',
      'https://c.com',
    ]);
    expect(parseList(undefined)).toEqual([]);
  });
});

describe('buildContentSecurityPolicy (production)', () => {
  const policy = parse(buildContentSecurityPolicy({ mode: 'production' }));

  it('blocks unapproved scripts: same-origin only, no inline, no eval', () => {
    expect(policy['script-src']).toEqual(["'self'"]);
    expect(policy['default-src']).toEqual(["'self'"]);
    const raw = buildContentSecurityPolicy({ mode: 'production' });
    expect(raw).not.toContain('unsafe-eval');
    expect(policy['style-src']).toEqual(["'self'"]);
  });

  it("only allows inline styles as attributes (React style props), not <style> elements", () => {
    expect(policy['style-src-attr']).toEqual(["'unsafe-inline'"]);
  });

  it('locks down plugins, <base>, form targets and framing', () => {
    expect(policy['object-src']).toEqual(["'none'"]);
    expect(policy['base-uri']).toEqual(["'self'"]);
    expect(policy['form-action']).toEqual(["'self'"]);
    expect(policy['frame-ancestors']).toEqual(["'self'"]);
  });

  it('allows same-origin and public Stellar endpoints for connections by default', () => {
    expect(policy['connect-src']).toEqual(["'self'", ...STELLAR_CONNECT_SRC]);
  });

  it('allows safe image sources for remote template previews', () => {
    expect(policy['img-src']).toEqual(["'self'", 'data:', 'blob:', 'https:']);
  });

  it('adds no report-uri unless one is configured', () => {
    expect(policy['report-uri']).toBeUndefined();
  });
});

describe('buildContentSecurityPolicy (development)', () => {
  const policy = parse(buildContentSecurityPolicy({ mode: 'development' }));

  it('permits the inline module and websocket that Vite fast refresh needs', () => {
    expect(policy['script-src']).toEqual(["'self'", "'unsafe-inline'"]);
    expect(policy['connect-src']).toEqual(expect.arrayContaining(['ws://localhost:*', 'http://localhost:*']));
  });

  it('never adds eval, even in development', () => {
    expect(buildContentSecurityPolicy({ mode: 'development' })).not.toContain('unsafe-eval');
  });
});

describe('connect-src from configuration', () => {
  it('adds the origin of each configured API URL once, without paths', () => {
    const policy = parse(
      buildContentSecurityPolicy({
        mode: 'production',
        apiUrls: [
          'https://api.example.com/api/events',
          'https://api.example.com/health',
          'http://listener:8787/ready',
          undefined,
          '/relative',
          'javascript:alert(1)',
        ],
      }),
    );
    const connect = policy['connect-src'];
    expect(connect).toContain('https://api.example.com');
    expect(connect).toContain('http://listener:8787');
    expect(connect.filter((s) => s === 'https://api.example.com')).toHaveLength(1);
    expect(connect.join(' ')).not.toContain('javascript');
    expect(connect.join(' ')).not.toContain('/api/events');
  });

  it('accepts valid extra origins, including wildcard subdomains', () => {
    const policy = parse(
      buildContentSecurityPolicy({
        mode: 'production',
        extraConnectSrc: ['https://rpc.example.com', 'https://*.walletconnect.org', 'wss://relay.example.com:443'],
      }),
    );
    expect(policy['connect-src']).toEqual(
      expect.arrayContaining(['https://rpc.example.com', 'https://*.walletconnect.org', 'wss://relay.example.com:443']),
    );
  });

  it('drops extra values that would widen the policy or inject directives', () => {
    const raw = buildContentSecurityPolicy({
      mode: 'production',
      extraConnectSrc: [
        "'unsafe-inline'",
        '*',
        'https:',
        'https://evil.com;script-src',
        'https://a.com b.com',
        "https://x.com'",
        'https://*',
      ],
    });
    const policy = parse(raw);
    expect(policy['connect-src']).toEqual(["'self'", ...STELLAR_CONNECT_SRC]);
    expect(policy['script-src']).toEqual(["'self'"]);
    expect(raw).not.toContain('evil.com');
  });

  it('lets CSP_IMG_SRC replace the default image sources', () => {
    const policy = parse(
      buildContentSecurityPolicy({ mode: 'production', imgSrc: ['https://cdn.example.com', 'data:', "'unsafe-inline'"] }),
    );
    expect(policy['img-src']).toEqual(["'self'", 'https://cdn.example.com', 'data:']);
  });
});

describe('violation reporting', () => {
  it('includes report-uri for an absolute URL or a path', () => {
    expect(parse(buildContentSecurityPolicy({ mode: 'production', reportUri: 'https://csp.example.com/report' }))['report-uri']).toEqual([
      'https://csp.example.com/report',
    ]);
    expect(parse(buildContentSecurityPolicy({ mode: 'production', reportUri: '/csp-report' }))['report-uri']).toEqual(['/csp-report']);
  });

  it('rejects a report-uri that could inject directives or is not a URL', () => {
    for (const reportUri of ['https://x.com/r; script-src *', 'https://x.com/a b', 'javascript:alert(1)', 'csp-report']) {
      expect(parse(buildContentSecurityPolicy({ mode: 'production', reportUri }))['report-uri']).toBeUndefined();
    }
  });
});

describe('buildSecurityHeaders', () => {
  it('delivers an enforcing Content-Security-Policy alongside the existing headers', () => {
    const headers = buildSecurityHeaders({}, 'production');
    expect(headers['Content-Security-Policy']).toContain("script-src 'self'");
    expect(headers['Content-Security-Policy-Report-Only']).toBeUndefined();
    for (const [name, value] of Object.entries(BASE_SECURITY_HEADERS)) {
      expect(headers[name]).toBe(value);
    }
  });

  it('treats any non-development mode as production', () => {
    expect(parse(buildSecurityHeaders({}, 'staging')['Content-Security-Policy'])['script-src']).toEqual(["'self'"]);
    expect(parse(buildSecurityHeaders({}, 'development')['Content-Security-Policy'])['script-src']).toContain("'unsafe-inline'");
  });

  it('feeds the VITE_* API URLs into connect-src', () => {
    const headers = buildSecurityHeaders(
      {
        VITE_EVENTS_API_URL: 'https://events.example.com/api/events',
        VITE_API_URL: 'https://api.example.com',
        VITE_NOTIFICATION_HEALTH_URL: 'https://health.example.com/notifications',
        VITE_INDEXING_HEALTH_URL: 'https://health.example.com/indexing',
      },
      'production',
    );
    const connect = parse(headers['Content-Security-Policy'])['connect-src'];
    expect(connect).toEqual(
      expect.arrayContaining(['https://events.example.com', 'https://api.example.com', 'https://health.example.com']),
    );
  });

  it('switches to report-only so a rollout can observe violations without blocking', () => {
    const headers = buildSecurityHeaders({ CSP_REPORT_ONLY: 'true', CSP_REPORT_URI: 'https://csp.example.com/r' }, 'production');
    expect(headers['Content-Security-Policy']).toBeUndefined();
    expect(headers['Content-Security-Policy-Report-Only']).toContain('report-uri https://csp.example.com/r');
  });

  it('emits no CSP when disabled, keeping the baseline headers (rollback path)', () => {
    expect(buildSecurityHeaders({ CSP_ENABLED: 'false' }, 'production')).toEqual(BASE_SECURITY_HEADERS);
  });

  it('produces a single-line header value', () => {
    const value = buildSecurityHeaders(
      { CSP_CONNECT_SRC: 'https://a.com\nhttps://b.com', CSP_REPORT_URI: 'https://x.com/r\r\nSet-Cookie: a=b' },
      'production',
    )['Content-Security-Policy'];
    expect(value).not.toMatch(/[\r\n]/);
    expect(value).not.toContain('Set-Cookie');
  });
});
