import { TemplateRenderer } from './template-renderer';

/**
 * Variables the notification pipeline can always supply to a template.
 *
 * Template authors may declare additional variables through `supportedVariables`
 * or `defaultValues`; those are merged with this list at validation time. The
 * list intentionally covers the built-in event/notification fields as well as
 * the long-standing custom variables used by existing templates so previously
 * valid templates keep working.
 */
export const DEFAULT_SUPPORTED_TEMPLATE_VARIABLES: ReadonlySet<string> = new Set([
  // Built-in event / notification fields
  'event_id', 'eventId', 'event_name', 'eventName', 'event_type', 'eventType',
  'contract_address', 'contractAddress', 'ledger', 'ledgerNumber',
  'tx_hash', 'txHash', 'transaction_hash', 'timestamp', 'created_at', 'receivedAt',
  'notification_id', 'notificationId', 'notification_type', 'recipient', 'recipient_id',
  'sender', 'message', 'message_preview', 'title', 'subject', 'description', 'details',
  'status', 'priority', 'category', 'alert_type', 'channel', 'type', 'value', 'payload',
  'id', 'time', 'date', 'url', 'link', 'app_name', 'app_url', 'base_url',
  // Common user / account fields
  'name', 'user', 'user_id', 'userId', 'user_name', 'userName', 'first_name', 'last_name',
  'user_email', 'userEmail', 'email', 'username', 'actor', 'creator', 'contributor',
  // Scheduling / delivery fields
  'schedule_id', 'scheduled_at', 'template_id', 'due_date', 'delivery_date',
  'expiry_hours', 'expiry_minutes', 'validity_minutes', 'minutes',
  // Payment / task fields
  'amount', 'currency', 'rate', 'total', 'balance', 'reward', 'reward_amount',
  'task_title', 'taskId', 'order', 'order_id', 'order_total', 'items_list',
  // Auth / webhook helpers
  'code', 'verification_code', 'reset_link', 'resetLink', 'token',
  'unsubscribe_token', 'tracking_url', 'api_key', 'webhook_key_id',
  // Legacy free-form variables kept for backwards compatibility
  'variable', 'var', 'new_variable', 'variable_name', 'variableName', 'varName',
  'additional_info', 'guide', 'width', 'computed_in_prerequest', 'placeholders', 'app',
  'from', 'to', 'customer', 'product', 'event',
]);

export interface TemplateVariableValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  /** Every placeholder found in the body and subject. */
  detectedVariables: string[];
  /** The allowlist used for this validation run. */
  supportedVariables: string[];
  /** Detected placeholders that are not in the allowlist. */
  unsupportedVariables: string[];
  /** Variables the template author requires to be present. */
  requiredVariables: string[];
  /** Required variables that are not referenced by the template. */
  missingRequiredVariables: string[];
}

export interface ValidateTemplateVariablesOptions {
  body: string;
  subject?: string;
  /** Variables that must appear in the template. */
  requiredVariables?: string[];
  /** Additional variables that are allowed for this template. */
  supportedVariables?: string[];
  /** Keys of default values are implicitly supported. */
  defaultValues?: Record<string, unknown>;
  /**
   * When false (the default) unsupported variables are reported as warnings so
   * historical templates remain usable. Set to true before accepting a new or
   * updated template to reject unknown variables.
   */
  strictUnsupportedVariables?: boolean;
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}

/** Root name of a possibly nested placeholder (`user.name` -> `user`). */
function rootVariable(variable: string): string {
  return variable.split('.')[0];
}

/**
 * Validate the variables used by a notification template.
 *
 * - Detects placeholders that are not part of the supported variable set.
 * - Verifies that declared required variables are actually present in the
 *   template, so a typo cannot silently drop a required value at delivery time.
 * - Returns structured, human-readable errors suitable for API responses.
 */
export function validateTemplateVariables(
  options: ValidateTemplateVariablesOptions,
): TemplateVariableValidationResult {
  const {
    body,
    subject,
    requiredVariables = [],
    supportedVariables = [],
    defaultValues = {},
    strictUnsupportedVariables = false,
  } = options;

  const errors: string[] = [];
  const warnings: string[] = [];

  const detectedVariables = unique([
    ...TemplateRenderer.extractVariables(body ?? ''),
    ...(subject ? TemplateRenderer.extractVariables(subject) : []),
  ]);

  const allowed = new Set<string>([
    ...DEFAULT_SUPPORTED_TEMPLATE_VARIABLES,
    ...requiredVariables,
    ...supportedVariables,
    ...Object.keys(defaultValues ?? {}),
  ]);
  // Nested access is validated against the root object.
  for (const variable of allowed) {
    allowed.add(rootVariable(variable));
  }

  const unsupportedVariables = detectedVariables.filter(
    (variable) => !allowed.has(variable) && !allowed.has(rootVariable(variable)),
  );

  if (unsupportedVariables.length > 0) {
    const message = `Unsupported template variable(s): ${unsupportedVariables.join(', ')}. Supported variables: ${[...allowed].sort().join(', ')}`;
    if (strictUnsupportedVariables) {
      errors.push(message);
    } else {
      warnings.push(message);
    }
  }

  const referenced = new Set([
    ...detectedVariables,
    ...detectedVariables.map(rootVariable),
  ]);
  const missingRequiredVariables = requiredVariables.filter(
    (variable) => !referenced.has(variable) && !referenced.has(rootVariable(variable)),
  );

  if (missingRequiredVariables.length > 0) {
    errors.push(`Missing required template variable(s): ${missingRequiredVariables.join(', ')}`);
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
    detectedVariables,
    supportedVariables: [...allowed].sort(),
    unsupportedVariables,
    requiredVariables: [...requiredVariables],
    missingRequiredVariables,
  };
}
