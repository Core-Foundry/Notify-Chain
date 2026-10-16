import {
  calculateBoundedBackoff,
  validateBackoffConfig,
  DEFAULT_RETRY_BACKOFF_CONFIG,
} from './retry-backoff-config';

describe('Notification Retry Backoff Configuration (Issue #707)', () => {
  describe('validateBackoffConfig', () => {
    test('returns default configuration when given empty options', () => {
      const config = validateBackoffConfig({});
      expect(config).toEqual(DEFAULT_RETRY_BACKOFF_CONFIG);
    });

    test('accepts valid custom backoff parameters', () => {
      const custom = {
        initialDelayMs: 2000,
        maxDelayMs: 60000,
        multiplier: 3.0,
        jitterRatio: 0.1,
        maxAttempts: 10,
      };
      const config = validateBackoffConfig(custom);
      expect(config.initialDelayMs).toBe(2000);
      expect(config.multiplier).toBe(3.0);
    });

    test('rejects non-positive initialDelayMs', () => {
      expect(() => validateBackoffConfig({ initialDelayMs: 0 })).toThrow(/initialDelayMs must be a positive number/);
      expect(() => validateBackoffConfig({ initialDelayMs: -500 })).toThrow(/initialDelayMs must be a positive number/);
    });

    test('rejects maxDelayMs smaller than initialDelayMs', () => {
      expect(() =>
        validateBackoffConfig({ initialDelayMs: 5000, maxDelayMs: 1000 })
      ).toThrow(/maxDelayMs.*cannot be less than initialDelayMs/);
    });

    test('rejects multiplier smaller than 1.0', () => {
      expect(() => validateBackoffConfig({ multiplier: 0.8 })).toThrow(/multiplier must be >= 1.0/);
    });

    test('rejects out of bounds jitterRatio', () => {
      expect(() => validateBackoffConfig({ jitterRatio: -0.1 })).toThrow(/jitterRatio must be between 0.0 and 1.0/);
      expect(() => validateBackoffConfig({ jitterRatio: 1.5 })).toThrow(/jitterRatio must be between 0.0 and 1.0/);
    });
  });

  describe('calculateBoundedBackoff', () => {
    test('calculates exponential delays correctly', () => {
      const opts = { initialDelayMs: 1000, multiplier: 2.0, jitterRatio: 0 };

      expect(calculateBoundedBackoff(0, opts)).toBe(1000);
      expect(calculateBoundedBackoff(1, opts)).toBe(2000);
      expect(calculateBoundedBackoff(2, opts)).toBe(4000);
      expect(calculateBoundedBackoff(3, opts)).toBe(8000);
    });

    test('strictly enforces maxDelayMs ceiling on high attempts', () => {
      const opts = { initialDelayMs: 1000, multiplier: 2.0, maxDelayMs: 10000, jitterRatio: 0 };

      expect(calculateBoundedBackoff(10, opts)).toBe(10000);
      expect(calculateBoundedBackoff(20, opts)).toBe(10000);
    });

    test('applies bounded jitter within ratio without exceeding maxDelayMs', () => {
      const opts = { initialDelayMs: 1000, multiplier: 2.0, maxDelayMs: 5000, jitterRatio: 0.25 };

      // Mock randomFn to return 1.0 (maximum positive jitter)
      const maxJittered = calculateBoundedBackoff(2, opts, () => 1.0); // raw = 4000, jitter = +1000 -> 5000
      expect(maxJittered).toBe(5000);

      // Mock randomFn to return 0.0 (maximum negative jitter)
      const minJittered = calculateBoundedBackoff(2, opts, () => 0.0); // raw = 4000, jitter = -1000 -> 3000
      expect(minJittered).toBe(3000);
    });
  });
});
