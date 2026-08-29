/**
 * Notification Retry Backoff Configuration & Validation Engine (Issue #707)
 *
 * Provides standalone, provider-agnostic retry backoff calculation and validation
 * ensuring delays remain bounded and invalid parameters are strictly rejected.
 */

export interface RetryBackoffOptions {
  /** Initial base delay in milliseconds (must be > 0). Default: 1,000ms. */
  initialDelayMs: number;
  /** Maximum delay ceiling in milliseconds (must be >= initialDelayMs). Default: 300,000ms (5 mins). */
  maxDelayMs: number;
  /** Exponential backoff multiplier (must be >= 1.0). Default: 2.0. */
  multiplier: number;
  /** Random jitter ratio (0.0 to 1.0, e.g. 0.25 for ±25%). Default: 0.2. */
  jitterRatio: number;
  /** Max retry attempts before giving up / dead-lettering. Default: 5. */
  maxAttempts: number;
}

export const DEFAULT_RETRY_BACKOFF_CONFIG: RetryBackoffOptions = {
  initialDelayMs: 1_000,
  maxDelayMs: 300_000,
  multiplier: 2.0,
  jitterRatio: 0.2,
  maxAttempts: 5,
};

/**
 * Validates retry backoff options and returns a normalized, verified configuration.
 * Throws explicit errors on invalid or out-of-bounds parameters.
 */
export function validateBackoffConfig(
  input: Partial<RetryBackoffOptions> = {}
): RetryBackoffOptions {
  const config: RetryBackoffOptions = {
    ...DEFAULT_RETRY_BACKOFF_CONFIG,
    ...input,
  };

  if (typeof config.initialDelayMs !== 'number' || isNaN(config.initialDelayMs) || config.initialDelayMs <= 0) {
    throw new Error(`Invalid backoff config: initialDelayMs must be a positive number (> 0), received ${config.initialDelayMs}`);
  }

  if (typeof config.maxDelayMs !== 'number' || isNaN(config.maxDelayMs) || config.maxDelayMs <= 0) {
    throw new Error(`Invalid backoff config: maxDelayMs must be a positive number (> 0), received ${config.maxDelayMs}`);
  }

  if (config.maxDelayMs < config.initialDelayMs) {
    throw new Error(
      `Invalid backoff config: maxDelayMs (${config.maxDelayMs}) cannot be less than initialDelayMs (${config.initialDelayMs})`
    );
  }

  if (typeof config.multiplier !== 'number' || isNaN(config.multiplier) || config.multiplier < 1.0) {
    throw new Error(`Invalid backoff config: multiplier must be >= 1.0, received ${config.multiplier}`);
  }

  if (
    typeof config.jitterRatio !== 'number' ||
    isNaN(config.jitterRatio) ||
    config.jitterRatio < 0.0 ||
    config.jitterRatio > 1.0
  ) {
    throw new Error(`Invalid backoff config: jitterRatio must be between 0.0 and 1.0, received ${config.jitterRatio}`);
  }

  if (typeof config.maxAttempts !== 'number' || isNaN(config.maxAttempts) || config.maxAttempts < 1) {
    throw new Error(`Invalid backoff config: maxAttempts must be at least 1, received ${config.maxAttempts}`);
  }

  return config;
}

/**
 * Computes deterministic or jittered retry delay bounded strictly by [0, maxDelayMs].
 *
 * Formula:
 *   rawDelay = min(initialDelayMs * (multiplier ^ attempt), maxDelayMs)
 *   jitterRange = rawDelay * jitterRatio
 *   boundedDelay = rawDelay + random(-jitterRange, +jitterRange) capped at maxDelayMs
 */
export function calculateBoundedBackoff(
  attempt: number,
  options: Partial<RetryBackoffOptions> = {},
  randomFn = Math.random
): number {
  const config = validateBackoffConfig(options);
  const safeAttempt = Math.max(0, Math.floor(attempt));

  // Compute base exponential delay
  const rawDelay = Math.min(
    config.initialDelayMs * Math.pow(config.multiplier, safeAttempt),
    config.maxDelayMs
  );

  if (config.jitterRatio === 0) {
    return Math.floor(rawDelay);
  }

  // Calculate jitter: ±(rawDelay * jitterRatio)
  const jitterOffset = (randomFn() * 2 - 1) * (rawDelay * config.jitterRatio);
  const jitteredDelay = Math.max(0, Math.min(rawDelay + jitterOffset, config.maxDelayMs));

  return Math.floor(jitteredDelay);
}
