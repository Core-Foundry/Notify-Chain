/**
 * Tests for error utilities
 */

import {
  categorizeError,
  detectErrorCategory,
  getErrorMessage,
  sanitizeError,
  stripSensitiveData,
  isRecoverable,
  getSuggestedActions,
  getDiagnostics,
} from './error-utils';

describe('error-utils', () => {
  describe('categorizeError', () => {
    it('should categorize critical errors', () => {
      expect(categorizeError(new Error('Out of memory'))).toBe('critical');
      expect(categorizeError(new Error('Stack overflow'))).toBe('critical');
    });

    it('should categorize high severity errors', () => {
      expect(categorizeError(new TypeError('Cannot read property'))).toBe('high');
      expect(categorizeError(new ReferenceError('x is not defined'))).toBe('high');
    });

    it('should categorize medium severity errors', () => {
      expect(categorizeError(new Error('Network error'))).toBe('medium');
      expect(categorizeError(new Error('Fetch failed'))).toBe('medium');
    });

    it('should categorize low severity errors', () => {
      expect(categorizeError(new Error('Validation failed'))).toBe('low');
      expect(categorizeError(new Error('Invalid input'))).toBe('low');
    });

    it('should handle non-Error objects', () => {
      expect(categorizeError('string error')).toBe('error');
      expect(categorizeError({ message: 'object error' })).toBe('error');
    });
  });

  describe('detectErrorCategory', () => {
    it('should detect network errors', () => {
      expect(detectErrorCategory(new Error('Fetch failed'))).toBe('network');
      expect(detectErrorCategory(new Error('Network error'))).toBe('network');
    });

    it('should detect render errors', () => {
      expect(detectErrorCategory(new Error('Render error'))).toBe('render');
    });

    it('should detect lifecycle errors', () => {
      expect(detectErrorCategory(new Error('Effect cleanup error'))).toBe('lifecycle');
    });

    it('should detect async errors', () => {
      const error = new Error('Promise rejected');
      error.stack = 'at async function';
      expect(detectErrorCategory(error)).toBe('async');
    });

    it('should default to unknown', () => {
      expect(detectErrorCategory(new Error('Generic error'))).toBe('unknown');
    });
  });

  describe('getErrorMessage', () => {
    it('should extract message from Error', () => {
      const error = new Error('Test message');
      expect(getErrorMessage(error)).toBe('Test message');
    });

    it('should handle string errors', () => {
      expect(getErrorMessage('String error')).toBe('String error');
    });

    it('should handle object errors', () => {
      const error = { message: 'Object error' };
      expect(getErrorMessage(error)).toBe('Object error');
    });

    it('should handle unknown errors', () => {
      expect(getErrorMessage(null)).toBe('An unknown error occurred');
      expect(getErrorMessage(undefined)).toBe('An unknown error occurred');
    });
  });

  describe('stripSensitiveData', () => {
    it('should remove API keys', () => {
      expect(stripSensitiveData('api_key=sk-12345')).not.toContain('sk-12345');
      expect(stripSensitiveData('?token=abc123')).not.toContain('abc123');
    });

    it('should remove email addresses', () => {
      const result = stripSensitiveData('Error from user@example.com');
      expect(result).not.toContain('user@example.com');
    });

    it('should remove URLs with auth', () => {
      const result = stripSensitiveData('https://user:pass@api.example.com/path');
      expect(result).not.toContain('user:pass');
    });

    it('should remove UUIDs', () => {
      const uuid = '123e4567-e89b-12d3-a456-426614174000';
      const result = stripSensitiveData(`ID: ${uuid}`);
      expect(result).not.toContain(uuid);
    });

    it('should remove hex addresses', () => {
      const result = stripSensitiveData('Address: 0xABCDEF123456');
      expect(result).not.toContain('0xABCDEF123456');
    });

    it('should keep non-sensitive data', () => {
      const result = stripSensitiveData('Connection timeout after 5000ms');
      expect(result).toContain('Connection timeout');
    });
  });

  describe('sanitizeError', () => {
    it('should sanitize error objects', () => {
      const error = new Error('Test error with api_key=secret');
      const sanitized = sanitizeError(error);

      expect(sanitized.name).toBe('Error');
      expect(sanitized.message).not.toContain('secret');
    });

    it('should limit stack trace', () => {
      const error = new Error('Test');
      error.stack = 'line1\nline2\nline3\nline4\nline5\nline6';
      const sanitized = sanitizeError(error);

      const lines = sanitized.stack?.split('\n') ?? [];
      expect(lines.length).toBeLessThanOrEqual(5);
    });

    it('should include error name and message', () => {
      const error = new TypeError('Type error message');
      const sanitized = sanitizeError(error);

      expect(sanitized.name).toBe('TypeError');
      expect(sanitized.message).toBe('Type error message');
    });
  });

  describe('isRecoverable', () => {
    it('should mark most errors as recoverable', () => {
      expect(isRecoverable(new Error('Network timeout'))).toBe(true);
      expect(isRecoverable(new TypeError('Type error'))).toBe(true);
    });

    it('should mark critical errors as non-recoverable', () => {
      expect(isRecoverable(new Error('Out of memory'))).toBe(false);
      expect(isRecoverable(new Error('Stack overflow'))).toBe(false);
    });

    it('should handle non-Error objects', () => {
      expect(isRecoverable('string')).toBe(true);
      expect(isRecoverable(null)).toBe(true);
    });
  });

  describe('getSuggestedActions', () => {
    it('should suggest network actions for network errors', () => {
      const actions = getSuggestedActions(new Error('Network error'));
      expect(actions.length).toBeGreaterThan(0);
      expect(actions.some((a) => a.toLowerCase().includes('internet'))).toBe(true);
    });

    it('should suggest refresh for not found errors', () => {
      const actions = getSuggestedActions(new Error('404 not found'));
      expect(actions.length).toBeGreaterThan(0);
    });

    it('should suggest login for permission errors', () => {
      const actions = getSuggestedActions(new Error('Permission denied'));
      expect(actions.length).toBeGreaterThan(0);
    });

    it('should provide default actions', () => {
      const actions = getSuggestedActions(new Error('Unknown error'));
      expect(actions.length).toBeGreaterThan(0);
      expect(actions.some((a) => a.includes('Try again'))).toBe(true);
    });
  });

  describe('getDiagnostics', () => {
    it('should return complete diagnostics', () => {
      const error = new TypeError('Cannot read properties');
      const diagnostics = getDiagnostics(error);

      expect(diagnostics).toHaveProperty('severity');
      expect(diagnostics).toHaveProperty('category');
      expect(diagnostics).toHaveProperty('message');
      expect(diagnostics).toHaveProperty('isRecoverable');
      expect(diagnostics).toHaveProperty('suggestedActions');
    });

    it('should categorize severity correctly', () => {
      const critical = getDiagnostics(new Error('Out of memory'));
      expect(critical.severity).toBe('critical');

      const high = getDiagnostics(new TypeError('Type error'));
      expect(high.severity).toBe('high');

      const medium = getDiagnostics(new Error('Network error'));
      expect(medium.severity).toBe('medium');
    });

    it('should provide suggested actions', () => {
      const diagnostics = getDiagnostics(new Error('Network error'));
      expect(diagnostics.suggestedActions.length).toBeGreaterThan(0);
    });
  });
});
