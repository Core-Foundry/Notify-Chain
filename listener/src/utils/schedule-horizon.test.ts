/**
 * #971 - Enforce a maximum scheduling horizon.
 */
import {
  validateScheduleHorizon,
  DEFAULT_MAX_SCHEDULE_HORIZON_SECONDS,
  CLOCK_SKEW_ALLOWANCE_SECONDS,
} from './schedule-horizon';

const NOW = new Date('2026-10-15T12:00:00Z');
const secondsFromNow = (s: number) => new Date(NOW.getTime() + s * 1000);

describe('validateScheduleHorizon (#971)', () => {
  it('accepts a time shortly in the future', () => {
    const result = validateScheduleHorizon(secondsFromNow(3600), { now: NOW });
    expect(result.valid).toBe(true);
    expect((result as { leadTimeSeconds: number }).leadTimeSeconds).toBe(3600);
  });

  it('accepts a time exactly at the horizon', () => {
    const result = validateScheduleHorizon(
      secondsFromNow(DEFAULT_MAX_SCHEDULE_HORIZON_SECONDS),
      { now: NOW },
    );
    expect(result.valid).toBe(true);
  });

  it('rejects a time one second beyond the horizon', () => {
    const result = validateScheduleHorizon(
      secondsFromNow(DEFAULT_MAX_SCHEDULE_HORIZON_SECONDS + 1),
      { now: NOW },
    );
    expect(result.valid).toBe(false);
    expect((result as { reason: string }).reason).toBe('beyond_horizon');
  });

  it('rejects a time clearly in the past', () => {
    const result = validateScheduleHorizon(secondsFromNow(-3600), { now: NOW });
    expect(result.valid).toBe(false);
    expect((result as { reason: string }).reason).toBe('in_past');
  });

  it('tolerates clock skew within the allowance', () => {
    const result = validateScheduleHorizon(
      secondsFromNow(-CLOCK_SKEW_ALLOWANCE_SECONDS + 1),
      { now: NOW },
    );
    expect(result.valid).toBe(true);
  });

  it('rejects a time just beyond the skew allowance', () => {
    const result = validateScheduleHorizon(
      secondsFromNow(-CLOCK_SKEW_ALLOWANCE_SECONDS - 1),
      { now: NOW },
    );
    expect(result.valid).toBe(false);
    expect((result as { reason: string }).reason).toBe('in_past');
  });

  it('honours a custom horizon', () => {
    const result = validateScheduleHorizon(secondsFromNow(7200), {
      now: NOW,
      maxHorizonSeconds: 3600,
    });
    expect(result.valid).toBe(false);
    expect((result as { reason: string }).reason).toBe('beyond_horizon');
  });

  it('rejects an invalid date', () => {
    const result = validateScheduleHorizon(new Date('nonsense'), { now: NOW });
    expect(result.valid).toBe(false);
    expect((result as { reason: string }).reason).toBe('in_past');
  });

  it('mentions the horizon in days in the error message', () => {
    const result = validateScheduleHorizon(secondsFromNow(1e9), { now: NOW });
    expect((result as { message: string }).message).toContain('90 days');
  });
});
