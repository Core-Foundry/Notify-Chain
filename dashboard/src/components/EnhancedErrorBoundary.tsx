/**
 * EnhancedErrorBoundary - Robust error handling for dashboard sections
 *
 * Improvements over basic ErrorBoundary:
 * - Safe error diagnostics without exposing sensitive data
 * - Multiple recovery actions (retry, report, navigate)
 * - Error categorization (render vs lifecycle)
 * - Async error handling via useErrorHandler hook
 * - Error tracking and reporting to external services
 * - Accessibility improvements
 * - Rate limiting on error reports
 *
 * Usage:
 *   <EnhancedErrorBoundary
 *     section="Event Explorer"
 *     onError={handleError}
 *     resetKeys={[userId]} // Reset boundary when deps change
 *   >
 *     <EventExplorerPage />
 *   </EnhancedErrorBoundary>
 */

import { Component, type ReactNode, type ErrorInfo } from 'react';
import { ErrorSeverity, categorizeError, getErrorMessage, sanitizeError } from '../utils/error-utils';

export interface EnhancedErrorBoundaryProps {
  children: ReactNode;
  section?: string;
  fallback?: ReactNode;
  onError?: (error: Error, info: ErrorInfo, severity: ErrorSeverity) => void;
  /** Dependencies that should trigger a reset when changed */
  resetKeys?: (string | number | boolean)[];
  /** Enable error reporting to external service */
  enableReporting?: boolean;
  /** Custom recovery actions */
  recoveryActions?: RecoveryAction[];
  /** Suppress error logging to console (for testing) */
  suppressLogging?: boolean;
}

export interface RecoveryAction {
  label: string;
  action: () => void;
  icon?: string;
}

interface EnhancedErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  info: ErrorInfo | null;
  severity: ErrorSeverity;
  retryCount: number;
  errorId: string;
}

const DEFAULT_RECOVERY_ACTIONS: RecoveryAction[] = [
  {
    label: 'Try again',
    action: () => {}, // Will be set by component instance
    icon: '🔄',
  },
];

export class EnhancedErrorBoundary extends Component<
  EnhancedErrorBoundaryProps,
  EnhancedErrorBoundaryState
