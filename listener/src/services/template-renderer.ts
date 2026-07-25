/**
 * Template Rendering Engine
 * 
 * Renders notification templates with variable interpolation
 * using Mustache-like syntax: {{variable_name}}
 * 
 * Features:
 * - Safe variable interpolation
 * - HTML/Script injection protection
 * - Missing variable handling with fallbacks
 * - Nested property access (e.g., {{user.name}})
 */

import logger from '../utils/logger';
import { RenderContext, RenderedTemplate } from '../types/notification-template';

/**
 * Template rendering options
 */
export interface RenderOptions {
  /** HTML escape rendered values (default: true) */
  htmlEscape?: boolean;
  /** Throw error if variable is missing (default: false) */
  strictMode?: boolean;
  /** Prefix for missing variables (default: '') */
  missingPrefix?: string;
  /** Suffix for missing variables (default: '') */
  missingSuffix?: string;
}

/**
 * Template Renderer
 */
export class TemplateRenderer {
  private static readonly VARIABLE_PATTERN = /\{\{([^}]+)\}\}/g;
  private static readonly STRICT_VARIABLE_PATTERN = /^[a-zA-Z0-9_\.]+$/;

  /**
   * Render a template with context data
   */
  static render(
    template: string,
    context: RenderContext,
    options: RenderOptions = {}
  ): string {
    const {
      htmlEscape = true,
      strictMode = false,
      missingPrefix = '',
      missingSuffix = '',
    } = options;

    return template.replace(this.VARIABLE_PATTERN, (match, variablePath) => {
      const trimmedPath = variablePath.trim();

      // Validate variable name (prevent injection)
      if (!this.STRICT_VARIABLE_PATTERN.test(trimmedPath)) {
        logger.warn('Invalid variable name in template', { variable: trimmedPath });
        return strictMode ? match : '';
      }

      // Get value from context (supports nested properties)
      const value = this.getNestedValue(context, trimmedPath);

      // Handle missing value
      if (value === undefined || value === null) {
        if (strictMode) {
          throw new Error(`Missing required variable: ${trimmedPath}`);
        }
        logger.debug('Missing template variable, using fallback', { variable: trimmedPath });
        return `${missingPrefix}${missingSuffix}`;
      }

      // Convert to string
      const stringValue = String(value);

      // HTML escape if needed
      return htmlEscape ? this.escapeHtml(stringValue) : stringValue;
    });
  }

  /**
   * Render template with subject and body
   */
  static renderTemplate(
    subjectTemplate: string | undefined,
    bodyTemplate: string,
    context: RenderContext,
    defaultValues: Record<string, any> = {},
    options: RenderOptions = {}
  ): RenderedTemplate {
    // Merge context with default values (context takes precedence)
    const mergedContext = { ...defaultValues, ...context };

    // Render subject if provided
    const subject = subjectTemplate
      ? this.render(subjectTemplate, mergedContext, options)
      : undefined;

    // Render body
    const body = this.render(bodyTemplate, mergedContext, options);

    return {
      subject,
      body,
      variables: mergedContext,
    };
  }

  /**
   * Extract variable names from template
   */
  static extractVariables(template: string): string[] {
    const variables: string[] = [];
    const matches = template.matchAll(this.VARIABLE_PATTERN);

    for (const match of matches) {
      const variableName = match[1].trim();
      if (!variables.includes(variableName)) {
        variables.push(variableName);
      }
    }

    return variables;
  }

  /**
   * Get nested property value from object
   * Example: getNestedValue({user: {name: 'John'}}, 'user.name') => 'John'
   */
  private static getNestedValue(obj: any, path: string): any {
    const keys = path.split('.');
    let value = obj;

    for (const key of keys) {
      if (value === null || value === undefined) {
        return undefined;
      }
      value = value[key];
    }

    return value;
  }

  /**
   * HTML escape special characters to prevent XSS
   */
  private static escapeHtml(text: string): string {
    const htmlEscapeMap: Record<string, string> = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
      '/': '&#x2F;',
    };

    return text.replace(/[&<>"'\/]/g, (char) => htmlEscapeMap[char] || char);
  }

  /**
   * Validate that all required variables are present in context
   */
  static validateContext(
    requiredVariables: string[],
    context: RenderContext,
    defaultValues: Record<string, any> = {}
  ): { valid: boolean; missing: string[] } {
    const mergedContext = { ...defaultValues, ...context };
    const missing: string[] = [];

    for (const variable of requiredVariables) {
      const value = this.getNestedValue(mergedContext, variable);
      if (value === undefined || value === null) {
        missing.push(variable);
      }
    }

    return {
      valid: missing.length === 0,
      missing,
    };
  }
}
