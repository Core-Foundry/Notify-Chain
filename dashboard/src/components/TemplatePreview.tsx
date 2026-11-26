/**
 * Template Preview Component
 * 
 * Live preview of notification templates with variable rendering.
 * Supports:
 * - Real-time updates as template content changes
 * - Variable interpolation with {{variable}} syntax
 * - Missing variable detection and highlighting
 * - Multiple notification channel formats
 * - Unsupported variable warnings
 * - No actual notification sending
 */

import React, { useMemo, useCallback } from 'react';
import { TemplateChannelType } from '../types/notificationTemplate';
import { renderTemplate, detectVariables, validateVariables } from '../utils/templateUtils';
import './template-preview.css';

export interface TemplatePreviewProps {
  /** Template body content with {{variable}} syntax */
  body: string;
  /** Optional template subject (for email) */
  subject?: string;
  /** Notification channel type */
  channelType: TemplateChannelType;
  /** Sample variables for preview */
  variables?: Record<string, any>;
  /** Available/supported variable names */
  supportedVariables?: string[];
  /** Callback when variables are detected */
  onVariablesDetected?: (variables: string[]) => void;
  /** Callback when unsupported variables are found */
  onUnsupportedVariables?: (variables: string[]) => void;
  /** Custom fallback value for missing variables */
  missingVariableIndicator?: string;
}

export interface PreviewData {
  /** Rendered subject (if applicable) */
  subject?: string;
  /** Rendered body */
  body: string;
  /** All detected variables in template */
  detectedVariables: string[];
  /** Variables that are missing from provided data */
  missingVariables: string[];
  /** Variables detected but not in supported list */
  unsupportedVariables: string[];
  /** Whether preview is valid */
  isValid: boolean;
}

/**
 * Processes template and returns preview data
 */
function processTemplate(
  body: string,
  subject: string | undefined,
  variables: Record<string, any> = {},
  supportedVariables: string[] = [],
  missingIndicator: string = '[unknown]'
): PreviewData {
  // Detect all variables in the template
  const detectedVariables = detectVariables(body);
  if (subject) {
    detectedVariables.push(...detectVariables(subject));
  }
  const uniqueVariables = Array.from(new Set(detectedVariables));

  // Find missing variables
  const missingVariables = uniqueVariables.filter((v) => !(v in variables));

  // Find unsupported variables
  const unsupportedVariables =
    supportedVariables.length > 0
      ? uniqueVariables.filter((v) => !supportedVariables.includes(v))
      : [];

  // Render template with variables
  const renderedBody = renderTemplate(body, variables, { missingIndicator });
  const renderedSubject = subject ? renderTemplate(subject, variables, { missingIndicator }) : undefined;

  return {
    subject: renderedSubject,
    body: renderedBody,
    detectedVariables: uniqueVariables,
    missingVariables,
    unsupportedVariables,
    isValid: missingVariables.length === 0,
  };
}

/**
 * Template Preview Component
 */