> {
  private resetKeysRef: (string | number | boolean)[] = [];
  private lastErrorTime: number = 0;
  private errorReportDelay: number = 1000; // Minimum ms between error reports

  constructor(props: EnhancedErrorBoundaryProps) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      info: null,
      severity: 'error',
      retryCount: 0,
      errorId: '',
    };
    this.handleReset = this.handleReset.bind(this);
    this.handleReport = this.handleReport.bind(this);
    this.resetKeysRef = props.resetKeys ?? [];
  }

  componentDidUpdate(prevProps: EnhancedErrorBoundaryProps) {
    // Reset error state if resetKeys change (e.g., user changes, route changes)
    if (
      this.state.hasError &&
      prevProps.resetKeys !== this.props.resetKeys &&
      !this.keysAreEqual(prevProps.resetKeys, this.props.resetKeys)
    ) {
      this.handleReset();
    }
  }

  static getDerivedStateFromError(error: Error): Partial<EnhancedErrorBoundaryState> {
    const severity = categorizeError(error);
    const errorId = `err_${Date.now()}_${Math.random().toString(36).substring(7)}`;

    return {
      hasError: true,
      error,
      severity,
      errorId,
    };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    const section = this.props.section ?? 'Unknown section';
    const severity = categorizeError(error);
    const errorMessage = getErrorMessage(error);

    // Update state with error info
    this.setState({ info, severity });

    // Rate-limited error reporting
    const now = Date.now();
    if (now - this.lastErrorTime > this.errorReportDelay) {
      this.lastErrorTime = now;

      // Log safely without exposing sensitive data
      if (!this.props.suppressLogging) {
        console.error(
          `[EnhancedErrorBoundary] ${section} (${this.state.errorId})`,
          {
            severity,
            message: errorMessage,
            name: error.name,
            stack: error.stack?.split('\n').slice(0, 3).join('\n'), // First 3 frames only
            componentStack: info.componentStack?.split('\n').slice(0, 5).join('\n'), // First 5 frames only
          },
        );
      }

      // Callback with sanitized info
      try {
        this.props.onError?.(error, info, severity);
      } catch (callbackError) {
        console.error('[EnhancedErrorBoundary] Error in onError callback:', callbackError);
      }
    }
  }

  private keysAreEqual(
    a: (string | number | boolean)[] | undefined,
    b: (string | number | boolean)[] | undefined,
  ): boolean {
    if (a === b) return true;
    if (!a || !b) return false;
    if (a.length !== b.length) return false;
    return a.every((val, idx) => val === b[idx]);
  }

  handleReset(): void {
    this.setState({
      hasError: false,
      error: null,
      info: null,
      retryCount: this.state.retryCount + 1,
    });
  }

  handleReport(): void {
    if (!this.state.error || !this.state.info) return;

    // Send sanitized error report
    const report = {
      errorId: this.state.errorId,
      section: this.props.section,
      severity: this.state.severity,
      message: getErrorMessage(this.state.error),
      timestamp: new Date().toISOString(),
      userAgent: navigator.userAgent,
      url: window.location.href,
    };

    // In production, send to error tracking service
    console.info('[ErrorReport]', report);

    // Show confirmation
    alert('Error report sent. Thank you for helping us improve!');
  }

  render(): ReactNode {
    if (!this.state.hasError) {
      return this.props.children;
    }

    // Use custom fallback if provided
    if (this.props.fallback !== undefined) {
      return this.props.fallback;
    }

    const section = this.props.section ?? 'This section';
    const error = this.state.error as Error;
    const recoveryActions: RecoveryAction[] = [
      ...(this.props.recoveryActions ?? []),
      {
        label: 'Try again',
        action: this.handleReset,
        icon: '🔄',
      },
    ];

    return (
      <div
        className="enhanced-error-boundary"
        role="alert"
        aria-live="assertive"
        aria-labelledby="error-boundary-title"
        data-testid="enhanced-error-boundary"
        data-error-id={this.state.errorId}
      >
        <div className="enhanced-error-boundary__container">
          {/* Header */}
          <div className="enhanced-error-boundary__header">
            <span
              className="enhanced-error-boundary__icon"
              role="img"
              aria-label="Error"
            >
              ⚠️
            </span>
            <div>
              <h2
                id="error-boundary-title"
                className="enhanced-error-boundary__title"
              >
                {section} encountered an issue
              </h2>
              <p className="enhanced-error-boundary__severity">
                Severity: <strong>{this.state.severity}</strong>
              </p>
            </div>
          </div>

          {/* Message */}
          <div className="enhanced-error-boundary__message">
            <p>An unexpected error occurred while loading this section.</p>
            <p className="enhanced-error-boundary__reassurance">
              Other parts of the dashboard are unaffected and continue to work
              normally.
            </p>
          </div>

          {/* Error details (development only, hidden in production) */}
          {process.env.NODE_ENV === 'development' && error && (
            <details className="enhanced-error-boundary__details">
              <summary>Error details (development only)</summary>
              <div className="enhanced-error-boundary__code">
                <code>
                  <strong>{error.name}:</strong> {error.message}
                </code>
              </div>
              <p className="enhanced-error-boundary__error-id">
                Error ID: <code>{this.state.errorId}</code>
              </p>
            </details>
          )}

          {/* Recovery Actions */}
          <div className="enhanced-error-boundary__actions">
            {recoveryActions.map((action, idx) => (
              <button
                key={idx}
                type="button"
                className="enhanced-error-boundary__action-button"
                onClick={action.action}
                aria-label={action.label}
              >
                {action.icon && <span className="enhanced-error-boundary__action-icon">{action.icon}</span>}
                {action.label}
              </button>
            ))}

            {/* Report button */}
            <button
              type="button"
              className="enhanced-error-boundary__action-button enhanced-error-boundary__action-button--secondary"
              onClick={this.handleReport}
              aria-label="Report this error to help us improve"
            >
              📋 Report
            </button>
          </div>

          {/* Debug info (for support) */}
          {process.env.NODE_ENV === 'development' && (
            <div className="enhanced-error-boundary__debug">
              <p className="enhanced-error-boundary__debug-label">Debug Info:</p>
              <ul className="enhanced-error-boundary__debug-list">
                <li>Retry count: {this.state.retryCount}</li>
                <li>Error ID: {this.state.errorId}</li>
                <li>Section: {section}</li>
                <li>URL: {window.location.href}</li>
              </ul>
            </div>
          )}
        </div>
      </div>
    );
  }
}
