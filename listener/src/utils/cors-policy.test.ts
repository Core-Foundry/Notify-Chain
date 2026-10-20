/**
 * #998 - Environment-specific CORS policies.
 */
import {
  buildCorsPolicy,
  resolveAllowedOrigin,
  buildPreflightHeaders,
  CorsConfigurationError,
  type CorsEnvironment,
} from './cors-policy';

describe('buildCorsPolicy (#998)', () => {
  it('production fails closed with no configured origins', () => {
    const p = buildCorsPolicy('production', []);
    expect(p.allowedOrigins).toEqual([]);
    expect(p.allowWildcard).toBe(false);
    expect(p.allowAnyLocalhost).toBe(false);
  });

  it('production rejects a wildcard', () => {
    expect(() => buildCorsPolicy('production', ['*'])).toThrow(CorsConfigurationError);
    expect(() => buildCorsPolicy('staging', ['*'])).toThrow(CorsConfigurationError);
  });

  it('production normalises trailing slashes', () => {
    const p = buildCorsPolicy('production', ['https://app.example.com/']);
    expect(p.allowedOrigins).toEqual(['https://app.example.com']);
  });

  it('production never allows localhost implicitly', () => {
    const p = buildCorsPolicy('production', ['https://app.example.com']);
    expect(p.allowAnyLocalhost).toBe(false);
  });

  it('development allows any localhost and tolerates a wildcard', () => {
    const p = buildCorsPolicy('development', ['*']);
    expect(p.allowWildcard).toBe(true);
    expect(p.allowAnyLocalhost).toBe(true);
  });

  it('a wildcard cannot be combined with credentials', () => {
    const p = buildCorsPolicy('development', ['*']);
    expect(p.allowCredentials).toBe(false);
  });

  it('credentials are allowed when origins are explicit', () => {
    const p = buildCorsPolicy('production', ['https://app.example.com']);
    expect(p.allowCredentials).toBe(true);
  });

  it('test environment does not allow arbitrary localhost', () => {
    const p = buildCorsPolicy('test', ['http://localhost:5173']);
    expect(p.allowAnyLocalhost).toBe(false);
    expect(p.allowedOrigins).toEqual(['http://localhost:5173']);
  });
});

describe('resolveAllowedOrigin (#998)', () => {
  const prod = buildCorsPolicy('production', ['https://app.example.com']);
  const dev = buildCorsPolicy('development', []);

  it('rejects an absent Origin (non-browser request)', () => {
    expect(resolveAllowedOrigin(undefined, prod)).toBeNull();
    expect(resolveAllowedOrigin('', prod)).toBeNull();
  });

  it('allows an exact configured origin in production', () => {
    expect(resolveAllowedOrigin('https://app.example.com', prod)).toBe(
      'https://app.example.com',
    );
  });

  it('rejects an unlisted origin in production', () => {
    expect(resolveAllowedOrigin('https://evil.example.com', prod)).toBeNull();
  });

  it('rejects a look-alike subdomain in production', () => {
    expect(resolveAllowedOrigin('https://app.example.com.evil.com', prod)).toBeNull();
  });

  it('allows any localhost port in development', () => {
    expect(resolveAllowedOrigin('http://localhost:3000', dev)).toBe('http://localhost:3000');
    expect(resolveAllowedOrigin('http://127.0.0.1:8080', dev)).toBe('http://127.0.0.1:8080');
  });

  it('rejects a non-localhost origin in development when not listed', () => {
    expect(resolveAllowedOrigin('https://evil.example.com', dev)).toBeNull();
  });

  it('returns the wildcard only when credentials are off', () => {
    const wildcardDev = buildCorsPolicy('development', ['*']);
    expect(resolveAllowedOrigin('https://anything.example', wildcardDev)).toBe('*');
  });
});

describe('buildPreflightHeaders (#998)', () => {
  const prod = buildCorsPolicy('production', ['https://app.example.com']);

  it('emits CORS headers for an allowed origin + method', () => {
    const r = buildPreflightHeaders('https://app.example.com', 'POST', prod);
    expect(r.allowed).toBe(true);
    expect(r.headers['Access-Control-Allow-Origin']).toBe('https://app.example.com');
    expect(r.headers['Access-Control-Allow-Methods']).toContain('POST');
    expect(r.headers.Vary).toBe('Origin');
    expect(r.headers['Access-Control-Allow-Credentials']).toBe('true');
  });

  it('emits no CORS headers for a rejected origin', () => {
    const r = buildPreflightHeaders('https://evil.example.com', 'POST', prod);
    expect(r.allowed).toBe(false);
    expect(r.headers).toEqual({});
  });

  it('reports a disallowed method while still allowing the origin', () => {
    const r = buildPreflightHeaders('https://app.example.com', 'TRACE', prod);
    expect(r.allowed).toBe(false);
    expect(r.headers['Access-Control-Allow-Origin']).toBe('https://app.example.com');
  });

  it('defaults the requested method to GET', () => {
    const r = buildPreflightHeaders('https://app.example.com', undefined, prod);
    expect(r.allowed).toBe(true);
  });

  it('omits credentials when the policy has a wildcard', () => {
    const devWild = buildCorsPolicy('development', ['*']);
    const r = buildPreflightHeaders('https://anything.example', 'GET', devWild);
    expect(r.headers['Access-Control-Allow-Origin']).toBe('*');
    expect(r.headers['Access-Control-Allow-Credentials']).toBeUndefined();
  });

  it('never advertises credentials with a wildcard origin', () => {
    const envs: CorsEnvironment[] = ['development', 'test'];
    for (const e of envs) {
      const p = buildCorsPolicy(e, ['*']);
      const r = buildPreflightHeaders('https://x.example', 'GET', p);
      expect(r.headers['Access-Control-Allow-Credentials']).toBeUndefined();
    }
  });
});
