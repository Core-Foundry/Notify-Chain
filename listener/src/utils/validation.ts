/**
 * Shared input validation helpers.
 *
 * Services and API handlers use these to reject invalid input before doing
 * any processing, and to report *why* the input was rejected in a form that
 * is safe to return to a caller.
 */

export interface ValidationIssue {
  field: string;
  message: string;
}

/**
 * Thrown when one or more fields fail validation. Carries every failing
 * field (not just the first) so callers can report a complete, actionable
 * error message in a single response.
 */
export class ValidationError extends Error {
  readonly issues: ValidationIssue[];

  constructor(issues: ValidationIssue[] | ValidationIssue) {
    const list = Array.isArray(issues) ? issues : [issues];
    super(list.map((issue) => `${issue.field}: ${issue.message}`).join('; '));
    this.name = 'ValidationError';
    this.issues = list;
  }
}

/** Accumulates field-level validation issues and throws them together. */
export class InputValidator {
  private issues: ValidationIssue[] = [];

  /** Records an issue if `condition` is false. Returns `condition` so checks can short-circuit dependent rules. */
  check(condition: boolean, field: string, message: string): boolean {
    if (!condition) {
      this.issues.push({ field, message });
    }
    return condition;
  }

  hasIssues(): boolean {
    return this.issues.length > 0;
  }

  getIssues(): ValidationIssue[] {
    return [...this.issues];
  }

  /** Throws a ValidationError containing every recorded issue, if any were recorded. */
  throwIfInvalid(): void {
    if (this.issues.length > 0) {
      throw new ValidationError(this.issues);
    }
  }
}

export function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

export function isString(value: unknown): value is string {
  return typeof value === 'string';
}

export function isBoolean(value: unknown): value is boolean {
  return typeof value === 'boolean';
}

export function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

export function isInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value);
}

export function isNonNegativeInteger(value: unknown): value is number {
  return isInteger(value) && value >= 0;
}

export function isPositiveInteger(value: unknown): value is number {
  return isInteger(value) && value > 0;
}

export function isInRange(value: number, min: number, max: number): boolean {
  return value >= min && value <= max;
}

export function isOneOf<T>(value: unknown, allowed: readonly T[]): value is T {
  return (allowed as readonly unknown[]).includes(value);
}

/** True for a value that parses to a real calendar date, whether given as a Date or a string/number Date() accepts. */
export function isValidDate(value: unknown): boolean {
  if (value instanceof Date) {
    return !Number.isNaN(value.getTime());
  }
  if (typeof value === 'string' || typeof value === 'number') {
    return !Number.isNaN(new Date(value).getTime());
  }
  return false;
}

/** Parses a query-string integer parameter, returning undefined when absent and throwing ValidationError when present-but-invalid. */
export function parseOptionalIntParam(
  raw: string | null,
  field: string,
  options: { min?: number; max?: number } = {},
): number | undefined {
  if (raw === null || raw === undefined || raw === '') {
    return undefined;
  }
  const parsed = Number(raw);
  if (!Number.isInteger(parsed)) {
    throw new ValidationError({ field, message: `must be an integer, received '${raw}'` });
  }
  if (options.min !== undefined && parsed < options.min) {
    throw new ValidationError({ field, message: `must be >= ${options.min}` });
  }
  if (options.max !== undefined && parsed > options.max) {
    throw new ValidationError({ field, message: `must be <= ${options.max}` });
  }
  return parsed;
}

/** Parses an optional ISO-ish date query/body parameter, throwing ValidationError when present-but-invalid. */
export function parseOptionalDateParam(raw: string | null | undefined, field: string): string | undefined {
  if (raw === null || raw === undefined || raw === '') {
    return undefined;
  }
  if (!isValidDate(raw)) {
    throw new ValidationError({ field, message: `must be a valid date, received '${raw}'` });
  }
  return raw;
}

/** Standard shape for reporting a ValidationError over HTTP. */
export function validationErrorBody(error: ValidationError): { error: string; details: ValidationIssue[] } {
  return { error: 'Validation failed', details: error.issues };
}
