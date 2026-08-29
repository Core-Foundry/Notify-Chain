/**
 * Regression tests for execution metrics deduplication
 * Tests that successful retries are NOT double-counted in metrics
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { Database } from '../database/database';
import { ScheduledNotificationRepository } from './scheduled-notification-repository';
import { NotificationStatus, NotificationType } from '../types/scheduled-notification';
import path from 'path';
import fs from 'fs/promises';

describe('Execution Metrics Deduplication', () => {
  let db: Database;
  let repository: ScheduledNotificationRepository;
  const testDbPath = path.join(__dirname, '../../test-data/test-execution-metrics.db');

  beforeEach(async () => {
    // Clean up any existing test database - force delete even if locked
    try {
      await fs.unlink(testDbPath);
      // Also try to delete journal files
      await fs.unlink(testDbPath + '-journal').catch(() => {});
      await fs.unlink(testDbPath + '-wal').catch(() => {});
      await fs.unlink(testDbPath + '-shm').catch(() => {});
    } catch {
      // File doesn't exist, ignore
    }

    // Small delay to ensure file system has released the file
    await new Promise(resolve => setTimeout(resolve, 100));

    // Create fresh database
    db = new Database(testDbPath);
    await db.initialize();
    repository = new ScheduledNotificationRepository(db);
  });

  afterEach(async () => {
    await db.close();
    try {
      await fs.unlink(testDbPath);
    } catch {
      // Ignore cleanup errors
    }
  });

  /**
   * CRITICAL TEST: This is the regression test for the double-counting bug
   * 
   * Scenario: A notification fails twice, then succeeds on the 3rd attempt
   * Expected: Should count as EXACTLY 1 success, not 3 events
   */
  it('should count a notification with 2 failures + 1 success as exactly 1 successful notification', async () => {
    // Create a notification
    const notificationId = await repository.create({
      payload: { test: 'data' },
      notificationType: NotificationType.DISCORD,
      targetRecipient: 'webhook-url',
      executeAt: new Date(),
      maxRetries: 3,
    });

    // Simulate first attempt: RETRY (failure)
    await repository.logExecution({
      scheduledNotificationId: notificationId,
      executionAttempt: 1,
      executionTime: new Date(),
      status: 'RETRY',
      errorMessage: 'Network timeout',
      durationMs: 1000,
    });
    await repository.markAsFailedOrRetry(notificationId, new Error('Network timeout'), 0, 3);

    // Simulate second attempt: RETRY (failure)
    await repository.logExecution({
      scheduledNotificationId: notificationId,
      executionAttempt: 2,
      executionTime: new Date(),
      status: 'RETRY',
      errorMessage: 'Service unavailable',
      durationMs: 1500,
    });
    await repository.markAsFailedOrRetry(notificationId, new Error('Service unavailable'), 1, 3);

    // Simulate third attempt: SUCCESS
    await repository.logExecution({
      scheduledNotificationId: notificationId,
      executionAttempt: 3,
      executionTime: new Date(),
      status: 'SUCCESS',
      durationMs: 800,
    });
    await repository.markAsCompleted(notificationId);

    // Get metrics
    const metrics = await repository.getExecutionMetrics();

    // CRITICAL ASSERTIONS: Must count as exactly 1 success
    expect(metrics.totalNotifications).toBe(1);
    expect(metrics.successfulFirstAttempt).toBe(0);
    expect(metrics.successfulAfterRetry).toBe(1); // ← ONLY 1 SUCCESS, NOT 3
    expect(metrics.permanentFailures).toBe(0);
    expect(metrics.totalRetryAttempts).toBe(2); // 2 retries before success
  });

  it('should correctly count multiple notifications with different retry patterns', async () => {
    // Notification 1: Success on first attempt (no retries)
    const notif1 = await repository.create({
      payload: { test: '1' },
      notificationType: NotificationType.DISCORD,
      targetRecipient: 'webhook-1',
      executeAt: new Date(),
      maxRetries: 3,
    });
    await repository.logExecution({
      scheduledNotificationId: notif1,
      executionAttempt: 1,
      executionTime: new Date(),
      status: 'SUCCESS',
      durationMs: 500,
    });
    await repository.markAsCompleted(notif1);

    // Notification 2: Fails once, then succeeds (1 retry)
    const notif2 = await repository.create({
      payload: { test: '2' },
      notificationType: NotificationType.DISCORD,
      targetRecipient: 'webhook-2',
      executeAt: new Date(),
      maxRetries: 3,
    });
    await repository.logExecution({
      scheduledNotificationId: notif2,
      executionAttempt: 1,
      executionTime: new Date(),
      status: 'RETRY',
      errorMessage: 'Temporary error',
      durationMs: 1000,
    });
    await repository.markAsFailedOrRetry(notif2, new Error('Temporary error'), 0, 3);
    await repository.logExecution({
      scheduledNotificationId: notif2,
      executionAttempt: 2,
      executionTime: new Date(),
      status: 'SUCCESS',
      durationMs: 600,
    });
    await repository.markAsCompleted(notif2);

    // Notification 3: Fails 3 times, permanent failure
    const notif3 = await repository.create({
      payload: { test: '3' },
      notificationType: NotificationType.DISCORD,
      targetRecipient: 'webhook-3',
      executeAt: new Date(),
      maxRetries: 2,
    });
    await repository.logExecution({
      scheduledNotificationId: notif3,
      executionAttempt: 1,
      executionTime: new Date(),
      status: 'RETRY',
      errorMessage: 'Error 1',
      durationMs: 1000,
    });
    await repository.markAsFailedOrRetry(notif3, new Error('Error 1'), 0, 2);
    await repository.logExecution({
      scheduledNotificationId: notif3,
      executionAttempt: 2,
      executionTime: new Date(),
      status: 'RETRY',
      errorMessage: 'Error 2',
      durationMs: 1100,
    });
    await repository.markAsFailedOrRetry(notif3, new Error('Error 2'), 1, 2);
    await repository.logExecution({
      scheduledNotificationId: notif3,
      executionAttempt: 3,
      executionTime: new Date(),
      status: 'FAILED',
      errorMessage: 'Error 3',
      durationMs: 1200,
    });
    await repository.markAsFailedOrRetry(notif3, new Error('Error 3'), 2, 2);

    // Get metrics
    const metrics = await repository.getExecutionMetrics();

    // Verify proper deduplication
    expect(metrics.totalNotifications).toBe(3);
    expect(metrics.successfulFirstAttempt).toBe(1); // notif1
    expect(metrics.successfulAfterRetry).toBe(1); // notif2
    expect(metrics.permanentFailures).toBe(1); // notif3
    expect(metrics.totalRetryAttempts).toBe(3); // 0 + 1 + 2

    // Average 1 retry per notification (3 retries / 3 notifications)
    expect(metrics.averageRetriesPerNotification).toBe(1);
  });

  it('should return retry distribution breakdown', async () => {
    // Create notifications with different retry counts
    // 0 retries: 2 successes
    for (let i = 0; i < 2; i++) {
      const id = await repository.create({
        payload: { test: `0-retry-${i}` },
        notificationType: NotificationType.DISCORD,
        targetRecipient: 'webhook',
        executeAt: new Date(),
        maxRetries: 3,
      });
      await repository.logExecution({
        scheduledNotificationId: id,
        executionAttempt: 1,
        executionTime: new Date(),
        status: 'SUCCESS',
        durationMs: 500,
      });
      await repository.markAsCompleted(id);
    }

    // 1 retry: 3 successes
    for (let i = 0; i < 3; i++) {
      const id = await repository.create({
        payload: { test: `1-retry-${i}` },
        notificationType: NotificationType.DISCORD,
        targetRecipient: 'webhook',
        executeAt: new Date(),
        maxRetries: 3,
      });
      await repository.logExecution({
        scheduledNotificationId: id,
        executionAttempt: 1,
        executionTime: new Date(),
        status: 'RETRY',
        errorMessage: 'Error',
        durationMs: 1000,
      });
      await repository.markAsFailedOrRetry(id, new Error('Error'), 0, 3);
      await repository.logExecution({
        scheduledNotificationId: id,
        executionAttempt: 2,
        executionTime: new Date(),
        status: 'SUCCESS',
        durationMs: 600,
      });
      await repository.markAsCompleted(id);
    }

    // 2 retries: 1 failure
    const failId = await repository.create({
      payload: { test: '2-retry-fail' },
      notificationType: NotificationType.DISCORD,
      targetRecipient: 'webhook',
      executeAt: new Date(),
      maxRetries: 2,
    });
    await repository.logExecution({
      scheduledNotificationId: failId,
      executionAttempt: 1,
      executionTime: new Date(),
      status: 'RETRY',
      errorMessage: 'Error 1',
      durationMs: 1000,
    });
    await repository.markAsFailedOrRetry(failId, new Error('Error 1'), 0, 2);
    await repository.logExecution({
      scheduledNotificationId: failId,
      executionAttempt: 2,
      executionTime: new Date(),
      status: 'RETRY',
      errorMessage: 'Error 2',
      durationMs: 1100,
    });
    await repository.markAsFailedOrRetry(failId, new Error('Error 2'), 1, 2);
    await repository.logExecution({
      scheduledNotificationId: failId,
      executionAttempt: 3,
      executionTime: new Date(),
      status: 'FAILED',
      errorMessage: 'Error 3',
      durationMs: 1200,
    });
    await repository.markAsFailedOrRetry(failId, new Error('Error 3'), 2, 2);

    // Get distribution
    const distribution = await repository.getRetryDistribution();

    // Verify distribution
    expect(distribution).toHaveLength(3);
    
    const retries0 = distribution.find((d) => d.retryCount === 0);
    expect(retries0?.successCount).toBe(2);
    expect(retries0?.failureCount).toBe(0);

    const retries1 = distribution.find((d) => d.retryCount === 1);
    expect(retries1?.successCount).toBe(3);
    expect(retries1?.failureCount).toBe(0);

    const retries2 = distribution.find((d) => d.retryCount === 2);
    expect(retries2?.successCount).toBe(0);
    expect(retries2?.failureCount).toBe(1);
  });

  it('should calculate accurate average durations', async () => {
    // Success with 500ms duration
    const success1 = await repository.create({
      payload: { test: 's1' },
      notificationType: NotificationType.DISCORD,
      targetRecipient: 'webhook',
      executeAt: new Date(),
      maxRetries: 3,
    });
    await repository.logExecution({
      scheduledNotificationId: success1,
      executionAttempt: 1,
      executionTime: new Date(),
      status: 'SUCCESS',
      durationMs: 500,
    });
    await repository.markAsCompleted(success1);

    // Success with 1000ms duration
    const success2 = await repository.create({
      payload: { test: 's2' },
      notificationType: NotificationType.DISCORD,
      targetRecipient: 'webhook',
      executeAt: new Date(),
      maxRetries: 3,
    });
    await repository.logExecution({
      scheduledNotificationId: success2,
      executionAttempt: 1,
      executionTime: new Date(),
      status: 'SUCCESS',
      durationMs: 1000,
    });
    await repository.markAsCompleted(success2);

    // Failure with 2000ms duration
    const failure = await repository.create({
      payload: { test: 'f1' },
      notificationType: NotificationType.DISCORD,
      targetRecipient: 'webhook',
      executeAt: new Date(),
      maxRetries: 0,
    });
    await repository.logExecution({
      scheduledNotificationId: failure,
      executionAttempt: 1,
      executionTime: new Date(),
      status: 'FAILED',
      errorMessage: 'Error',
      durationMs: 2000,
    });
    await repository.markAsFailedOrRetry(failure, new Error('Error'), 0, 0);

    // Get metrics
    const metrics = await repository.getExecutionMetrics();

    // Average success duration: (500 + 1000) / 2 = 750ms
    expect(metrics.averageSuccessDurationMs).toBe(750);

    // Average failure duration: 2000ms
    expect(metrics.averageFailureDurationMs).toBe(2000);
  });

  it('should handle empty database gracefully', async () => {
    const metrics = await repository.getExecutionMetrics();

    expect(metrics.totalNotifications).toBe(0);
    expect(metrics.successfulFirstAttempt).toBe(0);
    expect(metrics.successfulAfterRetry).toBe(0);
    expect(metrics.permanentFailures).toBe(0);
    expect(metrics.totalRetryAttempts).toBe(0);
    expect(metrics.averageRetriesPerNotification).toBe(0);
    expect(metrics.averageSuccessDurationMs).toBe(0);
    expect(metrics.averageFailureDurationMs).toBe(0);
  });

  it('should only count COMPLETED and FAILED notifications, not PENDING', async () => {
    // Create pending notification (not yet processed)
    await repository.create({
      payload: { test: 'pending' },
      notificationType: NotificationType.DISCORD,
      targetRecipient: 'webhook',
      executeAt: new Date(Date.now() + 60000), // Future
      maxRetries: 3,
    });

    // Create completed notification
    const completedId = await repository.create({
      payload: { test: 'completed' },
      notificationType: NotificationType.DISCORD,
      targetRecipient: 'webhook',
      executeAt: new Date(),
      maxRetries: 3,
    });
    await repository.logExecution({
      scheduledNotificationId: completedId,
      executionAttempt: 1,
      executionTime: new Date(),
      status: 'SUCCESS',
      durationMs: 500,
    });
    await repository.markAsCompleted(completedId);

    // Get metrics
    const metrics = await repository.getExecutionMetrics();

    // Should only count the completed notification
    expect(metrics.totalNotifications).toBe(1);
    expect(metrics.successfulFirstAttempt).toBe(1);
  });
});
