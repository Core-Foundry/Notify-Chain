import logger from '../utils/logger';
import {
  BatchValidator,
  BatchValidationResult,
  NotificationPayload,
  VALID_CHANNELS,
} from '../utils/batch-validator';

export interface BatchValidationError {
  index: number;
  field?: string;
  code: string;
  message: string;
  isRecoverable?: boolean;
}

export interface BatchValidationResponse {
  valid: boolean;
  processedCount: number;
  validItemCount: number;
  invalidItemCount: number;
  errors: BatchValidationError[];
  timestamp: number;
  duration: number;
}

export interface BatchOwnershipVerification {
  isOwner: boolean;
  ownerId?: string;
  batchId?: string;
  reason?: string;
}

export interface BatchValidationMetrics {
  totalBatchesProcessed: number;
  validBatches: number;
  invalidBatches: number;
  totalItemsValidated: number;
  totalErrorsFound: number;
  averageValidationTime: number;
  successRate: number;
}

/**
 * Service layer for comprehensive notification batch validation.
 *
 * Provides:
 * - Structural validation (format, required fields, types)
 * - Semantic validation (channel support, recipient uniqueness)
 * - Ownership verification
 * - Invalid entry handling and recovery
 * - Comprehensive metrics and audit logging
 *
 * Processes batches early to reject malformed data with actionable errors.
 */
export class BatchValidationService {
  private totalBatchesProcessed = 0;
  private validBatches = 0;
  private invalidBatches = 0;
  private totalItemsValidated = 0;
  private totalErrorsFound = 0;
  private totalValidationTime = 0;

  /**
   * Validate a complete batch of notifications.
   * Returns validation result with detailed error information.
   */
  validate(batch: unknown): BatchValidationResponse {
    const startTime = Date.now();

    try {
      const result = BatchValidator.validateBatch(batch);
      const validItemCount = Array.isArray(batch) && result.isValid ? batch.length : 0;
      const invalidItemCount = result.errors.filter((e) => e.index >= 0).length;

      const response: BatchValidationResponse = {
        valid: result.isValid,
        processedCount: result.processedCount,
        validItemCount,
        invalidItemCount,
        errors: result.errors.map((err) => ({
          index: err.index,
          field: err.field,
          code: err.code,
          message: err.message,
          isRecoverable: this.isRecoverableError(err.code),
        })),
        timestamp: Date.now(),
        duration: Date.now() - startTime,
      };

      this.recordValidation(response);
      return response;
    } catch (error) {
      logger.error('Unexpected error during batch validation', { error });
      const duration = Date.now() - startTime;
      const response: BatchValidationResponse = {
        valid: false,
        processedCount: 0,
        validItemCount: 0,
        invalidItemCount: 0,
        errors: [
          {
            index: -1,
            code: 'VALIDATION_ERROR',
            message: `Validation error: ${error instanceof Error ? error.message : String(error)}`,
          },
        ],
        timestamp: Date.now(),
        duration,
      };
      this.recordValidation(response);
      return response;
    }
  }

  /**
   * Returns null when the batch is valid; otherwise returns the validation response.
   * Useful for early rejection of invalid batches.
   */
  rejectIfInvalid(batch: unknown): BatchValidationResponse | null {
    const response = this.validate(batch);
    if (!response.valid) {
      logger.warn('Batch validation failed, rejecting request', {
        processedCount: response.processedCount,
        errorCount: response.errors.length,
        duration: response.duration,
      });
      return response;
    }
    return null;
  }

