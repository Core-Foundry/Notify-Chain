import {
  InputValidator,
  ValidationError,
  isPlainObject,
  isNonEmptyString,
  isBoolean,
  isFiniteNumber,
  isInteger,
  isNonNegativeInteger,
  isPositiveInteger,
  isInRange,
  isOneOf,
  isValidDate,
  parseOptionalIntParam,
  parseOptionalDateParam,
  validationErrorBody,
} from './validation';

describe('type guards', () => {
  it('isPlainObject accepts plain objects and rejects arrays, null, and primitives', () => {
    expect(isPlainObject({})).toBe(true);
    expect(isPlainObject({ a: 1 })).toBe(true);
    expect(isPlainObject([])).toBe(false);
    expect(isPlainObject(null)).toBe(false);
    expect(isPlainObject('x')).toBe(false);
    expect(isPlainObject(undefined)).toBe(false);
  });

  it('isNonEmptyString rejects empty and whitespace-only strings', () => {
    expect(isNonEmptyString('hello')).toBe(true);
    expect(isNonEmptyString('')).toBe(false);
    expect(isNonEmptyString('   ')).toBe(false);
    expect(isNonEmptyString(123)).toBe(false);
    expect(isNonEmptyString(null)).toBe(false);
  });

  it('isBoolean only accepts actual booleans', () => {
    expect(isBoolean(true)).toBe(true);
    expect(isBoolean(false)).toBe(true);
    expect(isBoolean('true')).toBe(false);
    expect(isBoolean(1)).toBe(false);
  });

  it('isFiniteNumber rejects NaN and Infinity', () => {
    expect(isFiniteNumber(5)).toBe(true);
    expect(isFiniteNumber(-5.5)).toBe(true);
    expect(isFiniteNumber(NaN)).toBe(false);
    expect(isFiniteNumber(Infinity)).toBe(false);
    expect(isFiniteNumber('5')).toBe(false);
  });

  it('isInteger, isNonNegativeInteger, isPositiveInteger enforce whole-number bounds', () => {
    expect(isInteger(5)).toBe(true);
    expect(isInteger(5.5)).toBe(false);
    expect(isNonNegativeInteger(0)).toBe(true);
    expect(isNonNegativeInteger(-1)).toBe(false);
    expect(isPositiveInteger(0)).toBe(false);
    expect(isPositiveInteger(1)).toBe(true);
  });

  it('isInRange is inclusive on both ends', () => {
    expect(isInRange(1, 1, 10)).toBe(true);
    expect(isInRange(10, 1, 10)).toBe(true);
    expect(isInRange(0, 1, 10)).toBe(false);
    expect(isInRange(11, 1, 10)).toBe(false);
  });

  it('isOneOf checks membership in an allowed list', () => {
    expect(isOneOf('a', ['a', 'b'] as const)).toBe(true);
    expect(isOneOf('c', ['a', 'b'] as const)).toBe(false);
  });

  it('isValidDate accepts Date instances and parseable strings, rejects garbage', () => {
    expect(isValidDate(new Date())).toBe(true);
    expect(isValidDate('2026-07-24T00:00:00.000Z')).toBe(true);
    expect(isValidDate('not-a-date')).toBe(false);
    expect(isValidDate(new Date('invalid'))).toBe(false);
    expect(isValidDate(null)).toBe(false);
    expect(isValidDate({})).toBe(false);
  });
});

describe('InputValidator', () => {
  it('does not throw when every check passes', () => {
    const v = new InputValidator();
    v.check(true, 'name', 'required');
    expect(() => v.throwIfInvalid()).not.toThrow();
    expect(v.hasIssues()).toBe(false);
  });

  it('collects every failing field and throws a single ValidationError', () => {
    const v = new InputValidator();
    v.check(false, 'name', 'is required');
    v.check(true, 'age', 'must be a number');
    v.check(false, 'email', 'must be valid');

    expect(v.hasIssues()).toBe(true);
    expect(v.getIssues()).toEqual([
      { field: 'name', message: 'is required' },
      { field: 'email', message: 'must be valid' },
    ]);

    try {
      v.throwIfInvalid();
      throw new Error('expected throwIfInvalid to throw');
    } catch (err) {
      expect(err).toBeInstanceOf(ValidationError);
      expect((err as ValidationError).issues).toHaveLength(2);
    }
  });
});

describe('parseOptionalIntParam', () => {
  it('returns undefined for absent values', () => {
    expect(parseOptionalIntParam(null, 'limit')).toBeUndefined();
    expect(parseOptionalIntParam('', 'limit')).toBeUndefined();
  });

  it('parses valid integers', () => {
    expect(parseOptionalIntParam('50', 'limit')).toBe(50);
    expect(parseOptionalIntParam('0', 'offset')).toBe(0);
  });

  it('rejects non-integer values with a meaningful message', () => {
    expect(() => parseOptionalIntParam('abc', 'limit')).toThrow(ValidationError);
    expect(() => parseOptionalIntParam('12.5', 'limit')).toThrow(ValidationError);
    try {
      parseOptionalIntParam('abc', 'limit');
    } catch (err) {
      expect((err as ValidationError).issues[0]).toEqual({
        field: 'limit',
        message: "must be an integer, received 'abc'",
      });
    }
  });

  it('enforces min/max bounds', () => {
    expect(() => parseOptionalIntParam('-1', 'limit', { min: 0 })).toThrow(ValidationError);
    expect(() => parseOptionalIntParam('101', 'limit', { max: 100 })).toThrow(ValidationError);
    expect(parseOptionalIntParam('100', 'limit', { min: 0, max: 100 })).toBe(100);
  });
});

describe('parseOptionalDateParam', () => {
  it('returns undefined for absent values', () => {
    expect(parseOptionalDateParam(null, 'startDate')).toBeUndefined();
    expect(parseOptionalDateParam(undefined, 'startDate')).toBeUndefined();
  });

  it('passes through valid date strings', () => {
    expect(parseOptionalDateParam('2026-01-01', 'startDate')).toBe('2026-01-01');
  });

  it('rejects invalid date strings', () => {
    expect(() => parseOptionalDateParam('not-a-date', 'startDate')).toThrow(ValidationError);
  });
});

describe('validationErrorBody', () => {
  it('formats a ValidationError as a JSON-ready body', () => {
    const error = new ValidationError([{ field: 'name', message: 'is required' }]);
    expect(validationErrorBody(error)).toEqual({
      error: 'Validation failed',
      details: [{ field: 'name', message: 'is required' }],
    });
  });

  it('handles single issue constructor for ValidationError', () => {
    const single = new ValidationError({ field: 'channel', message: 'is invalid' });
    expect(single.issues).toHaveLength(1);
    expect(single.message).toBe('channel: is invalid');
  });
});
