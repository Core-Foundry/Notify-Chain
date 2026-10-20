/**
 * #989 - Per-client usage accounting.
 */
import {
  deriveClientId,
  redactClientId,
  UsageMeter,
  UsageAccountingError,
  recordFromRequest,
  CLIENT_ID_LENGTH,
  DEFAULT_WINDOW_MS,
} from './usage-meter';

const SALT = 'deployment-salt-a';

describe('deriveClientId (#989)', () => {
  it('returns a stable, fixed-length id', () => {
    const a = deriveClientId('key-one', SALT);
    expect(a).toHaveLength(CLIENT_ID_LENGTH);
    expect(deriveClientId('key-one', SALT)).toBe(a);
  });

  it('gives different credentials different ids', () => {
    expect(deriveClientId('key-one', SALT)).not.toBe(deriveClientId('key-two', SALT));
  });

  it('gives different salts different ids for the same credential', () => {
    expect(deriveClientId('key-one', SALT)).not.toBe(deriveClientId('key-one', 'other-salt'));
  });

  it('is lowercase hex', () => {
    expect(deriveClientId('key-one', SALT)).toMatch(/^[0-9a-f]{16}$/);
  });

  it('never embeds the credential', () => {
    const id = deriveClientId('super-secret-key', SALT);
    expect(id).not.toContain('super');
    expect(id).not.toContain('secret');
  });

  it('rejects an empty credential', () => {
    expect(() => deriveClientId('', SALT)).toThrow(UsageAccountingError);
  });

  it('rejects an empty salt', () => {
    expect(() => deriveClientId('key-one', '')).toThrow(UsageAccountingError);
  });
});

describe('redactClientId (#989)', () => {
  it('trims a long id to its head and tail', () => {
    expect(redactClientId('0123456789abcdef')).toBe('0123…cdef');
  });

  it('returns a short id unchanged', () => {
    expect(redactClientId('abc')).toBe('abc');
  });

  it('falls back to unknown for an empty id', () => {
    expect(redactClientId('')).toBe('unknown');
  });
});

describe('recordFromRequest (#989)', () => {
  it('derives the id without exposing the credential', () => {
    const r = recordFromRequest('the-key', SALT, 'GET /events', 200, 12, 1000);
    expect(r.clientId).toBe(deriveClientId('the-key', SALT));
    expect(r).not.toHaveProperty('credential');
    expect(JSON.stringify(r)).not.toContain('the-key');
  });

  it('uses the supplied timestamp', () => {
    const r = recordFromRequest('k', SALT, 'GET /events', 200, 5, 42);
    expect(r.at).toBe(42);
  });
});

describe('UsageMeter aggregation (#989)', () => {
  const base = 1_000_000;
  const meter = new UsageMeter();

  beforeAll(() => {
    const rows: Array<[string, string, number, number, number]> = [
      ['clientA', 'GET /events', 200, 10, base + 5],
      ['clientA', 'GET /events', 500, 20, base + 6],
      ['clientA', 'POST /webhooks', 201, 30, base + 7],
      ['clientB', 'GET /events', 200, 8, base + 8],
    ];
    for (const [cid, route, status, dur, at] of rows) {
      meter.record({ clientId: cid, route, status, durationMs: dur, at });
    }
  });

  it('aggregates totals per client', () => {
    const s = meter.summary();
    expect(s).toHaveLength(2);
    expect(s[0]).toMatchObject({ clientId: 'clientA', requests: 3, errors: 1 });
    expect(s[1]).toMatchObject({ clientId: 'clientB', requests: 1, errors: 0 });
  });

  it('counts durations and first/last seen', () => {
    const a = meter.summary().find((t) => t.clientId === 'clientA');
    expect(a?.totalDurationMs).toBe(60);
    expect(a?.firstSeen).toBe(base + 5);
    expect(a?.lastSeen).toBe(base + 7);
  });

  it('filters by time range', () => {
    const s = meter.summary(base + 7, base + 9);
    expect(s.map((t) => t.clientId).sort()).toEqual(['clientA', 'clientB']);
    expect(s.find((t) => t.clientId === 'clientA')?.requests).toBe(1);
  });

  it('breaks one client down by route', () => {
    const r = meter.byRoute('clientA');
    expect(r).toHaveLength(2);
    expect(r[0]).toMatchObject({ route: 'GET /events', requests: 2, errors: 1 });
    expect(r[1]).toMatchObject({ route: 'POST /webhooks', requests: 1, errors: 0 });
  });

  it('returns no routes for an unknown client', () => {
    expect(meter.byRoute('nope')).toEqual([]);
  });

  it('rejects a record without a clientId', () => {
    expect(() =>
      meter.record({ clientId: '', route: 'x', status: 200, durationMs: 1, at: base }),
    ).toThrow(UsageAccountingError);
  });

  it('rejects a record with a non-finite timestamp', () => {
    expect(() =>
      meter.record({ clientId: 'c', route: 'x', status: 200, durationMs: 1, at: NaN }),
    ).toThrow(UsageAccountingError);
  });
});

