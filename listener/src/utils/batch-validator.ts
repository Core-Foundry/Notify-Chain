import * as fs from 'fs';
import * as path from 'path';

export const VALID_CHANNELS = ['discord', 'webhook', 'email', 'sms'] as const;
export type NotificationChannel = (typeof VALID_CHANNELS)[number];

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

      if (item.channel !== undefined) {
        if (!VALID_CHANNELS.includes(item.channel as NotificationChannel)) {
          result.errors.push({
            index,
            field: 'channel',
            code: 'INVALID_CHANNEL',
            message: `Item at index [${index}]: Channel '${item.channel}' is not supported. Allowed: ${VALID_CHANNELS.join(', ')}.`,
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
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const log = require('./logger').default as typeof import('./logger').default;

  const sampleMockBatch = [
    { id: 'evt_001', recipient: 'discord_channel_alpha', channel: 'discord', message: 'TaskCreated: Bounty #42 active.' },
    { id: 'evt_002', recipient: 'discord_channel_alpha', channel: 'discord', message: 'WorkSubmitted: Task completed.' },
    { id: 'evt_003', recipient: '', channel: 'webhook', message: 'Missing recipient details' },
  ];

  log.info('Running NotifyChain Batch Validation Check');

  const validationReport = BatchValidator.validateBatch(sampleMockBatch);

  const reportsDir = path.join(__dirname, '../../reports');
  if (!fs.existsSync(reportsDir)) {
    fs.mkdirSync(reportsDir, { recursive: true });
  }

  const reportPath = path.join(reportsDir, 'last-validation-run.json');
  fs.writeFileSync(reportPath, JSON.stringify(validationReport, null, 2), 'utf-8');

  log.info('Batch validation complete', {
    status: validationReport.isValid ? 'PASSED' : 'REJECTED',
    processedCount: validationReport.processedCount,
    errorCount: validationReport.errors.length,
    reportPath,
  });

  if (!validationReport.isValid) {
    validationReport.errors.forEach((err) => {
      log.warn('Validation error detail', {
        index: err.index,
        field: err.field,
        code: err.code,
        message: err.message,
      });
    });
  }
}

if (require.main === module) {
  runTerminalSimulation();
}
