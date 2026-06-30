import { IdempotencyKeyRepository } from './idempotency-key-repository';
import logger from '../utils/logger';

/**
 * Service for managing request idempotency
 * Prevents duplicate notification creation by caching responses
 */
export class IdempotencyKeyService {
  constructor(private repository: IdempotencyKeyRepository) {}

  /**
   * Process a request with idempotency support
   * Returns cached response if this request was already processed
   */
  async processWithIdempotency<T>(
    idempotencyKey: string | undefined,
    requestBody: any,
    processor: () => Promise<T>,
    options?: {
      expirationMinutes?: number;
    }
  ): Promise<{
    result: T;
    isDuplicate: boolean;
    notificationId?: number;
  }> {
    // If no idempotency key provided, just execute normally
    if (!idempotencyKey) {
      const result = await processor();
      return { result, isDuplicate: false };
    }

    // Check if we have a cached response
    const cached = await this.repository.getCachedResponse(idempotencyKey);
    if (cached) {
      const isValidRequest = await this.repository.validateRequestHash(
        idempotencyKey,
        requestBody
      );
      if (!isValidRequest) {
        const error = new Error(
          'Idempotency key reused with different request body'
        );
        logger.error('Request validation failed', {
          idempotencyKey,
          error: error.message,
        });
        throw error;
      }

      logger.info('Returning cached response for idempotent request', {
        idempotencyKey,
        notificationId: cached.notificationId,
      });
      return {
        result: cached.response,
        isDuplicate: true,
        notificationId: cached.notificationId,
      };
    }

    // Validate request hash if key exists but is expired
    const isValidRequest = await this.repository.validateRequestHash(
      idempotencyKey,
      requestBody
    );

    if (!isValidRequest) {
      const error = new Error(
        'Idempotency key reused with different request body'
      );
      logger.error('Request validation failed', {
        idempotencyKey,
        error: error.message,
      });
      throw error;
    }

    // Execute the processor and cache the response
    logger.info('Processing new idempotent request', { idempotencyKey });
    const result = await processor();

    // Cache the response for future duplicate requests
    // Note: We need the notification ID from the result
    const notificationId =
      typeof result === 'number' ? result : (result as any).id;

    await this.repository.storeResponse(
      idempotencyKey,
      requestBody,
      notificationId,
      { success: true, id: notificationId },
      options?.expirationMinutes
    );

    return {
      result,
      isDuplicate: false,
      notificationId,
    };
  }

  /**
   * Clean up expired keys (should be called periodically)
   */
  async cleanupExpiredKeys(): Promise<number> {
    return await this.repository.cleanupExpiredKeys();
  }

  /**
   * Get statistics about idempotency key usage
   */
  async getStatistics() {
    return await this.repository.getStats();
  }
}
