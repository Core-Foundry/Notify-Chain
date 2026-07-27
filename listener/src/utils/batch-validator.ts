import * as fs from 'fs';
import * as path from 'path';

export const VALID_CHANNELS = ['discord', 'webhook', 'email', 'sms'] as const;
export type NotificationChannel = (typeof VALID_CHANNELS)[number];

/**
 * Issue #479: Validates a channel name, rejecting empty or whitespace-only values.
 *
 * Returns an object describing the validation result:
 * - `valid: true`  when the name is a non-empty, non-whitespace string that
 *   maps to a known channel.
 * - `valid: false` with a `code` and `message` when it does not.
 *
 * Error codes:
 * - `EMPTY_CHANNEL_NAME`  – name is missing, empty, or whitespace-only.
 * - `INVALID_CHANNEL`     – name is present but not in VALID_CHANNELS.
 */
export function validateChannelName(
  name: unknown,
): { valid: true } | { valid: false; code: string; message: string } {
  if (name === undefined || name === null || name === '') {
    return {
      valid: false,
      code: 'EMPTY_CHANNEL_NAME',
      message: `Channel name must not be empty. Allowed values: ${VALID_CHANNELS.join(', ')}.`,
    };
  }

  if (typeof name !== 'string') {
    return {
      valid: false,
      code: 'INVALID_CHANNEL',
      message: `Channel must be a string. Allowed values: ${VALID_CHANNELS.join(', ')}.`,
    };
  }

  if (name.trim() === '') {
    return {
      valid: false,
      code: 'EMPTY_CHANNEL_NAME',
      message: `Channel name must not be empty or whitespace-only. Allowed values: ${VALID_CHANNELS.join(', ')}.`,
    };
  }

  if (!VALID_CHANNELS.includes(name as NotificationChannel)) {
    return {
      valid: false,
      code: 'INVALID_CHANNEL',
      message: `Channel '${name}' is not supported. Allowed values: ${VALID_CHANNELS.join(', ')}.`,
    };
  }

  return { valid: true };
}

export interface NotificationPayload {
  id: string;
  recipient: string;
  channel: NotificationChannel;
  message: string;
}

export interface BatchValidationErrorDetail {
  index: number;
  field?: string;
  code: string;
  message: string;
}

export interface BatchValidationResult {
  isValid: boolean;
  processedCount: number;
  errors: BatchValidationErrorDetail[];
}

export class BatchValidator {
  public static validateBatch(batch: unknown): BatchValidationResult {
    const result: BatchValidationResult = { isValid: true, processedCount: 0, errors: [] };
    const seenRecipients = new Set<string>();

    if (!Array.isArray(batch)) {
      result.errors.push({
        index: -1,
        code: 'INVALID_STRUCTURE',
        message: 'Batch must be a JSON array of notification payloads.',
      });
      result.isValid = false;
      return result;
    }

    if (batch.length === 0) {
      result.errors.push({
        index: -1,
        code: 'EMPTY_BATCH',
        message: 'Batch must contain at least one notification.',
      });
      result.isValid = false;
      return result;
    }

    batch.forEach((payload, index) => {
      if (payload === null || typeof payload !== 'object' || Array.isArray(payload)) {
        result.errors.push({
          index,
          code: 'INVALID_ITEM',
          message: `Item at index [${index}] must be an object.`,
        });
        result.isValid = false;
        return;
      }

      const item = payload as Record<string, unknown>;
      const requiredFields: Array<keyof NotificationPayload> = ['id', 'recipient', 'channel', 'message'];

      for (const field of requiredFields) {
        const value = item[field];
        if (value === undefined || value === null || value === '') {
          result.errors.push({
            index,
            field,
            code: 'MISSING_FIELD',
            message: `Item at index [${index}]: Missing required field '${field}'.`,
          });
          result.isValid = false;
        }
      }

      if (typeof item.id === 'string' && item.id.trim() === '') {
        result.errors.push({
          index,
          field: 'id',
          code: 'EMPTY_FIELD',
          message: `Item at index [${index}]: Field 'id' must not be empty.`,
        });
        result.isValid = false;
      }

      if (typeof item.recipient === 'string' && item.recipient.trim() === '') {
        result.errors.push({
          index,
          field: 'recipient',
          code: 'EMPTY_FIELD',
          message: `Item at index [${index}]: Field 'recipient' must not be empty.`,
        });
        result.isValid = false;
      }

      if (typeof item.message === 'string' && item.message.trim() === '') {
        result.errors.push({
          index,
          field: 'message',
          code: 'EMPTY_FIELD',
          message: `Item at index [${index}]: Field 'message' must not be empty.`,
        });
        result.isValid = false;
      }

      // Issue #479: reject empty/whitespace-only channel names explicitly before
      // checking against VALID_CHANNELS so callers get a clear EMPTY_CHANNEL_NAME
      // error rather than a misleading INVALID_CHANNEL error.
      if (item.channel !== undefined) {
        const channelResult = validateChannelName(item.channel);
        if (!channelResult.valid) {
          result.errors.push({
            index,
            field: 'channel',
            code: channelResult.code,
            message: `Item at index [${index}]: ${channelResult.message}`,
          });
          result.isValid = false;
        }
      }

      if (typeof item.recipient === 'string' && item.recipient.trim() !== '') {
        const normalized = item.recipient.trim().toLowerCase();
        if (seenRecipients.has(normalized)) {
          result.errors.push({
            index,
            field: 'recipient',
            code: 'DUPLICATE_RECIPIENT',
            message: `Item at index [${index}]: Duplicate recipient '${item.recipient}'. Each recipient may appear only once per batch.`,
          });
          result.isValid = false;
        } else {
          seenRecipients.add(normalized);
        }
      }
    });

    if (result.isValid) {
      result.processedCount = batch.length;
    }

    return result;
  }
}

function runTerminalSimulation() {
  const sampleMockBatch = [
    { id: 'evt_001', recipient: 'discord_channel_alpha', channel: 'discord', message: 'TaskCreated: Bounty #42 active.' },
    { id: 'evt_002', recipient: 'discord_channel_alpha', channel: 'discord', message: 'WorkSubmitted: Task completed.' },
    { id: 'evt_003', recipient: '', channel: 'webhook', message: 'Missing recipient details' },
  ];

  console.log('🚀 Running NotifyChain Batch Validation Check...');
  const validationReport = BatchValidator.validateBatch(sampleMockBatch);

  const reportsDir = path.join(__dirname, '../../reports');
  if (!fs.existsSync(reportsDir)) {
    fs.mkdirSync(reportsDir, { recursive: true });
  }

  fs.writeFileSync(
    path.join(reportsDir, 'last-validation-run.json'),
    JSON.stringify(validationReport, null, 2),
    'utf-8'
  );

  console.log(`\n📊 Execution Results Logged:`);
  console.log(`   Status: ${validationReport.isValid ? '🟩 PASSED' : '🟥 REJECTED'}`);
  console.log(`   Errors Found: ${validationReport.errors.length}`);
  validationReport.errors.forEach((err) => console.log(`   ⚠️  ${err.message}`));
  console.log(`\n💾 Saved audit report to: listener/reports/last-validation-run.json`);
}

if (require.main === module) {
  runTerminalSimulation();
}
