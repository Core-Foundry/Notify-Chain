/**
 * Administrative vs read-only authorization boundaries (#997).
 *
 * A single flat API-key list gives every consumer the same power, so a
 * read-only integration (a dashboard, a metrics scraper) can trigger
 * privileged operations such as exports or archive runs. This module assigns
 * an explicit scope to each key and answers one question per request: is this
 * key allowed to perform an administrative action?
 *
 * Design:
 * - Scope is a property of the key entry, not of the route table, so adding a
 *   new privileged route only requires declaring `ADMIN` at the call site.
 * - A key without an explicit scope is read-only. Privilege is opt-in, never
 *   the default.
 * - Unknown/empty scopes are rejected at config-load time by
 *   `normalizeApiKeyScopes`, so a typo cannot silently grant or deny access.
 */
import http from 'http';
import { ApiKeyEntry } from './api-key-auth';

/** What a key is allowed to do. */
export type ApiKeyScope = 'read' | 'admin';

/** An API key entry with an explicit scope (#997). */
export interface ScopedApiKeyEntry extends ApiKeyEntry {
  /**
   * `'admin'` may call privileged operations; `'read'` (default) may only read.
   */
  scope?: ApiKeyScope;
}

export type AdminAuthorizationResult =
  | { authorized: true; keyName?: string }
  | { authorized: false; reason: 'missing' | 'invalid' | 'insufficient_scope' };

const VALID_SCOPES: ReadonlySet<string> = new Set(['read', 'admin']);

/**
 * Validate a configured key's scope. Called when configuration is loaded so a
 * mistyped scope fails loudly instead of defaulting to read (or worse, admin).
 */
export function normalizeApiKeyScope(scope: unknown): ApiKeyScope {
  if (scope === undefined || scope === null || scope === '') {
    return 'read';
  }
  if (typeof scope !== 'string' || !VALID_SCOPES.has(scope)) {
    throw new Error(
      `Invalid API key scope ${JSON.stringify(scope)}; expected 'read' or 'admin'.`,
    );
  }
  return scope as ApiKeyScope;
}

/**
 * True when the entry may perform administrative operations.
 *
 * Privilege is opt-in: only an explicit `'admin'` scope grants it.
 */
export function hasAdminScope(entry: ApiKeyEntry): boolean {
  const scope = (entry as ScopedApiKeyEntry).scope;
  return scope === 'admin';
}

/**
 * Authorize an administrative request.
 *
 * Reuses the shared key authentication so behaviour (constant-time compare,
 * duplicate-header rejection) is identical everywhere, then additionally
 * requires the matched key to carry the admin scope.
 */
export function authorizeAdmin(
  req: http.IncomingMessage,
  apiKeys: ApiKeyEntry[] | undefined,
  authenticate: (
    req: http.IncomingMessage,
    keys: ApiKeyEntry[] | undefined,
  ) => { authenticated: boolean; keyName?: string; enforced?: boolean; reason?: string },
): AdminAuthorizationResult {
  const auth = authenticate(req, apiKeys);

  if (!auth.authenticated) {
    return {
      authorized: false,
      reason: (auth.reason as 'missing' | 'invalid') ?? 'invalid',
    };
  }

  // No keys configured: local/dev deployment. There is no consumer to
  // distinguish, so administrative access is permitted for backward
  // compatibility (the endpoint is expected to be bound to localhost).
  if (auth.enforced === false) {
    return { authorized: true, keyName: auth.keyName };
  }

  const matched = (apiKeys ?? []).find((k) => k.name && k.name === auth.keyName);
  const entry =
    matched ??
    (apiKeys ?? []).find((k) => k.name === undefined && auth.keyName === undefined);

  if (!entry || !hasAdminScope(entry)) {
    return { authorized: false, reason: 'insufficient_scope' };
  }
  return { authorized: true, keyName: auth.keyName };
}
