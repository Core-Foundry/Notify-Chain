/**
 * Template utilities for preview and rendering
 * 
 * Handles:
 * - Variable detection in template strings
 * - Template rendering with variable substitution
 * - Variable validation
 * - Sample data generation
 */

/**
 * Regular expression to match {{variable}} patterns
 */
const VARIABLE_PATTERN = /\{\{([^}]+)\}\}/g;
const VARIABLE_EXTRACTOR = /\{\{([^}]+)\}\}/;

/**
 * Detect all variables in a template string
 * Returns unique variable names
 */
export function detectVariables(template: string): string[] {
  const matches = template.matchAll(VARIABLE_PATTERN);
  const variables = new Set<string>();

  for (const match of matches) {
    const variableName = match[1].trim();
    if (isValidVariableName(variableName)) {
      variables.add(variableName);
    }
  }

  return Array.from(variables);
}

/**
 * Check if a string is a valid variable name
 * Supports alphanumeric, underscore, and nested paths (obj.property)
 */
export function isValidVariableName(name: string): boolean {
  return /^[a-zA-Z_][a-zA-Z0-9_]*(\.[a-zA-Z_][a-zA-Z0-9_]*)*$/.test(name);
}

/**
 * Get nested value from object using dot notation
 * e.g., getNestedValue({user: {name: 'John'}}, 'user.name') => 'John'
 */
export function getNestedValue(obj: any, path: string): any {
  if (!obj || typeof obj !== 'object') {
    return undefined;
  }

  const parts = path.split('.');
  let current = obj;

  for (const part of parts) {
    if (current && typeof current === 'object' && part in current) {
      current = current[part];
    } else {
      return undefined;
    }
  }

  return current;
}

/**
 * Render a template with variable substitution
 */
export interface RenderOptions {
  /** String to use for missing variables */
  missingIndicator?: string;
  /** Whether to HTML-escape values */
  htmlEscape?: boolean;
}

export function renderTemplate(
  template: string,
  variables: Record<string, any> = {},
  options: RenderOptions = {}
): string {
  const { missingIndicator = '[unknown]', htmlEscape = false } = options;

  return template.replace(VARIABLE_PATTERN, (match, variablePath) => {
    const trimmedPath = variablePath.trim();

    if (!isValidVariableName(trimmedPath)) {
      return match; // Return unmodified if invalid
    }

    const value = getNestedValue(variables, trimmedPath);

    if (value === undefined || value === null) {
      return missingIndicator;
    }

    const stringValue = String(value);
    return htmlEscape ? escapeHtml(stringValue) : stringValue;
  });
}

/**
 * Escape HTML special characters
 */
function escapeHtml(text: string): string {
  const map: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;',
  };

  return text.replace(/[&<>"']/g, (char) => map[char] || char);
}

/**
 * Validate variables in a template
 */
export interface ValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  variables: string[];
  missingVariables: string[];
}

export function validateTemplate(
  template: string,
  providedVariables: Record<string, any> = {},
  supportedVariables: string[] = []
): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const detectedVariables = detectVariables(template);
  const missingVariables: string[] = [];

  // Check for empty template
  if (!template || template.trim().length === 0) {
    errors.push('Template is empty');
  }

  // Check for missing variables
  for (const variable of detectedVariables) {
    if (!(variable in providedVariables)) {
      missingVariables.push(variable);
    }
  }

  // Check for unsupported variables
  if (supportedVariables.length > 0) {
    for (const variable of detectedVariables) {
      if (!supportedVariables.includes(variable)) {
        warnings.push(`Variable "${variable}" is not in the supported list`);
      }
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
    variables: detectedVariables,
    missingVariables,
  };
}

/**
 * Sample data for different notification types
 */
export const SAMPLE_VARIABLES = {
  event: {
    eventId: 'evt_12345',
    eventName: 'Transfer',
    timestamp: '2024-01-15T10:30:00Z',
    contractAddress: 'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAB6A',
    type: 'TransferEvent',
  },
  notification: {
    notificationId: 'notif_67890',
    createdAt: '2024-01-15T10:30:00Z',
    status: 'PENDING',
    retryCount: 0,
  },
  user: {
    userId: 'user_123',
    email: 'user@example.com',
    name: 'John Doe',
  },
  transaction: {
    txHash: 'abc123def456',
    amount: '1000.00',
    from: 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAB6A',
    to: 'GBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB7A',
  },
  error: {
    message: 'Connection timeout',
    code: 'TIMEOUT',
    retryable: true,
  },
};

/**
 * Generate sample variables for template testing
 */
export function generateSampleVariables(requestedVariables: string[]): Record<string, any> {
  const samples: Record<string, any> = {};

  for (const variable of requestedVariables) {
    // Check if variable exists in SAMPLE_VARIABLES
    const keys = variable.split('.');
    let value: any = SAMPLE_VARIABLES;

    for (const key of keys) {
      if (value && typeof value === 'object' && key in value) {
        value = value[key];
      } else {
        value = `[sample_${variable}]`;
        break;
      }
    }

    samples[variable] = value;
  }

  return samples;
}

/**
 * Get all available sample variable names
 */
export function getAvailableSampleVariables(): string[] {
  const variables: string[] = [];

  function traverse(obj: any, prefix: string = '') {
    for (const key in obj) {
      if (Object.prototype.hasOwnProperty.call(obj, key)) {
        const fullKey = prefix ? `${prefix}.${key}` : key;
        const value = obj[key];

        if (value && typeof value === 'object' && !Array.isArray(value)) {
          traverse(value, fullKey);
        } else {
          variables.push(fullKey);
        }
      }
    }
  }

  traverse(SAMPLE_VARIABLES);
  return variables;
}

/**
 * Format variable name for display
 */
export function formatVariableName(variable: string): string {
  return variable
    .split('.')
    .map((part) => part.replace(/_/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase()))
    .join(' > ');
}

/**
 * Check if all template variables have values
 */
export function areAllVariablesProvided(
  template: string,
  variables: Record<string, any>
): boolean {
  const detectedVariables = detectVariables(template);
  return detectedVariables.every((variable) => variable in variables);
}
