const CSRF_TOKEN_TTL_MS = 60 * 60 * 1000;

interface CachedToken {
  token: string;
  expiresAt: number;
}

const tokensByOrigin = new Map<string, CachedToken>();

function requestUrl(input: RequestInfo | URL): URL {
  if (input instanceof URL) return input;
  if (typeof input === 'string') {
    return new URL(input, globalThis.location?.href ?? 'http://localhost');
  }
  return new URL(input.url);
}

async function getCsrfToken(apiOrigin: string): Promise<string> {
  const cached = tokensByOrigin.get(apiOrigin);
  if (cached && cached.expiresAt > Date.now()) return cached.token;

  const response = await fetch(new URL('/api/csrf-token', apiOrigin), {
    method: 'GET',
    credentials: 'include',
    headers: { Accept: 'application/json' },
  });
  if (!response.ok) {
    throw new Error(`Failed to obtain CSRF token: ${response.status}`);
  }

  const body = (await response.json()) as { token?: unknown; expiresIn?: unknown };
  if (typeof body.token !== 'string' || typeof body.expiresIn !== 'number') {
    throw new Error('CSRF token endpoint returned an invalid response.');
  }

  const expiresInMs = Math.max(0, body.expiresIn * 1000 - 5_000);
  tokensByOrigin.set(apiOrigin, {
    token: body.token,
    expiresAt: Date.now() + Math.min(expiresInMs, CSRF_TOKEN_TTL_MS),
  });
  return body.token;
}

export async function csrfFetch(
  input: RequestInfo | URL,
  init: RequestInit = {},
): Promise<Response> {
  const inputMethod =
    typeof input !== 'string' && !(input instanceof URL) ? input.method : undefined;
  const method = (init.method ?? inputMethod ?? 'GET').toUpperCase();
  if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
    return fetch(input, init);
  }

  const url = requestUrl(input);
  const token = await getCsrfToken(url.origin);
  const headers = new Headers(init.headers);
  headers.set('X-CSRF-Token', token);

  return fetch(input, {
    ...init,
    credentials: 'include',
    headers,
  });
}
