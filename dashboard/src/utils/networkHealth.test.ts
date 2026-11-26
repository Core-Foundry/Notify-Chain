import {
  classifyNetworkHealth,
  isNetworkStatusStale,
  NETWORK_DEGRADED_LATENCY_MS,
  NETWORK_STATUS_STALE_AFTER_MS,
  parseNetworkHealth,
  resolveNetworkHealthUrl,
} from './networkHealth';

// Issue #1154: network health overview.

const body = (overrides: Record<string, unknown> = {}, rpc: Record<string, unknown> = {}) => ({
  status: 'ok',
  timestamp: '2026-01-01T12:00:00.000Z',
  network: 'testnet',
  services: { stellarRpc: { status: 'ok', latencyMs: 120, ...rpc } },
  ...overrides,
});

describe('network health model', () => {
  it('parses the listener /health response', () => {
    expect(parseNetworkHealth(body())).toEqual({
      network: 'testnet',
      overall: 'ok',
      rpcStatus: 'ok',
      rpcLatencyMs: 120,
      checkedAtMs: Date.parse('2026-01-01T12:00:00.000Z'),
    });
  });

  it('accepts a { data } envelope and tolerates junk', () => {
    expect(parseNetworkHealth({ data: body() }).network).toBe('testnet');
    const junk = parseNetworkHealth('nope', 42);
    expect(junk).toMatchObject({ network: null, overall: null, rpcStatus: null, checkedAtMs: 42 });
    expect(parseNetworkHealth(body({ network: 'unknown' })).network).toBeNull();
  });

  it('distinguishes healthy, degraded and unavailable', () => {
    expect(classifyNetworkHealth(parseNetworkHealth(body()))).toBe('healthy');
    expect(
      classifyNetworkHealth(
        parseNetworkHealth(body({}, { latencyMs: NETWORK_DEGRADED_LATENCY_MS + 1 })),
      ),
    ).toBe('degraded');
    expect(classifyNetworkHealth(parseNetworkHealth(body({ status: 'degraded' })))).toBe(
      'degraded',
    );
    expect(
      classifyNetworkHealth(parseNetworkHealth(body({ status: 'error' }, { status: 'error' }))),
    ).toBe('unavailable');
    expect(classifyNetworkHealth(null)).toBe('unavailable');
  });

  it('falls back to the overall status without RPC detail', () => {
    expect(classifyNetworkHealth(parseNetworkHealth({ status: 'ok' }))).toBe('healthy');
    expect(classifyNetworkHealth(parseNetworkHealth({ status: 'error' }))).toBe('unavailable');
  });

  it('marks status as stale after the threshold', () => {
    expect(isNetworkStatusStale(null, 1_000)).toBe(true);
    expect(isNetworkStatusStale(0, NETWORK_STATUS_STALE_AFTER_MS)).toBe(false);
    expect(isNetworkStatusStale(0, NETWORK_STATUS_STALE_AFTER_MS + 1)).toBe(true);
  });

  it('derives the health URL from the events API URL', () => {
    expect(resolveNetworkHealthUrl('https://listener.example/api/events?x=1')).toBe(
      'https://listener.example/health',
    );
    expect(resolveNetworkHealthUrl('not a url')).toBe('http://localhost:8787/health');
  });
});