export function TemplatePreview({
  body,
  subject,
  channelType,
  variables = {},
  supportedVariables = [],
  onVariablesDetected,
  onUnsupportedVariables,
  missingVariableIndicator = '[unknown]',
}: TemplatePreviewProps) {
  // Process template
  const previewData = useMemo(() => {
    return processTemplate(body, subject, variables, supportedVariables, missingVariableIndicator);
  }, [body, subject, variables, supportedVariables, missingVariableIndicator]);

  // Notify parent of detected variables
  React.useEffect(() => {
    onVariablesDetected?.(previewData.detectedVariables);
  }, [previewData.detectedVariables, onVariablesDetected]);

  // Notify parent of unsupported variables
  React.useEffect(() => {
    onUnsupportedVariables?.(previewData.unsupportedVariables);
  }, [previewData.unsupportedVariables, onUnsupportedVariables]);

  // Get channel-specific styling
  const getChannelClass = useCallback(() => {
    return `template-preview--${channelType.toLowerCase()}`;
  }, [channelType]);

  return (
    <div className={`template-preview ${getChannelClass()}`} data-testid="template-preview">
      {/* Header with status */}
      <div className="template-preview__header">
        <h3 className="template-preview__title">Preview</h3>
        <div className="template-preview__status">
          {previewData.isValid ? (
            <span className="template-preview__status-badge template-preview__status-badge--success">
              ✓ Valid
            </span>
          ) : (
            <span className="template-preview__status-badge template-preview__status-badge--warning">
              ⚠ Missing variables
            </span>
          )}
        </div>
      </div>

      {/* Warning section for missing or unsupported variables */}
      {(previewData.missingVariables.length > 0 || previewData.unsupportedVariables.length > 0) && (
        <div className="template-preview__warnings">
          {previewData.missingVariables.length > 0 && (
            <div className="template-preview__warning template-preview__warning--missing">
              <span className="template-preview__warning-icon">⚠</span>
              <div>
                <strong>Missing variables:</strong>
                <p>{previewData.missingVariables.join(', ')}</p>
              </div>
            </div>
          )}

          {previewData.unsupportedVariables.length > 0 && (
            <div className="template-preview__warning template-preview__warning--unsupported">
              <span className="template-preview__warning-icon">❌</span>
              <div>
                <strong>Unsupported variables:</strong>
                <p>{previewData.unsupportedVariables.join(', ')}</p>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Content preview */}
      <div className="template-preview__content">
        {/* Subject (if applicable) */}
        {previewData.subject && (
          <div className="template-preview__section">
            <div className="template-preview__label">Subject</div>
            <div className="template-preview__subject">{previewData.subject}</div>
          </div>
        )}

        {/* Body */}
        <div className="template-preview__section">
          <div className="template-preview__label">Body</div>
          <div className="template-preview__body" data-testid="preview-body">
            {previewData.body}
          </div>
        </div>
      </div>

      {/* Variable summary */}
      {previewData.detectedVariables.length > 0 && (
        <div className="template-preview__footer">
          <div className="template-preview__variable-list">
            <span className="template-preview__variable-count">
              {previewData.detectedVariables.length} variable{previewData.detectedVariables.length !== 1 ? 's' : ''}
            </span>
            <span className="template-preview__variable-names">
              {previewData.detectedVariables.join(', ')}
            </span>
          </div>
        </div>
      )}

      {/* Empty state */}
      {!body && (
        <div className="template-preview__empty">
          <p>No template content to preview</p>
        </div>
      )}
    </div>
  );
}

/**
 * Preview with editable variables
 */
export interface TemplatePreviewWithVariablesProps extends TemplatePreviewProps {
  /** Callback when variable values change */
  onVariableChange?: (variables: Record<string, any>) => void;
  /** Sample variables that can be edited */
  editableVariables?: Record<string, any>;
}

export function TemplatePreviewWithVariables({
  onVariableChange,
  editableVariables = {},
  ...props
}: TemplatePreviewWithVariablesProps) {
  const [localVariables, setLocalVariables] = React.useState(editableVariables);

  const handleVariableChange = useCallback(
    (name: string, value: any) => {
      const updated = { ...localVariables, [name]: value };
      setLocalVariables(updated);
      onVariableChange?.(updated);
    },
    [localVariables, onVariableChange]
  );

  return (
    <div className="template-preview-with-variables">
      <div className="template-preview-with-variables__preview">
        <TemplatePreview {...props} variables={localVariables} />
      </div>

      {Object.keys(localVariables).length > 0 && (
        <div className="template-preview-with-variables__editor">
          <h4>Variables</h4>
          <div className="template-preview-with-variables__inputs">
            {Object.entries(localVariables).map(([name, value]) => (
              <div key={name} className="template-preview-with-variables__input-group">
                <label className="template-preview-with-variables__input-label">{name}</label>
                <input
                  type="text"
                  className="template-preview-with-variables__input"
                  value={String(value)}
                  onChange={(e) => handleVariableChange(name, e.target.value)}
                  placeholder={`Enter value for ${name}`}
                  data-testid={`variable-input-${name}`}
                />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
