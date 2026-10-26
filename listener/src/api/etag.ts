/**
 * ETag / conditional request support (#985).
 *
 * Lets clients skip downloading an unchanged event or statistics
 * representation. The tag is derived from the serialized body, so it changes
 * whenever the representation changes and is stable otherwise.
 */
import crypto from 'crypto';

/**
 * Compute a strong ETag for a response body.
 *
 * The tag is a quoted SHA-256 prefix of the exact serialized bytes, so two
 * byte-identical bodies always produce the same tag and any change produces a
 * different one. Callers must pass the same bytes they will send.
 */
export function computeEtag(body: string | Buffer): string {
  const buf = typeof body === 'string' ? Buffer.from(body, 'utf8') : body;
  const hash = crypto.createHash('sha256').update(buf).digest('base64url');
  return `"${hash.slice(0, 27)}"`;
}

/** Convenience wrapper: JSON-serialize with stable key order, then tag. */
export function computeJsonEtag(value: unknown): string {
  return computeEtag(stableStringify(value));
}

/**
 * Parse the `If-None-Match` request header into a set of tags.
 *
 * Handles the comma-separated list form, the `*` wildcard and weak tags
 * (`W/"..."`), which are normalised to their strong form for comparison.
 */
export function parseIfNoneMatch(header: string | string[] | undefined): {
  wildcard: boolean;
  tags: Set<string>;
} {
  if (Array.isArray(header)) {
    // Duplicate headers are joined per RFC 9110.
    header = header.join(',');
  }
  const tags = new Set<string>();
  if (!header) {
    return { wildcard: false, tags };
  }
  for (const raw of header.split(',')) {
    const part = raw.trim();
    if (part === '*') {
      return { wildcard: true, tags };
    }
    if (!part) continue;
    // Strip an optional weak prefix so W/"x" matches "x".
    tags.add(part.replace(/^W\//, ''));
  }
  return { wildcard: false, tags };
}

/**
 * Decide whether a conditional request matches the current representation.
 *
 * Returns `true` when the client's cached copy is still valid, which means the
 * caller should respond 304 with no body.
 */
export function etagMatches(
  currentEtag: string,
  ifNoneMatch: string | string[] | undefined,
): boolean {
  const { wildcard, tags } = parseIfNoneMatch(ifNoneMatch);
  if (wildcard) {
    return true;
  }
  return tags.has(currentEtag) || tags.has(currentEtag.replace(/^W\//, ''));
}

/** Stable JSON serialization: object keys sorted so tag order is deterministic. */
function stableStringify(value: unknown): string {
  return JSON.stringify(sortValue(value));
}

function sortValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortValue);
  }
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([k, v]) => [k, sortValue(v)]);
    return Object.fromEntries(entries);
  }
  return value;
}

/**
 * Minimal response surface this helper needs. Kept structural so it works with
 * Express `Response`, raw `http.ServerResponse`, and test doubles alike.
 */
export interface ConditionalResponse {
  setHeader(name: string, value: string): unknown;
  status(code: number): unknown;
  end(body?: string): unknown;
}

/**
 * Send a JSON representation with ETag support.
 *
 * If the client's `If-None-Match` matches the freshly computed tag, respond
 * 304 with no body; otherwise set `ETag` and send the body. Returns the status
 * code actually sent so callers/tests can assert on it.
 */
export function sendConditionalJson(
  res: ConditionalResponse,
  body: unknown,
  ifNoneMatch: string | string[] | undefined,
): 200 | 304 {
  const serialized = JSON.stringify(body);
  const tag = computeEtag(serialized);

  if (etagMatches(tag, ifNoneMatch)) {
    res.status(304);
    res.end();
    return 304;
  }

  res.setHeader('ETag', tag);
  res.setHeader('Content-Type', 'application/json');
  res.status(200);
  res.end(serialized);
  return 200;
}
