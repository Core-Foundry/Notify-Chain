/**
 * #993 - API deprecation policy and sunset metadata.
 */
import {
  validateDeprecations,
  deprecationHeaders,
  isSunset,
  daysUntilSunset,
  DeprecationRegistry,
  DeprecationPolicyError,
  MIN_WARNING_PERIOD_DAYS,
  type DeprecationEntry,
} from './deprecation-policy';

const entry = (over: Partial<DeprecationEntry> = {}): DeprecationEntry => ({
  id: 'GET /api/v1/events',
  deprecatedAt: '2026-01-01T00:00:00Z',
  sunsetAt: '2026-07-01T00:00:00Z',
  ...over,
});

describe('validateDeprecations (#993)', () => {
  it('accepts a valid entry', () => {
    expect(() => validateDeprecations([entry()])).not.toThrow();
  });

  it('rejects sunset before deprecation', () => {
    expect(() =>
      validateDeprecations([entry({ sunsetAt: '2025-01-01T00:00:00Z' })]),
    ).toThrow(DeprecationPolicyError);
  });

  it('rejects sunset equal to deprecation', () => {
    expect(() =>
      validateDeprecations([
        entry({ deprecatedAt: '2026-01-01T00:00:00Z', sunsetAt: '2026-01-01T00:00:00Z' }),
      ]),
    ).toThrow(DeprecationPolicyError);
  });

  it('enforces the minimum warning period', () => {
    expect(() =>
      validateDeprecations([
        entry({ deprecatedAt: '2026-01-01T00:00:00Z', sunsetAt: '2026-01-15T00:00:00Z' }),
      ]),
    ).toThrow(/at least 90/);
  });

  it('accepts exactly the minimum warning period', () => {
    expect(() =>
      validateDeprecations([
        entry({ deprecatedAt: '2026-01-01T00:00:00Z', sunsetAt: '2026-04-01T00:00:00Z' }),
      ]),
    ).not.toThrow();
  });

  it('honours a custom minimum', () => {
    expect(() =>
      validateDeprecations(
        [entry({ deprecatedAt: '2026-01-01T00:00:00Z', sunsetAt: '2026-01-15T00:00:00Z' })],
        7,
      ),
    ).not.toThrow();
  });

  it('rejects duplicate ids', () => {
    expect(() => validateDeprecations([entry(), entry()])).toThrow(/Duplicate/);
  });

  it('rejects an invalid date', () => {
    expect(() => validateDeprecations([entry({ sunsetAt: 'not-a-date' })])).toThrow(
      DeprecationPolicyError,
    );
  });

  it('exposes the default minimum of 90 days', () => {
    expect(MIN_WARNING_PERIOD_DAYS).toBe(90);
  });
});

describe('deprecationHeaders (#993)', () => {
  it('emits Deprecation and Sunset headers', () => {
    const h = deprecationHeaders(entry());
    expect(h.Deprecation).toMatch(/GMT$/);
    expect(h.Sunset).toMatch(/GMT$/);
  });

  it('emits a Link header when a replacement is given', () => {
    const h = deprecationHeaders(entry({ replacement: 'https://docs.example.com/v2' }));
    expect(h.Link).toBe(
      '<https://docs.example.com/v2>; rel="deprecation"; type="text/html"',
    );
  });

  it('omits Link when no replacement is given', () => {
    expect(deprecationHeaders(entry()).Link).toBeUndefined();
  });

  it('emits a Warning header with the migration note', () => {
    const h = deprecationHeaders(entry({ migration: 'Use /api/v2/events.' }));
    expect(h.Warning).toContain('Use /api/v2/events.');
  });

  it('omits Warning when there is no migration note', () => {
    expect(deprecationHeaders(entry()).Warning).toBeUndefined();
  });
});

describe('isSunset / daysUntilSunset (#993)', () => {
  it('is false before the sunset date', () => {
    expect(isSunset(entry(), new Date('2026-03-01T00:00:00Z'))).toBe(false);
  });

  it('is true after the sunset date', () => {
    expect(isSunset(entry(), new Date('2026-08-01T00:00:00Z'))).toBe(true);
  });

  it('is true exactly at the sunset instant', () => {
    expect(isSunset(entry(), new Date('2026-07-01T00:00:00Z'))).toBe(true);
  });

  it('reports days remaining', () => {
    expect(daysUntilSunset(entry(), new Date('2026-06-01T00:00:00Z'))).toBe(30);
  });

  it('reports negative days once passed', () => {
    expect(daysUntilSunset(entry(), new Date('2026-07-11T00:00:00Z'))).toBe(-10);
  });
});

describe('DeprecationRegistry (#993)', () => {
  const registry = new DeprecationRegistry([
    entry({ id: 'GET /api/v1/events' }),
    entry({
      id: 'body.legacyField',
      deprecatedAt: '2026-01-01T00:00:00Z',
      sunsetAt: '2026-12-01T00:00:00Z',
    }),
  ]);

  it('finds an exact id', () => {
    expect(registry.find('GET /api/v1/events')?.id).toBe('GET /api/v1/events');
  });

  it('finds a field by bare name', () => {
    expect(registry.find('legacyField')?.id).toBe('body.legacyField');
  });

  it('returns undefined for an unknown id', () => {
    expect(registry.find('nope')).toBeUndefined();
  });

  it('splits active and sunset entries', () => {
    const now = new Date('2026-08-01T00:00:00Z');
    expect(registry.sunsetEntries(now).map((e) => e.id)).toEqual(['GET /api/v1/events']);
    expect(registry.activeEntries(now).map((e) => e.id)).toEqual(['body.legacyField']);
  });

  it('rejects an invalid policy at construction', () => {
    expect(
      () => new DeprecationRegistry([entry({ sunsetAt: '2026-01-02T00:00:00Z' })]),
    ).toThrow(DeprecationPolicyError);
  });

  it('reports its size', () => {
    expect(registry.size()).toBe(2);
  });
});