describe('UsageMeter windows (#989)', () => {
  const meter = new UsageMeter();
  const W = DEFAULT_WINDOW_MS;
  const from = 10 * W;
  const to = 13 * W;

  beforeAll(() => {
    // 3 in bucket 10, 1 in bucket 11, 0 in bucket 12
    for (let i = 0; i < 3; i++) {
      meter.record({ clientId: 'c', route: 'r', status: 200, durationMs: 1, at: from + i });
    }
    meter.record({ clientId: 'c', route: 'r', status: 200, durationMs: 1, at: 11 * W + 5 });
  });

  it('produces fixed buckets covering the range', () => {
    const w = meter.windows(from, to, W);
    expect(w).toHaveLength(3);
    expect(w[0]).toMatchObject({ start: 10 * W, requests: 3 });
    expect(w[1]).toMatchObject({ start: 11 * W, requests: 1 });
    expect(w[2]).toMatchObject({ start: 12 * W, requests: 0 });
    expect(w[0].end).toBe(w[1].start);
  });

  it('reconciles with the total in range', () => {
    const w = meter.windows(from, to, W);
    const sum = w.reduce((n, b) => n + b.requests, 0);
    expect(sum).toBe(meter.totalInRange(from, to));
  });

  it('buckets align on the fixed width, not the range start', () => {
    const w = meter.windows(from + 5, 11 * W, W);
    expect(w[0].start).toBe(10 * W);
  });

  it('excludes records at or after the end', () => {
    // [from, from+1) holds only the first of the three records at from+0..+2.
    expect(meter.totalInRange(from, from + 1)).toBe(1);
    expect(meter.totalInRange(from, from + 3)).toBe(3);
  });

  it('rejects a non-positive width', () => {
    expect(() => meter.windows(from, to, 0)).toThrow(UsageAccountingError);
  });

  it('rejects an inverted range', () => {
    expect(() => meter.windows(to, from, W)).toThrow(UsageAccountingError);
  });
});

describe('UsageMeter limits and lifecycle (#989)', () => {
  it('finds clients over a per-window limit', () => {
    const m = new UsageMeter();
    const now = 1_000_000;
    for (let i = 0; i < 5; i++) {
      m.record({ clientId: 'hot', route: 'r', status: 200, durationMs: 1, at: now - 10 });
    }
    m.record({ clientId: 'cold', route: 'r', status: 200, durationMs: 1, at: now - 5_000_000 });
    const over = m.overLimit(3, 60_000, now);
    expect(over).toHaveLength(1);
    expect(over[0].clientId).toBe('hot');
    expect(over[0].requests).toBe(5);
  });

  it('rejects a non-positive limit', () => {
    const m = new UsageMeter();
    expect(() => m.overLimit(0)).toThrow(UsageAccountingError);
  });

  it('rejects a non-positive maxRecords', () => {
    expect(() => new UsageMeter(0)).toThrow(UsageAccountingError);
  });

  it('bounds retained records to the newest', () => {
    const m = new UsageMeter(2);
    for (let i = 0; i < 5; i++) {
      m.record({ clientId: 'c', route: 'r', status: 200, durationMs: 1, at: i });
    }
    expect(m.size()).toBe(2);
    expect(m.summary().length).toBe(1);
  });

  it('resets to empty', () => {
    const m = new UsageMeter();
    m.record({ clientId: 'c', route: 'r', status: 200, durationMs: 1, at: 1 });
    expect(m.size()).toBe(1);
    m.reset();
    expect(m.size()).toBe(0);
    expect(m.summary()).toEqual([]);
  });
});
