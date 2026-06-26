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
}

export interface BatchValidationResponse {
  valid: boolean;
  processedCount: number;
  errors: BatchValidationError[];
}

/**
 * Service layer for notification batch validation.
 * Rejects malformed batches early with actionable, structured errors.
 */
export class BatchValidationService {
  validate(batch: unknown): BatchValidationResponse {
    const result = BatchValidator.validateBatch(batch);
    return this.toResponse(result);
  }

  /**
   * Returns null when the batch is valid; otherwise returns the validation response.
   */
  rejectIfInvalid(batch: unknown): BatchValidationResponse | null {
    const response = this.validate(batch);
    return response.valid ? null : response;
  }

  private toResponse(result: BatchValidationResult): BatchValidationResponse {
    return {
      valid: result.isValid,
      processedCount: result.processedCount,
      errors: result.errors.map((err) => ({
        index: err.index,
        field: err.field,
        code: err.code,
        message: err.message,
      })),
    };
  }
}

export type { NotificationPayload, BatchValidationResult };
export { VALID_CHANNELS };