  /**
   * Validate batch ownership (stub for potential on-chain verification).
   * Currently returns a placeholder for future smart contract integration.
   */
  async verifyBatchOwnership(
    batchId: string,
    ownerId: string,
    _contractAddress?: string
  ): Promise<BatchOwnershipVerification> {
    try {
      // TODO: In a future version, this could verify ownership
      // by querying the smart contract
      if (!batchId || !ownerId) {
        return {
          isOwner: false,
          reason: 'Missing batchId or ownerId',
        };
      }

      logger.info('Batch ownership verified', { batchId, ownerId });
      return {
        isOwner: true,
        batchId,
        ownerId,
      };
    } catch (error) {
      logger.error('Error verifying batch ownership', { error });
      return {
        isOwner: false,
        reason: `Verification error: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }

  /**
   * Handle invalid entries in a batch by filtering and recording them.
   * Returns the filtered batch and a record of invalid entries.
   */
  filterValidEntries(batch: unknown): {
    validEntries: NotificationPayload[];
    invalidEntries: Array<{ index: number; error: string }>;
  } {
    const validEntries: NotificationPayload[] = [];
    const invalidEntries: Array<{ index: number; error: string }> = [];

    if (!Array.isArray(batch)) {
      return { validEntries, invalidEntries };
    }

    batch.forEach((item, index) => {
      const validation = this.validateItem(item);
      if (validation.valid) {
        validEntries.push(item as NotificationPayload);
      } else {
        invalidEntries.push({
          index,
          error: validation.error ?? 'Invalid notification item',
        });
      }
    });

    if (invalidEntries.length > 0) {
      logger.warn('Invalid entries filtered from batch', {
        totalItems: batch.length,
        validCount: validEntries.length,
        invalidCount: invalidEntries.length,
      });
    }

    return { validEntries, invalidEntries };
  }

  /**
   * Get comprehensive validation metrics.
   */
  getMetrics(): BatchValidationMetrics {
    const successRate = this.totalBatchesProcessed > 0
      ? Math.round((this.validBatches / this.totalBatchesProcessed) * 10000) / 100
      : 0;

    const averageValidationTime = this.totalBatchesProcessed > 0
      ? Math.round(this.totalValidationTime / this.totalBatchesProcessed)
      : 0;

    return {
      totalBatchesProcessed: this.totalBatchesProcessed,
      validBatches: this.validBatches,
      invalidBatches: this.invalidBatches,
      totalItemsValidated: this.totalItemsValidated,
      totalErrorsFound: this.totalErrorsFound,
      averageValidationTime,
      successRate,
    };
  }

  /**
   * Reset all metrics.
   */
  resetMetrics(): void {
    this.totalBatchesProcessed = 0;
    this.validBatches = 0;
    this.invalidBatches = 0;
    this.totalItemsValidated = 0;
    this.totalErrorsFound = 0;
    this.totalValidationTime = 0;
  }

  /**
   * Determine if an error is recoverable (batch can be partially processed).
   */
  private isRecoverableError(code: string): boolean {
    const recoverableCodes = [
      'MISSING_FIELD',
      'EMPTY_FIELD',
      'INVALID_CHANNEL',
      'DUPLICATE_RECIPIENT',
    ];
    return recoverableCodes.includes(code);
  }

  /**
   * Validate a single notification item.
   */
  private validateItem(
    item: unknown
  ): {
    valid: boolean;
    error?: string;
  } {
    if (item === null || typeof item !== 'object' || Array.isArray(item)) {
      return { valid: false, error: 'Item must be an object' };
    }

    const obj = item as Record<string, unknown>;
    const requiredFields: Array<keyof NotificationPayload> = [
      'id',
      'recipient',
      'channel',
      'message',
    ];

    for (const field of requiredFields) {
      if (!obj[field] || obj[field] === '') {
        return { valid: false, error: `Missing required field: ${field}` };
      }
    }

    if (!VALID_CHANNELS.includes(obj.channel as any)) {
      return { valid: false, error: `Invalid channel: ${obj.channel}` };
    }

    return { valid: true };
  }

  /**
   * Record validation metrics.
   */
  private recordValidation(response: BatchValidationResponse): void {
    this.totalBatchesProcessed++;
    this.totalValidationTime += response.duration;
    this.totalItemsValidated += response.processedCount;
    this.totalErrorsFound += response.errors.length;

    if (response.valid) {
      this.validBatches++;
    } else {
      this.invalidBatches++;
    }
  }
}

export type { NotificationPayload, BatchValidationResult };
export { VALID_CHANNELS };
