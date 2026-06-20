/**
 * Integration tests for execution metrics API endpoints
 * Verifies that the API properly exposes deduplicated metrics
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import http from 'http';
import { Database } from '../database/database';
import { ScheduledNotificationRepository } from '../services/scheduled-notification-repository';
import { NotificationAPI } from '../services/notification-api';
import { createEventsServer, EventsServerOptions } from './events-server';
import { NotificationType } from '../types/scheduled-notification';
import path from 'path';
import fs from 'fs/promises';

describe('Execution Metrics API Integration', () => {
  let db: Database;
  let repository: ScheduledNotificationRepository;
  let notificationAPI: NotificationAPI;
  let server: http.Server;
  let serverUrl: string;
  const testDbPath = path.join(__dirname, '../../test-data/test-api-metrics.db');
  const testPort = 38080;

  beforeEach(async () => {
    // Clean up any existing test database
    try {
      await fs.unlink(testDbPath);
    } catch {
      // File doesn't exist, ignore
    }

    // Create fresh database and services
    db = new Database(testDbPath);
    await db.initialize();
    repository = new ScheduledNotificationRepository(db);
    notificationAPI = new NotificationAPI(repository);

    // Start test server
    const options: EventsServerOptions = {
      port: testPort,
      stellarRpcUrl: 'https://soroban-testnet.stellar.org',
      notificationAPI,
    };

    server = createEventsServer(options);
    await new Promise<void>((resolve) => {
      server.listen(testPort, () => resolve());
    });

    serverUrl = `http://localhost:${testPort}`;
  });

  afterEach(async () => {
    // Close server
    await new Promise<void>((resolve, reject) => {
      server.close((err) => {
        if (err) reject(err);
        else resolve();
      });
    });

    // Close database
    await db.close();

    // Clean up test database
    try {
      await fs.unlink(testDbPath);
    } catch {
      // Ignore cleanup errors
    }
  });

  /**
   * CRITICAL REGRESSION TEST: API should return deduplicated metrics
   */
  it('GET /api/schedule/execution-metrics should return deduplicated metrics for retried notifications', async () => {
    // Create a notification that fails twice, then succeeds
    const notificationId = await repository.create({
      payload: { test: 'data' },
      notificationType: NotificationType.DISCORD,
      targetRecipient: 'webhook-url',
      executeAt: new Date(),
      maxRetries: 3,
    });

    // Log 2 retries + 1 success (3 execution log entries)
    await repository.logExecution({
      scheduledNotificationId: notificationId,
      executionAttempt: 1,
      executionTime: new Date(),
      status: 'RETRY',
      errorMessage: 'Network timeout',
      durationMs: 1000,
    });
    await repository.markAsFailedOrRetry(notificationId, new Error('Network timeout'), 0, 3);

    await repository.logExecution({
      scheduledNotificationId: notificationId,
      executionAttempt: 2,
      executionTime: new Date(),
      status: 'RETRY',
      errorMessage: 'Service unavailable',
      durationMs: 1500,
    });
    await repository.markAsFailedOrRetry(notificationId, new Error('Service unavailable'), 1, 3);

    await repository.logExecution({
      scheduledNotificationId: notificationId,
      executionAttempt: 3,
      executionTime: new Date(),
      status: 'SUCCESS',
      durationMs: 800,
    });
    await repository.markAsCompleted(notificationId);

    // Make API request
    const response = await fetch(`${serverUrl}/api/schedule/execution-metrics`);
    expect(response.status).toBe(200);

    const metrics = await response.json();

    // CRITICAL ASSERTION: Must return deduplicated metrics
    expect(metrics.totalNotifications).toBe(1);
    expect(metrics.successfulFirstAttempt).toBe(0);
    expect(metrics.successfulAfterRetry).toBe(1); // ← EXACTLY 1, NOT 3
    expect(metrics.permanentFailures).toBe(0);
    expect(metrics.totalRetryAttempts).toBe(2);
    expect(metrics.averageRetriesPerNotification).toBe(2);
  });

  it('GET /api/schedule/retry-distribution should return retry breakdown', async () => {
    // Create notifications with different retry patterns
    // 0 retries: 1 success
    const success1 = await repository.create({
      payload: { test: '1' },
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

    // 1 retry: 1 success
    const success2 = await repository.create({
      payload: { test: '2' },
      notificationType: NotificationType.DISCORD,
      targetRecipient: 'webhook',
      executeAt: new Date(),
      maxRetries: 3,
    });
    await repository.logExecution({
      scheduledNotificationId: success2,
      executionAttempt: 1,
      executionTime: new Date(),
      status: 'RETRY',
      errorMessage: 'Error',
      durationMs: 1000,
    });
    await repository.markAsFailedOrRetry(success2, new Error('Error'), 0, 3);
    await repository.logExecution({
      scheduledNotificationId: success2,
      executionAttempt: 2,
      executionTime: new Date(),
      status: 'SUCCESS',
      durationMs: 600,
    });
    await repository.markAsCompleted(success2);

    // 2 retries: 1 failure
    const failure = await repository.create({
      payload: { test: '3' },
      notificationType: NotificationType.DISCORD,
      targetRecipient: 'webhook',
      executeAt: new Date(),
      maxRetries: 2,
    });
    await repository.logExecution({
      scheduledNotificationId: failure,
      executionAttempt: 1,
      executionTime: new Date(),
      status: 'RETRY',
      errorMessage: 'Error 1',
      durationMs: 1000,
    });
    await repository.markAsFailedOrRetry(failure, new Error('Error 1'), 0, 2);
    await repository.logExecution({
      scheduledNotificationId: failure,
      executionAttempt: 2,
      executionTime: new Date(),
      status: 'RETRY',
      errorMessage: 'Error 2',
      durationMs: 1100,
    });
    await repository.markAsFailedOrRetry(failure, new Error('Error 2'), 1, 2);
    await repository.logExecution({
      scheduledNotificationId: failure,
      executionAttempt: 3,
      executionTime: new Date(),
      status: 'FAILED',
      errorMessage: 'Error 3',
      durationMs: 1200,
    });
    await repository.markAsFailedOrRetry(failure, new Error('Error 3'), 2, 2);

    // Make API request
    const response = await fetch(`${serverUrl}/api/schedule/retry-distribution`);
    expect(response.status).toBe(200);

    const distribution = await response.json();

    // Verify distribution structure
    expect(Array.isArray(distribution)).toBe(true);
    expect(distribution.length).toBe(3);

    // Check each retry level
    const retries0 = distribution.find((d: any) => d.retryCount === 0);
    expect(retries0.successCount).toBe(1);
    expect(retries0.failureCount).toBe(0);

    const retries1 = distribution.find((d: any) => d.retryCount === 1);
    expect(retries1.successCount).toBe(1);
    expect(retries1.failureCount).toBe(0);

    const retries2 = distribution.find((d: any) => d.retryCount === 2);
    expect(retries2.successCount).toBe(0);
    expect(retries2.failureCount).toBe(1);
  });

  it('should return 503 when scheduler is not enabled', async () => {
    // Create server without notification API
    await new Promise<void>((resolve, reject) => {
      server.close((err) => {
        if (err) reject(err);
        else resolve();
      });
    });

    const options: EventsServerOptions = {
      port: testPort,
      stellarRpcUrl: 'https://soroban-testnet.stellar.org',
      notificationAPI: null,
    };

    server = createEventsServer(options);
    await new Promise<void>((resolve) => {
      server.listen(testPort, () => resolve());
    });

    // Both endpoints should return 503
    const metricsResponse = await fetch(`${serverUrl}/api/schedule/execution-metrics`);
    expect(metricsResponse.status).toBe(503);

    const distributionResponse = await fetch(`${serverUrl}/api/schedule/retry-distribution`);
    expect(distributionResponse.status).toBe(503);
  });

  it('should handle CORS preflight requests', async () => {
    const response = await fetch(`${serverUrl}/api/schedule/execution-metrics`, {
      method: 'OPTIONS',
    });

    expect(response.status).toBe(204);
    expect(response.headers.get('Access-Control-Allow-Origin')).toBeTruthy();
    expect(response.headers.get('Access-Control-Allow-Methods')).toContain('GET');
  });

  /**
   * Test that verifies the old stats endpoint is still available
   * (backwards compatibility)
   */
  it('GET /api/schedule/stats should still work for notification-level statistics', async () => {
    // Create some notifications in different states
    await repository.create({
      payload: { test: 'pending' },
      notificationType: NotificationType.DISCORD,
      targetRecipient: 'webhook',
      executeAt: new Date(Date.now() + 60000),
      maxRetries: 3,
    });

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

    // Make API request
    const response = await fetch(`${serverUrl}/api/schedule/stats`);
    expect(response.status).toBe(200);

    const stats = await response.json();

    // Verify structure
    expect(stats).toHaveProperty('pending');
    expect(stats).toHaveProperty('processing');
    expect(stats).toHaveProperty('completed');
    expect(stats).toHaveProperty('failed');
    expect(stats).toHaveProperty('overdue');

    expect(stats.pending).toBe(1);
    expect(stats.completed).toBe(1);
  });
});
