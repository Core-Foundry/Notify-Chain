/**
 * Template Validation Engine
 * 
 * Validates notification templates before saving/updating
 * Checks for:
 * - Syntax errors (unclosed brackets)
 * - Invalid variable names
 * - Security issues (script injection attempts)
 * - Missing required fields
 */

import { TemplateValidationResult, TemplateChannelType } from '../types/notification-template';
import { TemplateRenderer } from './template-renderer';
import logger from '../utils/logger';

export class TemplateValidator {
  private static readonly MAX_TEMPLATE_LENGTH = 10000;
  private static readonly MAX_VARIABLE_NAME_LENGTH = 100;
  private static readonly FORBIDDEN_PATTERNS = [
    /<script[^>]*>.*?<\/script>/gi,    // Script tags
    /javascript:/gi,                    // Javascript protocol
    /on\w+\s*=\s*["'].*?["']/gi,       // Event handlers
    /<iframe[^>]*>.*?<\/iframe>/gi,    // Iframe tags
    /eval\(/gi,                         // Eval calls
    /expression\(/gi,                   // CSS expressions
  ];

  /**
   * Validate template syntax and security
   */
  static validate(
    bodyTemplate: string,
    subjectTemplate?: string,
    channelType?: TemplateChannelType
  ): TemplateValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Validate body template (required)
    if (!bodyTemplate || bodyTemplate.trim() === '') {
      errors.push('Body template is required');
      return { isValid: false, errors, warnings };
    }

    // Validate template length
    if (bodyTemplate.length > this.MAX_TEMPLATE_LENGTH) {
      errors.push(`Body template exceeds maximum length of ${this.MAX_TEMPLATE_LENGTH} characters`);
    }

    // Validate subject template if provided
    if (subjectTemplate) {
      if (subjectTemplate.length > 500) {
        errors.push('Subject template exceeds maximum length of 500 characters');
      }

      const subjectResult = this.validateTemplateSyntax(subjectTemplate);
      errors.push(...subjectResult.errors);
      warnings.push(...subjectResult.warnings);
    }

    // Validate body template syntax
    const bodyResult = this.validateTemplateSyntax(bodyTemplate);
    errors.push(...bodyResult.errors);
    warnings.push(...bodyResult.warnings);

    // Security checks
    const securityResult = this.checkSecurity(bodyTemplate);
    errors.push(...securityResult.errors);
    warnings.push(...securityResult.warnings);

    if (subjectTemplate) {
      const subjectSecurityResult = this.checkSecurity(subjectTemplate);
      errors.push(...subjectSecurityResult.errors);
      warnings.push(...subjectSecurityResult.warnings);
    }

    // Channel-specific validation
    if (channelType) {
      const channelResult = this.validateChannelRequirements(
        bodyTemplate,
        subjectTemplate,
        channelType
      );
      errors.push(...channelResult.errors);
      warnings.push(...channelResult.warnings);
    }

    // Extract detected variables
    const detectedVariables = TemplateRenderer.extractVariables(bodyTemplate);
    if (subjectTemplate) {
      detectedVariables.push(...TemplateRenderer.extractVariables(subjectTemplate));
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
      detectedVariables: [...new Set(detectedVariables)], // Remove duplicates
    };
  }

  /**
   * Validate template syntax (bracket matching, variable names)
   */
  private static validateTemplateSyntax(template: string): {
    errors: string[];
    warnings: string[];
  } {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Check for unclosed brackets
    const openBrackets = (template.match(/\{\{/g) || []).length;
    const closeBrackets = (template.match(/\}\}/g) || []).length;

    if (openBrackets !== closeBrackets) {
      errors.push(
        `Mismatched brackets: ${openBrackets} opening '{{' but ${closeBrackets} closing '}}'`
      );
    }

    // Check for malformed variable syntax
    const malformedPattern = /\{[^{]|[^}]\}/g;
    if (malformedPattern.test(template)) {
      warnings.push('Template contains single brackets that may be intended as variables');
    }

    // Extract and validate variable names
    const variablePattern = /\{\{([^}]+)\}\}/g;
    let match;

    while ((match = variablePattern.exec(template)) !== null) {
      const variableName = match[1].trim();

      // Check variable name length
      if (variableName.length > this.MAX_VARIABLE_NAME_LENGTH) {
        errors.push(
          `Variable name too long: '${variableName.substring(0, 50)}...' (max ${this.MAX_VARIABLE_NAME_LENGTH} characters)`
        );
      }

      // Check for empty variable
      if (variableName === '') {
        errors.push('Empty variable placeholder found: {{}}');
      }

      // Check for invalid characters in variable name
      if (!/^[a-zA-Z0-9_\.]+$/.test(variableName)) {
        errors.push(
          `Invalid variable name '${variableName}'. Only alphanumeric, underscore, and dot allowed.`
        );
      }

      // Check for spaces in variable name
      if (/\s/.test(variableName)) {
        errors.push(`Variable name contains spaces: '${variableName}'`);
      }
    }

    return { errors, warnings };
  }

  /**
   * Check for security vulnerabilities
   */
  private static checkSecurity(template: string): {
    errors: string[];
    warnings: string[];
  } {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Check for forbidden patterns
    for (const pattern of this.FORBIDDEN_PATTERNS) {
      if (pattern.test(template)) {
        errors.push(
          `Template contains potentially dangerous content: ${pattern.source}`
        );
      }
    }

    // Check for suspicious variable names that might be injection attempts
    const variables = TemplateRenderer.extractVariables(template);
    for (const variable of variables) {
      if (variable.toLowerCase().includes('script')) {
        warnings.push(
          `Variable name '${variable}' contains 'script' - ensure this is intentional`
        );
      }

      if (variable.toLowerCase().includes('__proto__')) {
        errors.push(
          `Variable name '${variable}' attempts prototype pollution - not allowed`
        );
      }
    }

    return { errors, warnings };
  }

  /**
   * Validate channel-specific requirements
   */
  private static validateChannelRequirements(
    bodyTemplate: string,
    subjectTemplate: string | undefined,
    channelType: TemplateChannelType
  ): { errors: string[]; warnings: string[] } {
    const errors: string[] = [];
    const warnings: string[] = [];

    switch (channelType) {
      case TemplateChannelType.EMAIL:
        if (!subjectTemplate) {
          warnings.push('Email templates typically require a subject line');
        }
        if (bodyTemplate.length > 5000) {
          warnings.push('Email body is quite long, consider shortening for better deliverability');
        }
        break;

      case TemplateChannelType.SMS:
        if (bodyTemplate.length > 160) {
          warnings.push(
            `SMS body is ${bodyTemplate.length} characters. Messages over 160 characters may be split.`
          );
        }
        if (subjectTemplate) {
          warnings.push('SMS messages do not typically use subject lines');
        }
        break;

      case TemplateChannelType.DISCORD:
        if (bodyTemplate.length > 2000) {
          errors.push('Discord messages are limited to 2000 characters');
        }
        break;

      case TemplateChannelType.PUSH:
        if (bodyTemplate.length > 200) {
          warnings.push('Push notifications are typically shorter for better visibility');
        }
        if (subjectTemplate && subjectTemplate.length > 50) {
          warnings.push('Push notification titles should be concise (under 50 characters)');
        }
        break;

      case TemplateChannelType.WEBHOOK:
        // Webhooks are flexible, minimal validation
        break;
    }

    return { errors, warnings };
  }

  /**
   * Quick syntax check (lightweight validation)
   */
  static isValidSyntax(template: string): boolean {
    try {
      const openBrackets = (template.match(/\{\{/g) || []).length;
      const closeBrackets = (template.match(/\}\}/g) || []).length;
      return openBrackets === closeBrackets;
    } catch (error) {
      logger.error('Error checking template syntax', { error });
      return false;
    }
  }

  /**
   * Validate unique key format
   */
  static validateUniqueKey(uniqueKey: string): { valid: boolean; error?: string } {
    if (!uniqueKey || uniqueKey.trim() === '') {
      return { valid: false, error: 'Unique key is required' };
    }

    if (uniqueKey.length > 255) {
      return { valid: false, error: 'Unique key exceeds maximum length of 255 characters' };
    }

    // Only allow lowercase alphanumeric, underscore, and hyphen
    if (!/^[a-z0-9_-]+$/.test(uniqueKey)) {
      return {
        valid: false,
        error: 'Unique key must contain only lowercase letters, numbers, underscores, and hyphens',
      };
    }

    return { valid: true };
  }
}
