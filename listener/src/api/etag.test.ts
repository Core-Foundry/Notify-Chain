/**
 * #985 - ETag / conditional request support.
 */
import {
  computeEtag,
  computeJsonEtag,
  etagMatches,
  parseIfNoneMatch,
  sendConditionalJson,
} from './etag';

describe('computeEtag (#985)', () => {
  it('is stable for identical bodies', () => {
    expect(computeEtag('{"a":1}')).toBe(computeEtag('{"a":1}'));
  });

  it('changes when the body changes', () => {
    expect(computeEtag('{"a":1}')).not.toBe(computeEtag('{"a":2}'));
  });

  it('is a quoted strong tag', () => {
    const tag = computeEtag('x');
    expect(tag.startsWith('"')).toBe(true);
    expect(tag.endsWith('"')).toBe(true);
    expect(tag).not.toContain('W/');
  });

  it('handles Buffer and string identically for the same bytes', () => {
    expect(computeEtag('abc')).toBe(computeEtag(Buffer.from('abc', 'utf8')));
  });
});

describe('computeJsonEtag (#985)', () => {
  it('is order-independent for object keys', () => {
    expect(computeJsonEtag({ a: 1, b: 2 })).toBe(computeJsonEtag({ b: 2, a: 1 }));
  });

  it('differs when a nested value changes', () => {
    expect(computeJsonEtag({ a: { b: 1 } })).not.toBe(
      computeJsonEtag({ a: { b: 2 } }),
    );
  });

  it('preserves array order (order is significant)', () => {
    expect(computeJsonEtag([1, 2])).not.toBe(computeJsonEtag([2, 1]));
  });
});

describe('parseIfNoneMatch (#985)', () => {
  it('returns no tags for an absent header', () => {
    expect(parseIfNoneMatch(undefined)).toEqual({ wildcard: false, tags: new Set() });
  });

  it('detects the wildcard', () => {
    expect(parseIfNoneMatch('*').wildcard).toBe(true);
  });

  it('parses a comma-separated list', () => {
    const { tags } = parseIfNoneMatch('"a", "b", "c"');
    expect([...tags].sort()).toEqual(['"a"', '"b"', '"c"']);
  });

  it('normalises weak tags to their strong form', () => {
    const { tags } = parseIfNoneMatch('W/"abc"');
    expect(tags.has('"abc"')).toBe(true);
  });

  it('joins duplicate headers', () => {
    const { tags } = parseIfNoneMatch(['"a"', '"b"']);
    expect(tags.size).toBe(2);
  });
});

describe('etagMatches (#985)', () => {
  const tag = computeEtag('payload');

  it('matches the exact tag', () => {
    expect(etagMatches(tag, tag)).toBe(true);
  });

  it('matches within a list', () => {
    expect(etagMatches(tag, `"other", ${tag}`)).toBe(true);
  });

  it('matches a weak form of the tag', () => {
    expect(etagMatches(tag, `W/${tag}`)).toBe(true);
  });

  it('matches the wildcard', () => {
    expect(etagMatches(tag, '*')).toBe(true);
  });

  it('does not match a stale tag', () => {
    expect(etagMatches(tag, '"stale"')).toBe(false);
  });

  it('does not match when the header is absent', () => {
    expect(etagMatches(tag, undefined)).toBe(false);
  });
});

describe('sendConditionalJson (#985)', () => {
  function makeRes() {
    const headers: Record<string, string> = {};
    let statusCode = 0;
    let body: string | undefined;
    const res = {
      setHeader: (name: string, value: string) => {
        headers[name] = value;
      },
      status: (code: number) => {
        statusCode = code;
        return res;
      },
      end: (b?: string) => {
        body = b;
      },
    };
    return {
      res,
      headers,
      get status() {
        return statusCode;
      },
      get body() {
        return body;
      },
    };
  }

  it('sends 200 with an ETag on a first request', () => {
    const h = makeRes();
    const status = sendConditionalJson(h.res, { a: 1 }, undefined);
    expect(status).toBe(200);
    expect(h.status).toBe(200);
    expect(h.headers.ETag).toMatch(/^"/);
    expect(h.body).toBe('{"a":1}');
  });

  it('returns 304 with no body when If-None-Match matches', () => {
    const h = makeRes();
    const first = makeRes();
    sendConditionalJson(first.res, { a: 1 }, undefined);
    const tag = first.headers.ETag;

    const status = sendConditionalJson(h.res, { a: 1 }, tag);
    expect(status).toBe(304);
    expect(h.status).toBe(304);
    expect(h.body).toBeUndefined();
  });

  it('returns 200 when the representation changed', () => {
    const first = makeRes();
    sendConditionalJson(first.res, { a: 1 }, undefined);
    const staleTag = first.headers.ETag;

    const h = makeRes();
    const status = sendConditionalJson(h.res, { a: 2 }, staleTag);
    expect(status).toBe(200);
    expect(h.body).toBe('{"a":2}');
  });
});
