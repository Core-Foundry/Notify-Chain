/**
 * Tests for template utilities
 */

import {
  detectVariables,
  isValidVariableName,
  getNestedValue,
  renderTemplate,
  validateTemplate,
  generateSampleVariables,
  getAvailableSampleVariables,
  formatVariableName,
  areAllVariablesProvided,
} from './templateUtils';

describe('templateUtils', () => {
  describe('detectVariables', () => {
    it('should detect variables in template', () => {
      const template = 'Hello {{name}}, welcome to {{platform}}';
      const variables = detectVariables(template);

      expect(variables).toContain('name');
      expect(variables).toContain('platform');
      expect(variables).toHaveLength(2);
    });

    it('should handle multiple occurrences of same variable', () => {
      const template = 'Hi {{name}}, your name is {{name}}';
      const variables = detectVariables(template);

      expect(variables).toEqual(['name']);
    });

    it('should handle nested properties', () => {
      const template = 'User: {{user.name}}, Email: {{user.email}}';
      const variables = detectVariables(template);

      expect(variables).toContain('user.name');
      expect(variables).toContain('user.email');
    });

    it('should handle whitespace in variables', () => {
      const template = 'Name: {{ name }}, Email: {{  email  }}';
      const variables = detectVariables(template);

      expect(variables).toContain('name');
      expect(variables).toContain('email');
    });

    it('should return empty array for template without variables', () => {
      const template = 'Just plain text';
      const variables = detectVariables(template);

      expect(variables).toEqual([]);
    });

    it('should ignore invalid variable names', () => {
      const template = 'Valid: {{valid}}, Invalid: {{123invalid}}, Invalid: {{-dash}}';
      const variables = detectVariables(template);

      expect(variables).toContain('valid');
      expect(variables).not.toContain('123invalid');
      expect(variables).not.toContain('-dash');
    });
  });

  describe('isValidVariableName', () => {
    it('should accept valid variable names', () => {
      expect(isValidVariableName('name')).toBe(true);
      expect(isValidVariableName('user_id')).toBe(true);
      expect(isValidVariableName('_private')).toBe(true);
      expect(isValidVariableName('user123')).toBe(true);
    });

    it('should accept nested properties', () => {
      expect(isValidVariableName('user.name')).toBe(true);
      expect(isValidVariableName('user.profile.name')).toBe(true);
      expect(isValidVariableName('obj._private.value')).toBe(true);
    });

    it('should reject invalid names', () => {
      expect(isValidVariableName('123invalid')).toBe(false);
      expect(isValidVariableName('name-with-dash')).toBe(false);
      expect(isValidVariableName('name with space')).toBe(false);
      expect(isValidVariableName('.start')).toBe(false);
      expect(isValidVariableName('end.')).toBe(false);
    });
  });

  describe('getNestedValue', () => {
    it('should get simple property values', () => {
      const obj = { name: 'John', age: 30 };

      expect(getNestedValue(obj, 'name')).toBe('John');
      expect(getNestedValue(obj, 'age')).toBe(30);
    });

    it('should get nested property values', () => {
      const obj = {
        user: {
          profile: {
            name: 'John',
          },
        },
      };

      expect(getNestedValue(obj, 'user.profile.name')).toBe('John');
    });

    it('should return undefined for missing properties', () => {
      const obj = { name: 'John' };

      expect(getNestedValue(obj, 'missing')).toBeUndefined();
      expect(getNestedValue(obj, 'name.nested')).toBeUndefined();
    });

    it('should handle null and undefined values', () => {
      expect(getNestedValue(null, 'name')).toBeUndefined();
      expect(getNestedValue(undefined, 'name')).toBeUndefined();
    });

    it('should handle arrays in path', () => {
      const obj = {
        items: [
          { name: 'Item1' },
          { name: 'Item2' },
        ],
      };

      expect(getNestedValue(obj, 'items')).toBe(obj.items);
    });
  });

  describe('renderTemplate', () => {
    it('should render template with variables', () => {
      const result = renderTemplate('Hello {{name}}!', { name: 'John' });

      expect(result).toBe('Hello John!');
    });

    it('should render multiple variables', () => {
      const result = renderTemplate(
        '{{greeting}} {{name}}, you have {{count}} messages',
        { greeting: 'Hi', name: 'John', count: 5 }
      );

      expect(result).toBe('Hi John, you have 5 messages');
    });

    it('should use missing indicator for missing variables', () => {
      const result = renderTemplate('Name: {{name}}', {}, { missingIndicator: '[MISSING]' });

      expect(result).toContain('[MISSING]');
    });

    it('should handle custom missing indicator', () => {
      const result = renderTemplate('Name: {{name}}, Email: {{email}}', {}, { missingIndicator: '???' });

      expect(result).toBe('Name: ???, Email: ???');
    });

    it('should HTML escape when option enabled', () => {
      const result = renderTemplate(
        'Content: {{content}}',
        { content: '<script>alert("xss")</script>' },
        { htmlEscape: true }
      );

      expect(result).not.toContain('<script>');
      expect(result).toContain('&lt;');
    });

    it('should not escape when option disabled', () => {
      const result = renderTemplate(
        'Content: {{content}}',
        { content: '<b>bold</b>' },
        { htmlEscape: false }
      );

      expect(result).toContain('<b>bold</b>');
    });
  });

  describe('validateTemplate', () => {
    it('should validate template with all variables provided', () => {
      const result = validateTemplate(
        'Hello {{name}}, welcome to {{platform}}',
        { name: 'John', platform: 'Notify-Chain' }
      );

      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.missingVariables).toHaveLength(0);
    });

    it('should detect missing variables', () => {
      const result = validateTemplate(
        'Hello {{name}}, welcome to {{platform}}',
        { name: 'John' }
      );

      expect(result.isValid).toBe(false);
      expect(result.missingVariables).toContain('platform');
    });

    it('should detect unsupported variables', () => {
      const result = validateTemplate(
        'User: {{username}}, Status: {{status}}',
        { username: 'john', status: 'active' },
        ['username']
      );

      expect(result.warnings).toContain(expect.stringContaining('status'));
    });

    it('should report empty template', () => {
      const result = validateTemplate('', {});

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Template is empty');
    });

    it('should list all detected variables', () => {
      const result = validateTemplate(
        'From: {{from}}, To: {{to}}, Amount: {{amount}}',
        {}
      );

      expect(result.variables).toContain('from');
      expect(result.variables).toContain('to');
      expect(result.variables).toContain('amount');
    });
  });

  describe('generateSampleVariables', () => {
    it('should generate sample data for known variables', () => {
      const samples = generateSampleVariables(['event.eventId', 'user.name']);

      expect(samples['event.eventId']).toBeDefined();
      expect(samples['user.name']).toBeDefined();
    });

    it('should generate placeholder for unknown variables', () => {
      const samples = generateSampleVariables(['unknown.variable']);

      expect(samples['unknown.variable']).toContain('[sample_');
    });
  });

  describe('getAvailableSampleVariables', () => {
    it('should return list of available variables', () => {
      const variables = getAvailableSampleVariables();

      expect(Array.isArray(variables)).toBe(true);
      expect(variables.length).toBeGreaterThan(0);
    });

    it('should include common event variables', () => {
      const variables = getAvailableSampleVariables();

      expect(variables).toContain('event.eventId');
      expect(variables).toContain('event.eventName');
    });

    it('should include nested properties', () => {
      const variables = getAvailableSampleVariables();

      expect(variables.some((v) => v.includes('.'))).toBe(true);
    });
  });

  describe('formatVariableName', () => {
    it('should format simple variable names', () => {
      expect(formatVariableName('name')).toBe('Name');
      expect(formatVariableName('email')).toBe('Email');
    });

    it('should format underscored names', () => {
      expect(formatVariableName('user_id')).toBe('User Id');
      expect(formatVariableName('first_name')).toBe('First Name');
    });

    it('should format nested properties', () => {
      expect(formatVariableName('user.name')).toBe('User > Name');
      expect(formatVariableName('event.transaction.amount')).toBe('Event > Transaction > Amount');
    });
  });

  describe('areAllVariablesProvided', () => {
    it('should return true when all variables provided', () => {
      const result = areAllVariablesProvided(
        'Hello {{name}}, you have {{count}} messages',
        { name: 'John', count: 5 }
      );

      expect(result).toBe(true);
    });

    it('should return false when variables missing', () => {
      const result = areAllVariablesProvided(
        'Hello {{name}}, welcome to {{platform}}',
        { name: 'John' }
      );

      expect(result).toBe(false);
    });

    it('should handle empty template', () => {
      const result = areAllVariablesProvided('No variables here', {});

      expect(result).toBe(true);
    });
  });
});
