/**
 * #986 - Request correlation IDs.
 */
import {
  generateCorrelationId,
  isValidCorrelationId,
  resolveCorrelationId,
} from './correlation-id';

describe('isValidCorrelationId (#986)', () => {
  it.each([
    'abc12345',
    '550e8400-e29b-41d4-a716-446655440000',
    '00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01',
    'req:1234-5678.abcd',
  ])('accepts a safe id: %s', (value) => {
    expect(isValidCorrelationId(value)).toBe(true);
  });

  it.each([
    'short', // too short
    'a'.repeat(129), // too long
    'has space',
    'newline\ninjected',
    'carriage\rreturn',
    'tab\tchar',
    'semi;colon',
    'quote"char',
    '<script>',
    '',
  ])('rejects an unsafe id: %j', (value) => {
    expect(isValidCorrelationId(value)).toBe(false);
  });

  it('rejects non-string values', () => {
    expect(isValidCorrelationId(undefined)).toBe(false);
    expect(isValidCorrelationId(null)).toBe(false);
    expect(isValidCorrelationId(12345)).toBe(false);
    expect(isValidCorrelationId(['abc12345'])).toBe(false);
  });
});

describe('generateCorrelationId (#986)', () => {
  it('produces a value that passes validation', () => {
    for (let i = 0; i < 50; i += 1) {
      expect(isValidCorrelationId(generateCorrelationId())).toBe(true);
    }
  });

  it('produces unique values', () => {
    const ids = new Set(Array.from({ length: 1000 }, generateCorrelationId));
    expect(ids.size).toBe(1000);
  });
});

describe('resolveCorrelationId (#986)', () => {
  it('reuses a valid client-supplied id', () => {
    const id = 'client-trace-1234';
    expect(resolveCorrelationId(id)).toEqual({ id, source: 'client' });
  });

  it('generates an id when the header is absent', () => {
    const result = resolveCorrelationId(undefined);
    expect(result.source).toBe('generated');
    expect(isValidCorrelationId(result.id)).toBe(true);
  });

  it('generates an id when the client value is unsafe (never reuses it)', () => {
    const result = resolveCorrelationId('bad\nvalue');
    expect(result.source).toBe('generated');
    expect(result.id).not.toContain('bad');
  });

  it('refuses to pick between duplicate headers', () => {
    const result = resolveCorrelationId(['abc12345', 'def67890']);
    expect(result.source).toBe('generated');
  });
});
