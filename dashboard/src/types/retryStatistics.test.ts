import { formatAverageRetries, formatRetryRate } from '../types/retryStatistics';

describe('retryStatistics format helpers', () => {
  it('formats retry rate as a percentage', () => {
    expect(formatRetryRate(0.3)).toBe('30.0%');
    expect(formatRetryRate(0)).toBe('0.0%');
  });

  it('formats average retries to two decimals', () => {
    expect(formatAverageRetries(1.2)).toBe('1.20');
    expect(formatAverageRetries(0)).toBe('0.00');
  });
});
