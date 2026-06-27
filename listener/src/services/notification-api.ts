import { ScheduledNotificationRepository } from './scheduled-notification-repository';
import { IdempotencyKeyService } from './idempotency-key-service';
import { CreateScheduledNotificationInput, NotificationType } from '../types/scheduled-notification';
import logger from '../utils/logger';

/**
 * High-level API for scheduling notifications
 * This is the main interface that application code should use
 * Includes support for idempotent request handling
 */
export class NotificationAPI {
  constructor(
    private repository: ScheduledNotificationRepository,
    private idempotencyService?: IdempotencyKeyService
  ) {}

  /**
   * Schedule a notification for future delivery
   * Supports idempotent request handling via idempotency keys
   */
  async scheduleNotification(
    input: CreateScheduledNotificationInput,
    requestId?: string,
    idempotencyKey?: string
  ): Promise<number> {
    // Validate input
    if (!input.executeAt || !(input.executeAt instanceof Date) || isNaN(input.executeAt.getTime())) {
      throw new Error('executeAt must be a valid date');
    }

    if (input.executeAt <= new Date()) {
      throw new Error('executeAt must be a future timestamp — the provided date has already expired');
    }

    if (!input.payload || typeof input.payload !== 'object') {
      throw new Error('payload must be a valid object');
    }

    if (!input.targetRecipient) {
      throw new Error('targetRecipient is required');
    }

    logger.info('Scheduling new notification', {
      requestId,
      idempotencyKey,
      type: input.notificationType,
      executeAt: input.executeAt,
      recipient: input.targetRecipient,
    });

    // If idempotency service is available, use it for deduplication
    if (this.idempotencyService && idempotencyKey) {
      const { result, isDuplicate, notificationId } =
        await this.idempotencyService.processWithIdempotency(
          idempotencyKey,
          input,
          async () => {
            return await this.repository.create(input, requestId);
          }
        );

      if (isDuplicate) {
        logger.info('Returned duplicate notification response', {
          requestId,
          idempotencyKey,
          notificationId,
        });
      }

      return typeof result === 'number' ? result : (result as { id: number }).id;
    }

    return await this.repository.create(input, requestId);
  }

  /**
   * Schedule a Discord notification
   */
  async scheduleDiscordNotification(
    webhookUrl: string,
    message: any,
    executeAt: Date,
    options?: {
      maxRetries?: number;
      priority?: number;
      metadata?: Record<string, any>;
    }
  ): Promise<number> {
    return await this.scheduleNotification({
      payload: { message, webhookUrl },
      notificationType: NotificationType.DISCORD,
      targetRecipient: webhookUrl,
      executeAt,
      maxRetries: options?.maxRetries,
      priority: options?.priority,
      metadata: options?.metadata,
    });
  }

  /**
   * Cancel a scheduled notification
   */
  async cancelNotification(id: number, requestId?: string): Promise<boolean> {
    logger.info('Cancelling scheduled notification', { requestId, id });
    return await this.repository.cancel(id);
  }

  /**
   * Get notification by ID
   */
  async getNotification(id: number) {
    return await this.repository.getById(id);
  }

  /**
   * Get scheduler statistics
   */
  async getStatistics() {
    return await this.repository.getStats();
  }
}
