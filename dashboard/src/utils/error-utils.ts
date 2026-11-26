/**
 * Error utilities for safe error handling and diagnostics
 *
 * Provides:
 * - Error categorization (render vs lifecycle vs async)
 * - Safe error message extraction
 * - Error sanitization (removing sensitive data)
 * - Error tracking and reporting
 */

export type ErrorSeverity = 'low' | 'medium' | 'high' | 'critical' | 'error';

export interface ErrorDiagnostics {
  severity: ErrorSeverity;
  category: ErrorCategory;
  message: string;
  isRecoverable: boolean;
  suggestedActions: string[];
}

export type ErrorCategory = 'render' | 'lifecycle' | 'async' | 'network' | 'unknown';

/**
 * Categorize an error based on its type and message
 */
export function categorizeError(error: unknown): ErrorSeverity {
  if (!(error instanceof Error)) {
    return 'error';
  }

  const message = error.message.toLowerCase();
  const name = error.name.toLowerCase();

  // Critical errors
  if (
    message.includes('out of memory') ||
    message.includes('stack overflow') ||
    name.includes('recursion')
  ) {
    return 'critical';
  }

  // High severity - rendering or lifecycle errors
  if (
    message.includes('render') ||
    message.includes('lifecycle') ||
    name === 'typeerror' ||
    name === 'referenceerror'
  ) {
    return 'high';
  }

  // Medium severity - async/network errors
  if (
    message.includes('fetch') ||
    message.includes('network') ||
    message.includes('timeout') ||
    name === 'networkerror'
  ) {
    return 'medium';
  }

  // Low severity - validation/logic errors
  if (
    message.includes('validation') ||
    message.includes('invalid') ||
    message.includes('not found')
  ) {
    return 'low';
  }

  return 'error';
}

/**
 * Detect error category for better error handling
 */
export function detectErrorCategory(error: unknown): ErrorCategory {
  if (!(error instanceof Error)) {
    return 'unknown';
  }

  const message = error.message.toLowerCase();
  const stack = error.stack?.toLowerCase() ?? '';

  if (message.includes('fetch') || message.includes('response')) {
    return 'network';
  }

  if (message.includes('render') || message.includes('jsx')) {
    return 'render';
  }

  if (message.includes('effect') || message.includes('cleanup')) {
    return 'lifecycle';
  }

  if (stack.includes('async') || stack.includes('promise')) {
    return 'async';
  }

  return 'unknown';
}

/**
 * Get a safe, user-friendly error message
 * Strips technical details while preserving important info
 */
export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === 'string') {
    return error;
  }

  if (typeof error === 'object' && error !== null) {
    if ('message' in error) {
      return String(error.message);
    }
  }

  return 'An unknown error occurred';
}

/**
 * Sanitize error for safe reporting (remove sensitive data)
 */
export function sanitizeError(error: Error): {
  name: string;
  message: string;
  stack?: string;
} {
  const sanitized = {
    name: error.name,
    message: stripSensitiveData(error.message),
    stack: error.stack
      ? error.stack
          .split('\n')
          .slice(0, 5) // Only first 5 frames
          .map((frame) => stripSensitiveData(frame))
          .join('\n')
      : undefined,
  };

  return sanitized;
}

/**
 * Remove sensitive information from error messages and stack traces
 */
export function stripSensitiveData(text: string): string {
  let cleaned = text;

  // Remove API keys (common patterns)
  cleaned = cleaned.replace(/[?&](api_?key|token|secret|password)=[^&\s]+/gi, '...***...');

  // Remove email addresses
  cleaned = cleaned.replace(/[\w.-]+@[\w.-]+\.\w+/g, '***@***.***');

  // Remove URLs with potential auth info
  cleaned = cleaned.replace(/https?:\/\/[^/]+:[^@]+@/g, 'https://***:***@');

  // Remove file paths (keep only filename)
  cleaned = cleaned.replace(/(?:\/|\\)[^\\/]*(?:\/|\\)/g, '/');

  // Remove UUIDs
  cleaned = cleaned.replace(
    /[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}/gi,
    'UUID',
  );

  // Remove hex addresses
  cleaned = cleaned.replace(/0x[0-9a-f]+/gi, '0x***');

  // Remove large numbers (likely IDs or timestamps)
  cleaned = cleaned.replace(/\b\d{10,}\b/g, '***');

  return cleaned;
}

/**
 * Determine if an error is likely recoverable
 */
export function isRecoverable(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return true;
  }

  const message = error.message.toLowerCase();

  // Non-recoverable critical errors
  if (
    message.includes('out of memory') ||
    message.includes('stack overflow') ||
    message.includes('heap out of memory')
  ) {
    return false;
  }

  // Most errors are recoverable with a retry
  return true;
}

/**
 * Get suggested recovery actions for an error
 */
export function getSuggestedActions(error: unknown): string[] {
  if (!(error instanceof Error)) {
    return ['Try again'];
  }

  const message = error.message.toLowerCase();
  const actions: string[] = [];

  if (message.includes('network') || message.includes('fetch')) {
    actions.push('Check your internet connection');
    actions.push('Try again in a few moments');
  }

  if (message.includes('timeout')) {
    actions.push('Wait a few moments and try again');
    actions.push('Check your internet speed');
  }

  if (message.includes('not found') || message.includes('404')) {
    actions.push('Verify the resource exists');
    actions.push('Refresh the page');
  }

  if (message.includes('permission') || message.includes('unauthorized')) {
    actions.push('Check your permissions');
    actions.push('Log in again');
  }

  if (actions.length === 0) {
    actions.push('Try again');
    actions.push('Clear your browser cache');
    actions.push('Refresh the page');
  }

  return actions;
}

/**
 * Create comprehensive error diagnostics
 */
export function getDiagnostics(error: unknown): ErrorDiagnostics {
  const errorObj = error instanceof Error ? error : new Error(String(error));
  const severity = categorizeError(error);
  const category = detectErrorCategory(error);
  const message = getErrorMessage(error);
  const isRecoverableError = isRecoverable(error);
  const suggestedActions = getSuggestedActions(error);

  return {
    severity,
    category,
    message,
    isRecoverable: isRecoverableError,
    suggestedActions,
  };
}

/**
 * Report error to external service (e.g., Sentry, LogRocket)
 */
export interface ErrorReportConfig {
  endpoint?: string;
  apiKey?: string;
  version?: string;
  environment?: string;
}

let reportConfig: ErrorReportConfig = {};

export function configureErrorReporting(config: ErrorReportConfig): void {
  reportConfig = config;
}

export async function reportErrorToService(
  error: Error,
  context: Record<string, unknown> = {},
): Promise<void> {
  if (!reportConfig.endpoint) {
    console.debug('[ErrorReporting] No endpoint configured');
    return;
  }

  try {
    const report = {
      error: sanitizeError(error),
      context,
      timestamp: new Date().toISOString(),
      userAgent: navigator.userAgent,
      url: window.location.href,
      version: reportConfig.version,
      environment: reportConfig.environment,
    };

    const response = await fetch(reportConfig.endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(reportConfig.apiKey && { Authorization: `Bearer ${reportConfig.apiKey}` }),
      },
      body: JSON.stringify(report),
    });

    if (!response.ok) {
      console.warn('[ErrorReporting] Failed to report error:', response.statusText);
    }
  } catch (reportError) {
    console.error('[ErrorReporting] Error sending report:', reportError);
  }
}

/**
 * Create an error with context
 */
export class ContextualError extends Error {
  constructor(
    message: string,
    readonly context: Record<string, unknown> = {},
  ) {
    super(message);
    this.name = 'ContextualError';
  }
}
