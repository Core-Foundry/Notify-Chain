import { validateTemplateVariables } from './template-variable-validator';

describe('template variable validation (#1164)', () => {
  it('detects unsupported variables when strict validation is enabled', () => {
    const result = validateTemplateVariables({
      body: 'Hello {{name}}, your {{totally_unknown_field}} is ready',
      strictUnsupportedVariables: true,
    });

    expect(result.isValid).toBe(false);
    expect(result.detectedVariables).toEqual(['name', 'totally_unknown_field']);
    expect(result.unsupportedVariables).toEqual(['totally_unknown_field']);
    expect(result.errors.join(' ')).toContain('Unsupported template variable(s)');
  });

  it('reports unsupported variables as warnings in permissive mode', () => {
    const result = validateTemplateVariables({
      body: 'Hello {{totally_unknown_field}}',
    });

    expect(result.isValid).toBe(true);
    expect(result.unsupportedVariables).toEqual(['totally_unknown_field']);
    expect(result.warnings?.join(' ')).toContain('Unsupported template variable(s)');
  });

  it('rejects declared required variables that are missing from the template', () => {
    const result = validateTemplateVariables({
      body: 'Hello {{name}}',
      requiredVariables: ['name', 'order_id'],
    });

    expect(result.isValid).toBe(false);
    expect(result.missingRequiredVariables).toEqual(['order_id']);
    expect(result.errors.join(' ')).toContain('Missing required template variable(s)');
  });

  it('accepts a required variable that is referenced in the subject', () => {
    const result = validateTemplateVariables({
      body: 'Your order is ready',
      subject: 'Order {{order_id}}',
      requiredVariables: ['order_id'],
    });

    expect(result.isValid).toBe(true);
    expect(result.missingRequiredVariables).toEqual([]);
  });

  it('accepts explicitly supported custom variables and nested paths', () => {
    const result = validateTemplateVariables({
      body: 'Hi {{custom_label}} / {{user.display_name}}',
      supportedVariables: ['custom_label'],
      strictUnsupportedVariables: true,
    });

    expect(result.isValid).toBe(true);
    expect(result.unsupportedVariables).toEqual([]);
  });

  it('treats default value keys as supported variables', () => {
    const result = validateTemplateVariables({
      body: 'Hi {{fallback_name}}',
      defaultValues: { fallback_name: 'friend' },
      strictUnsupportedVariables: true,
    });

    expect(result.isValid).toBe(true);
  });

  it('keeps previously valid templates usable', () => {
    const result = validateTemplateVariables({ body: 'Hello {{name}}, welcome aboard!' });

    expect(result.isValid).toBe(true);
    expect(result.errors).toEqual([]);
  });
});
