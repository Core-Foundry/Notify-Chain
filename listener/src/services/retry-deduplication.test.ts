/**
 * Additional regression tests for retry deduplication
 * Focuses on edge cases and complex scenarios to prevent future regressions
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { Database } from '../database/database';
import { ScheduledNotificationRepository } from './scheduled-notification-repository';
import { NotificationStatus, NotificationType } from '../types/scheduled-notification';
import path from 'path';
import fs from 'fs/promises';

describe('Retry Deduplication - Edge Cases', () => {
  let db: Database;
  let repository: ScheduledNotificationRepository;
  const testDbPath = path.join(__dirname, '../../test-data/test-retry-dedup.db');

  beforeEach(async () => {
    // Clean up any existing test database
    try {
      await fs.unlink(testDbPath);
      await fs.unlink(testDbPath + '-journal').catch(() => {});
      await fs.unlink(testDbPath + '-wal').catch(() => {});
      await fs.unlink(testDbPath + '-shm').catch(() => {});
    } catch {
      // File doesn't exist, ignore
    }

    await new Promise(resolve => setTimeout(resolve, 100));

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
   * EDGE CASE 1: Maximum retries exhausted (all failures)
   * Ensures that a notification with max retries (3 attempts) only counts as 1 failure
   */
  it('should count max-retry exhausted notification as exactly 1 failure', async () => {
    const notificationId = await repository.create({
      payload: { test: 'max-retries' },
      notificationType: NotificationType.DISCORD,
      targetRecipient: 'webhook-url',
      executeAt: new Date(),
      maxRetries: 2, // 0, 1, 2 = 3 total attempts
    });

    // Simulate 3 failed attempts
    for (let attempt = 1; attempt <= 3; attempt++) {
      const isLastAttempt = attempt === 3;
      await repository.logExecution({
        scheduledNotificationId: notificationId,
        executionAttempt: attempt,
        executionTime: new Date(),
        status: isLastAttempt ? 'FAILED' : 'RETRY',
        errorMessage: `Attempt ${attempt} failed`,
        durationMs: 1000 + (attempt * 100),
      });

      if (!isLastAttempt) {
        await repository.markAsFailedOrRetry(
          notificationId,
          new Error(`Attempt ${attempt} failed`),
          attempt - 1,
          2
        );
      } else {
        // Final failure
        await repository.markAsFailedOrRetry(
          notificationId,
          new Error('Final failure'),
          2,
          2
        );
      }
    }

    const metrics = await repository.getExecutionMetrics();

    // CRITICAL: Should count as exactly 1 failure, not 3
    expect(metrics.totalNotifications).toBe(1);
    expect(metrics.permanentFailures).toBe(1);
    expect(metrics.successfulFirstAttempt).toBe(0);
    expect(metrics.successfulAfterRetry).toBe(0);
    expect(metrics.totalRetryAttempts).toBe(2); // 2 retries before final failure
  });

  /**
   * EDGE CASE 2: Immediate success (zero retries)
   * Ensures first-attempt success doesn't inflate metrics
   */
  it('should count immediate success as exactly 1 success with 0 retries', async () => {
    const notificationId = await repository.create({
      payload: { test: 'immediate-success' },
      notificationType: NotificationType.DISCORD,
      targetRecipient: 'webhook-url',
      executeAt: new Date(),
      maxRetries: 3,
    });

    await repository.logExecution({
      scheduledNotificationId: notificationId,
      executionAttempt: 1,
      executionTime: new Date(),
      status: 'SUCCESS',
      durationMs: 500,
    });
    await repository.markAsCompleted(notificationId);

    const metrics = await repository.getExecutionMetrics();

    expect(metrics.totalNotifications).toBe(1);
    expect(metrics.successfulFirstAttempt).toBe(1);
    expect(metrics.successfulAfterRetry).toBe(0);
    expect(metrics.permanentFailures).toBe(0);
    expect(metrics.totalRetryAttempts).toBe(0);
    expect(metrics.averageRetriesPerNotification).toBe(0);
  });

  /**
   * EDGE CASE 3: Success on last possible attempt
   * Tests boundary condition where notification succeeds on the final retry
   */
  it('should handle success on final retry attempt correctly', async () => {
    const notificationId = await repository.create({
      payload: { test: 'last-chance-success' },
      notificationType: NotificationType.DISCORD,
      targetRecipient: 'webhook-url',
      executeAt: new Date(),
      maxRetries: 2, // Allows 3 total attempts
    });

    // First attempt: RETRY
    await repository.logExecution({
      scheduledNotificationId: notificationId,
      executionAttempt: 1,
      executionTime: new Date(),
      status: 'RETRY',
      errorMessage: 'First attempt failed',
      durationMs: 1000,
    });
    await repository.markAsFailedOrRetry(notificationId, new Error('First attempt failed'), 0, 2);

    // Second attempt: RETRY
    await repository.logExecution({
      scheduledNotificationId: notificationId,
      executionAttempt: 2,
      executionTime: new Date(),
      status: 'RETRY',
      errorMessage: 'Second attempt failed',
      durationMs: 1100,
    });
    await repository.markAsFailedOrRetry(notificationId, new Error('Second attempt failed'), 1, 2);

    // Third attempt: SUCCESS (last chance)
    await repository.logExecution({
      scheduledNotificationId: notificationId,
      executionAttempt: 3,
      executionTime: new Date(),
      status: 'SUCCESS',
      durationMs: 900,
    });
    await repository.markAsCompleted(notificationId);

    const metrics = await repository.getExecutionMetrics();

    expect(metrics.totalNotifications).toBe(1);
    expect(metrics.successfulFirstAttempt).toBe(0);
    expect(metrics.successfulAfterRetry).toBe(1); // ← Success on final attempt
    expect(metrics.permanentFailures).toBe(0);
    expect(metrics.totalRetryAttempts).toBe(2);
  });

  /**
   * EDGE CASE 4: High-volume scenario with mixed outcomes
   * Simulates realistic production load with various retry patterns
   */
  it('should accurately deduplicate in high-volume mixed-outcome scenario', async () => {
    const outcomes = {
      immediateSuccess: 0,
      retrySuccess: 0,
      failures: 0,
    };

    // Create 100 notifications with different patterns
    for (let i = 0; i < 100; i++) {
      const notificationId = await repository.create({
        payload: { test: `batch-${i}` },
        notificationType: NotificationType.DISCORD,
        targetRecipient: 'webhook-url',
        executeAt: new Date(),
        maxRetries: 3,
      });

      const pattern = i % 4; // 4 different patterns

      if (pattern === 0) {
        // 25% immediate success
        await repository.logExecution({
          scheduledNotificationId: notificationId,
          executionAttempt: 1,
          executionTime: new Date(),
          status: 'SUCCESS',
          durationMs: 500,
        });
        await repository.markAsCompleted(notificationId);
        outcomes.immediateSuccess++;
      } else if (pattern === 1) {
        // 25% success after 1 retry
        await repository.logExecution({
          scheduledNotificationId: notificationId,
          executionAttempt: 1,
          executionTime: new Date(),
          status: 'RETRY',
          errorMessage: 'Temporary error',
          durationMs: 1000,
        });
        await repository.markAsFailedOrRetry(notificationId, new Error('Temporary error'), 0, 3);
        await repository.logExecution({
          scheduledNotificationId: notificationId,
          executionAttempt: 2,
          executionTime: new Date(),
          status: 'SUCCESS',
          durationMs: 600,
        });
        await repository.markAsCompleted(notificationId);
        outcomes.retrySuccess++;
      } else if (pattern === 2) {
        // 25% success after 2 retries
        for (let attempt = 1; attempt <= 3; attempt++) {
          const isSuccess = attempt === 3;
          await repository.logExecution({
            scheduledNotificationId: notificationId,
            executionAttempt: attempt,
            executionTime: new Date(),
            status: isSuccess ? 'SUCCESS' : 'RETRY',
            errorMessage: isSuccess ? undefined : `Attempt ${attempt} failed`,
            durationMs: 500 + (attempt * 100),
          });

          if (!isSuccess) {
            await repository.markAsFailedOrRetry(
              notificationId,
              new Error(`Attempt ${attempt} failed`),
              attempt - 1,
              3
            );
          } else {
            await repository.markAsCompleted(notificationId);
          }
        }
        outcomes.retrySuccess++;
      } else {
        // 25% permanent failure after 3 attempts
        for (let attempt = 1; attempt <= 4; attempt++) {
          const isFinalFailure = attempt === 4;
          await repository.logExecution({
            scheduledNotificationId: notificationId,
            executionAttempt: attempt,
            executionTime: new Date(),
            status: isFinalFailure ? 'FAILED' : 'RETRY',
            errorMessage: `Attempt ${attempt} failed`,
            durationMs: 1000 + (attempt * 100),
          });
          await repository.markAsFailedOrRetry(
            notificationId,
            new Error(`Attempt ${attempt} failed`),
            attempt - 1,
            3
          );
        }
        outcomes.failures++;
      }
    }

    const metrics = await repository.getExecutionMetrics();

    // Verify exact counts
    expect(metrics.totalNotifications).toBe(100);
    expect(metrics.successfulFirstAttempt).toBe(outcomes.immediateSuccess);
    expect(metrics.successfulAfterRetry).toBe(outcomes.retrySuccess);
    expect(metrics.permanentFailures).toBe(outcomes.failures);

    // Verify no double-counting: sum should equal total
    const sum =
      metrics.successfulFirstAttempt +
      metrics.successfulAfterRetry +
      metrics.permanentFailures;
    expect(sum).toBe(metrics.totalNotifications);
  });

  /**
   * EDGE CASE 5: Pending notifications should be excluded
   * Ensures in-progress or scheduled-but-not-executed notifications don't affect metrics
   */
  it('should exclude PENDING and PROCESSING notifications from metrics', async () => {
    // Create completed notification
    const completedId = await repository.create({
      payload: { test: 'completed' },
      notificationType: NotificationType.DISCORD,
      targetRecipient: 'webhook-url',
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

    // Create pending notification (future execution)
    await repository.create({
      payload: { test: 'pending' },
      notificationType: NotificationType.DISCORD,
      targetRecipient: 'webhook-url',
      executeAt: new Date(Date.now() + 60000), // 1 minute in future
      maxRetries: 3,
    });

    // Create processing notification (locked but not yet completed)
    const processingId = await repository.create({
      payload: { test: 'processing' },
      notificationType: NotificationType.DISCORD,
      targetRecipient: 'webhook-url',
      executeAt: new Date(),
      maxRetries: 3,
    });
    // Lock it by fetching
    await repository.fetchAndLockPendingNotifications('test-processor', 60000, 10);

    const metrics = await repository.getExecutionMetrics();

    // Should only count the completed notification
    expect(metrics.totalNotifications).toBe(1);
    expect(metrics.successfulFirstAttempt).toBe(1);
  });

  /**
   * EDGE CASE 6: Cancelled notifications
   * Ensures cancelled notifications don't affect metrics
   */
  it('should exclude CANCELLED notifications from metrics', async () => {
    // Create and complete one notification
    const completedId = await repository.create({
      payload: { test: 'completed' },
      notificationType: NotificationType.DISCORD,
      targetRecipient: 'webhook-url',
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

    // Create and cancel another notification
    const cancelledId = await repository.create({
      payload: { test: 'cancelled' },
      notificationType: NotificationType.DISCORD,
      targetRecipient: 'webhook-url',
      executeAt: new Date(Date.now() + 60000),
      maxRetries: 3,
    });
    await repository.cancel(cancelledId);

    const metrics = await repository.getExecutionMetrics();

    // Should only count the completed notification
    expect(metrics.totalNotifications).toBe(1);
    expect(metrics.successfulFirstAttempt).toBe(1);
  });

  /**
   * EDGE CASE 7: Notification with no execution log entries
   * Edge case where notification is marked completed but has no log entries
   */
  it('should handle notifications without execution log entries', async () => {
    const notificationId = await repository.create({
      payload: { test: 'no-logs' },
      notificationType: NotificationType.DISCORD,
      targetRecipient: 'webhook-url',
      executeAt: new Date(),
      maxRetries: 3,
    });

    // Mark as completed without logging execution (edge case/bug scenario)
    await repository.markAsCompleted(notificationId);

    const metrics = await repository.getExecutionMetrics();

    // Should still count the notification
    expect(metrics.totalNotifications).toBe(1);
    // Without log entry, final_execution_status will be NULL
    // The query should handle this gracefully
  });

  /**
   * EDGE CASE 8: Concurrent retry scenarios
   * Simulates multiple notifications being retried simultaneously
   */
  it('should handle concurrent retry patterns without cross-contamination', async () => {
    const notification1 = await repository.create({
      payload: { test: 'concurrent-1' },
      notificationType: NotificationType.DISCORD,
      targetRecipient: 'webhook-1',
      executeAt: new Date(),
      maxRetries: 3,
    });

    const notification2 = await repository.create({
      payload: { test: 'concurrent-2' },
      notificationType: NotificationType.DISCORD,
      targetRecipient: 'webhook-2',
      executeAt: new Date(),
      maxRetries: 3,
    });

    // Interleave execution logs
    await repository.logExecution({
      scheduledNotificationId: notification1,
      executionAttempt: 1,
      executionTime: new Date(),
      status: 'RETRY',
      errorMessage: 'N1 attempt 1',
      durationMs: 1000,
    });

    await repository.logExecution({
      scheduledNotificationId: notification2,
      executionAttempt: 1,
      executionTime: new Date(),
      status: 'RETRY',
      errorMessage: 'N2 attempt 1',
      durationMs: 1100,
    });

    await repository.logExecution({
      scheduledNotificationId: notification1,
      executionAttempt: 2,
      executionTime: new Date(),
      status: 'SUCCESS',
      durationMs: 900,
    });
    await repository.markAsCompleted(notification1);

    await repository.logExecution({
      scheduledNotificationId: notification2,
      executionAttempt: 2,
      executionTime: new Date(),
      status: 'RETRY',
      errorMessage: 'N2 attempt 2',
      durationMs: 1200,
    });

    await repository.logExecution({
      scheduledNotificationId: notification2,
      executionAttempt: 3,
      executionTime: new Date(),
      status: 'SUCCESS',
      durationMs: 800,
    });
    await repository.markAsCompleted(notification2);

    const metrics = await repository.getExecutionMetrics();

    // Each notification should be counted exactly once
    expect(metrics.totalNotifications).toBe(2);
    expect(metrics.successfulFirstAttempt).toBe(0);
    expect(metrics.successfulAfterRetry).toBe(2);
    expect(metrics.totalRetryAttempts).toBe(3); // N1: 1 retry, N2: 2 retries
  });

  /**
   * EDGE CASE 9: Very high retry counts
   * Tests notifications that require many retries before success
   */
  it('should accurately track notifications with high retry counts', async () => {
    const notificationId = await repository.create({
      payload: { test: 'high-retries' },
      notificationType: NotificationType.DISCORD,
      targetRecipient: 'webhook-url',
      executeAt: new Date(),
      maxRetries: 9, // Allow up to 10 total attempts
    });

    // 9 failures, then success on 10th attempt
    for (let attempt = 1; attempt <= 10; attempt++) {
      const isSuccess = attempt === 10;
      await repository.logExecution({
        scheduledNotificationId: notificationId,
        executionAttempt: attempt,
        executionTime: new Date(),
        status: isSuccess ? 'SUCCESS' : 'RETRY',
        errorMessage: isSuccess ? undefined : `Attempt ${attempt} failed`,
        durationMs: 500 + (attempt * 50),
      });

      if (!isSuccess) {
        await repository.markAsFailedOrRetry(
          notificationId,
          new Error(`Attempt ${attempt} failed`),
          attempt - 1,
          9
        );
      } else {
        await repository.markAsCompleted(notificationId);
      }
    }

    const metrics = await repository.getExecutionMetrics();

    expect(metrics.totalNotifications).toBe(1);
    expect(metrics.successfulFirstAttempt).toBe(0);
    expect(metrics.successfulAfterRetry).toBe(1); // Still just 1 success
    expect(metrics.totalRetryAttempts).toBe(9); // 9 retries before success
  });

  /**
   * EDGE CASE 10: Verify retry distribution accuracy
   * Ensures getRetryDistribution() also uses deduplication
   */
  it('should provide accurate retry distribution without double-counting', async () => {
    // Create notifications with specific retry patterns
    const patterns = [
      { retries: 0, shouldSucceed: true, count: 5 },   // 5 immediate successes
      { retries: 1, shouldSucceed: true, count: 3 },   // 3 success after 1 retry
      { retries: 2, shouldSucceed: true, count: 2 },   // 2 success after 2 retries
      { retries: 3, shouldSucceed: false, count: 1 },  // 1 failure after 3 retries
    ];

    for (const pattern of patterns) {
      for (let i = 0; i < pattern.count; i++) {
        const notificationId = await repository.create({
          payload: { test: `pattern-${pattern.retries}-${i}` },
          notificationType: NotificationType.DISCORD,
          targetRecipient: 'webhook-url',
          executeAt: new Date(),
          maxRetries: 3,
        });

        // Create retry attempts
        for (let attempt = 1; attempt <= pattern.retries + 1; attempt++) {
          const isFinalAttempt = attempt === pattern.retries + 1;
          const status = isFinalAttempt
            ? (pattern.shouldSucceed ? 'SUCCESS' : 'FAILED')
            : 'RETRY';

          await repository.logExecution({
            scheduledNotificationId: notificationId,
            executionAttempt: attempt,
            executionTime: new Date(),
            status,
            errorMessage: status === 'SUCCESS' ? undefined : `Attempt ${attempt} failed`,
            durationMs: 500 + (attempt * 100),
          });

          if (isFinalAttempt && pattern.shouldSucceed) {
            await repository.markAsCompleted(notificationId);
          } else if (!isFinalAttempt || !pattern.shouldSucceed) {
            await repository.markAsFailedOrRetry(
              notificationId,
              new Error(`Attempt ${attempt} failed`),
              attempt - 1,
              3
            );
          }
        }
      }
    }

    const distribution = await repository.getRetryDistribution();

    // Verify distribution matches expected patterns
    const retries0 = distribution.find(d => d.retryCount === 0);
    expect(retries0?.successCount).toBe(5);
    expect(retries0?.failureCount).toBe(0);

    const retries1 = distribution.find(d => d.retryCount === 1);
    expect(retries1?.successCount).toBe(3);
    expect(retries1?.failureCount).toBe(0);

    const retries2 = distribution.find(d => d.retryCount === 2);
    expect(retries2?.successCount).toBe(2);
    expect(retries2?.failureCount).toBe(0);

    const retries3 = distribution.find(d => d.retryCount === 3);
    expect(retries3?.successCount).toBe(0);
    expect(retries3?.failureCount).toBe(1);

    // Total should equal sum of all counts
    const totalFromDistribution = distribution.reduce(
      (sum, d) => sum + d.successCount + d.failureCount,
      0
    );
    expect(totalFromDistribution).toBe(11); // 5 + 3 + 2 + 1
  });
});
