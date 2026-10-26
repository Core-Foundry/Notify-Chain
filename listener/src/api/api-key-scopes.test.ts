/**
 * #997 - Administrative vs read-only authorization boundaries.
 */
import http from 'http';
import { authenticateApiKey, ApiKeyEntry } from './api-key-auth';
import {
  authorizeAdmin,
  hasAdminScope,
  normalizeApiKeyScope,
  ScopedApiKeyEntry,
} from './api-key-scopes';

function reqWithKey(key?: string): http.IncomingMessage {
  return {
    headers: key === undefined ? {} : { 'x-api-key': key },
  } as unknown as http.IncomingMessage;
}

const KEYS: ScopedApiKeyEntry[] = [
  { key: 'admin-key-0000000000000000', name: 'ops', scope: 'admin' },
  { key: 'read-key-1111111111111111', name: 'dashboard', scope: 'read' },
  { key: 'implicit-read-222222222222', name: 'legacy' }, // no scope -> read
];

const auth = (req: http.IncomingMessage, keys: ApiKeyEntry[] | undefined) =>
  authenticateApiKey(req, keys);

describe('normalizeApiKeyScope (#997)', () => {
  it('defaults to read when the scope is absent', () => {
    expect(normalizeApiKeyScope(undefined)).toBe('read');
    expect(normalizeApiKeyScope('')).toBe('read');
  });

  it('accepts the two valid scopes', () => {
    expect(normalizeApiKeyScope('read')).toBe('read');
    expect(normalizeApiKeyScope('admin')).toBe('admin');
  });

  it('throws on an unknown scope instead of guessing', () => {
    expect(() => normalizeApiKeyScope('superuser')).toThrow(/Invalid API key scope/);
  });
});

describe('hasAdminScope (#997)', () => {
  it('is true only for an explicit admin scope', () => {
    expect(hasAdminScope({ key: 'k', scope: 'admin' } as ScopedApiKeyEntry)).toBe(true);
    expect(hasAdminScope({ key: 'k', scope: 'read' } as ScopedApiKeyEntry)).toBe(false);
    expect(hasAdminScope({ key: 'k' })).toBe(false);
  });
});

describe('authorizeAdmin (#997)', () => {
  it('allows an admin-scoped key', () => {
    const result = authorizeAdmin(reqWithKey(KEYS[0].key), KEYS, auth);
    expect(result).toEqual({ authorized: true, keyName: 'ops' });
  });

  it('rejects a read-only key with insufficient_scope', () => {
    const result = authorizeAdmin(reqWithKey(KEYS[1].key), KEYS, auth);
    expect(result).toEqual({ authorized: false, reason: 'insufficient_scope' });
  });

  it('treats an implicit (no scope) key as read-only', () => {
    const result = authorizeAdmin(reqWithKey(KEYS[2].key), KEYS, auth);
    expect(result).toEqual({ authorized: false, reason: 'insufficient_scope' });
  });

  it('rejects a missing key', () => {
    const result = authorizeAdmin(reqWithKey(), KEYS, auth);
    expect(result).toEqual({ authorized: false, reason: 'missing' });
  });

  it('rejects an unknown key', () => {
    const result = authorizeAdmin(reqWithKey('not-a-real-key'), KEYS, auth);
    expect(result).toEqual({ authorized: false, reason: 'invalid' });
  });

  it('permits admin when no keys are configured (local/dev, enforced=false)', () => {
    const result = authorizeAdmin(reqWithKey(), undefined, auth);
    expect(result).toEqual({ authorized: true, keyName: undefined });
  });

  it('does not let a read key reach an admin action even when both are present', () => {
    const readOnly = [KEYS[1], KEYS[2]];
    const result = authorizeAdmin(reqWithKey(KEYS[1].key), readOnly, auth);
    expect(result.authorized).toBe(false);
  });
});
