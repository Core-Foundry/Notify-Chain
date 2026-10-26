/**
 * Maximum scheduling horizon (#971).
 *
 * Without an upper bound on `executeAt`, a client can schedule a notification
 * arbitrarily far in the future. Those rows are invisible to operators, bloat
 * every queue query, and can be used to exhaust storage for free. This module
 * defines the horizon and validates it independently of the HTTP layer so the
 * rule is testable and reusable.
 */

/** Default horizon: 90 days, matching the stream-duration convention. */
export const DEFAULT_MAX_SCHEDULE_HORIZON_SECONDS = 90 * 24 * 60 * 60;

export interface ScheduleHorizonOptions {
  /** Maximum allowed lead time, in seconds. Defaults to 90 days. */
  maxHorizonSeconds?: number;
  /** Clock injection for tests. */
  now?: Date;
}

export type ScheduleHorizonResult =
  | { valid: true; leadTimeSeconds: number }
  | { valid: false; reason: 'in_past' | 'beyond_horizon'; message: string; leadTimeSeconds: number };

/**
 * Validate that `executeAt` is in the future and within the allowed horizon.
 *
 * A small clock skew allowance (default 60s) is applied so a request generated
 * on a client with a slightly fast clock is not rejected as "in the past".
 */
export function validateScheduleHorizon(
  executeAt: Date,
  options: ScheduleHorizonOptions = {},
): ScheduleHorizonResult {
  const maxHorizonSeconds =
    options.maxHorizonSeconds ?? DEFAULT_MAX_SCHEDULE_HORIZON_SECONDS;
  const now = options.now ?? new Date();

  if (Number.isNaN(executeAt.getTime())) {
    return {
      valid: false,
      reason: 'in_past',
      message: 'executeAt is not a valid date.',
      leadTimeSeconds: 0,
    };
  }

  const leadTimeSeconds = (executeAt.getTime() - now.getTime()) / 1000;

  if (leadTimeSeconds < -CLOCK_SKEW_ALLOWANCE_SECONDS) {
    return {
      valid: false,
      reason: 'in_past',
      message: 'executeAt must be in the future.',
      leadTimeSeconds,
    };
  }

  if (leadTimeSeconds > maxHorizonSeconds) {
    const maxDays = Math.round(maxHorizonSeconds / 86400);
    return {
      valid: false,
      reason: 'beyond_horizon',
      message: `executeAt is more than ${maxDays} days in the future (the maximum scheduling horizon).`,
      leadTimeSeconds,
    };
  }

  return { valid: true, leadTimeSeconds };
}

/** Tolerated client clock skew, in seconds. */
export const CLOCK_SKEW_ALLOWANCE_SECONDS = 60;
