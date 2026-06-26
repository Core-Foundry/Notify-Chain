/**
 * End-to-end tests for the scheduled notification lifecycle:
 * creation → delayed execution → delivery → cleanup.
 */

import * as fs from 'fs';
import * as path from 'path';
import { Database } from '../database/database';
import { ScheduledNotificationRepository } from '../services/scheduled-notification-repository';
import { NotificationScheduler } from '../services/notification-scheduler';
import { NotificationAPI } from '../services/notification-api';
import { DiscordNotificationService } from '../services/discord-notification';
import { CleanupService } from '../services/cleanup-service';
import { resetWorkerManager } from '../services/worker-manager';
import { EventRegistry } from '../store/event-registry';
import { NotificationFixtureBuilder } from '../test-utils/notification-fixture-builder';
import { NotificationStatus, NotificationType } from '../types/scheduled-notification';

jest.mock('../utils/logger', () => ({
  __esModule: true,
  default: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

describe('Scheduled notification lifecycle (e2e)', () => {
  const testDbPath = './data/test-scheduled-lifecycle.db';
  let db: Database;
  let repository: ScheduledNotificationRepository;
  let api: NotificationAPI;
  let scheduler: NotificationScheduler;
  let sendEventMock: jest.Mock;

  const schedulerConfig = {
    enabled: true,
    pollIntervalMs: 100,
    lockTimeoutMs: 30000,
    batchSize: 10,
    timingBufferMs: 0,
    processorId: 'e2e-processor',
  };

  beforeAll(async () => {
    const dbDir = path.dirname(testDbPath);
    if (!fs.existsSync(dbDir)) fs.mkdirSync(dbDir, { recursive: true });
    if (fs.existsSync(testDbPath)) fs.unlinkSync(testDbPath);

    db = new Database(testDbPath);
    await db.initialize();
    repository = new ScheduledNotificationRepository(db);
    api = new NotificationAPI(repository);
  });

  afterAll(async () => {
    await scheduler?.stop();
    await db.close();
    if (fs.existsSync(testDbPath)) fs.unlinkSync(testDbPath);
  });

  beforeEach(async () => {
    resetWorkerManager();
    jest.clearAllMocks();

    await db.run('DELETE FROM notification_execution_log');
    await db.run('DELETE FROM scheduled_notifications');

    sendEventMock = jest.fn().mockResolvedValue(true);
    const discordService = {
      sendEventNotification: sendEventMock,
    } as unknown as DiscordNotificationService;

    scheduler = new NotificationScheduler(repository, schedulerConfig, discordService);
  });

  afterEach(async () => {
    await scheduler.stop();
  });

  async function waitForSchedulerPolls(ms = 300): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, ms));
  }

  function schedulerPayload() {
    const event = NotificationFixtureBuilder.aStellarEvent().withId('sched-e2e-1').build();
    const contractConfig = NotificationFixtureBuilder.aContractConfig().build();
    return { event, contractConfig, message: 'Scheduled bounty alert' };
  }

  async function createDueNotification() {
    return repository.create(
      NotificationFixtureBuilder.aScheduledNotificationInput()
        .forImmediateExecution()
        .withPayload(schedulerPayload())
        .withTargetRecipient(NotificationFixtureBuilder.constants.webhookUrl)
        .build()
    );
  }

  it('schedules a notification and delivers it after the poll interval', async () => {
    const executeAt = new Date(Date.now() + 50);

    const id = await api.scheduleNotification({
      payload: schedulerPayload(),
      notificationType: NotificationType.DISCORD,
      targetRecipient: NotificationFixtureBuilder.constants.webhookUrl,
      executeAt,
      maxRetries: 2,
    });

    let notification = await repository.getById(id);
    expect(notification!.status).toBe(NotificationStatus.PENDING);

    await scheduler.start();
    await waitForSchedulerPolls(400);

    notification = await repository.getById(id);
    expect(notification!.status).toBe(NotificationStatus.COMPLETED);
    expect(sendEventMock).toHaveBeenCalledTimes(1);

    const logs = await db.all(
      'SELECT * FROM notification_execution_log WHERE scheduled_notification_id = ?',
      [id]
    );
    expect(logs).toHaveLength(1);
    expect(logs[0].status).toBe('SUCCESS');
  });

  it('does not deliver notifications before their executeAt time', async () => {
    const executeAt = new Date(Date.now() + 60_000);

    const id = await api.scheduleNotification({
      payload: schedulerPayload(),
      notificationType: NotificationType.DISCORD,
      targetRecipient: NotificationFixtureBuilder.constants.webhookUrl,
      executeAt,
    });

    await scheduler.start();
    await waitForSchedulerPolls(250);

    const notification = await repository.getById(id);
    expect(notification!.status).toBe(NotificationStatus.PENDING);
    expect(sendEventMock).not.toHaveBeenCalled();
  });

  it('delivers when executeAt elapses after scheduling', async () => {
    const executeAt = new Date(Date.now() + 200);

    const id = await api.scheduleNotification({
      payload: schedulerPayload(),
      notificationType: NotificationType.DISCORD,
      targetRecipient: NotificationFixtureBuilder.constants.webhookUrl,
      executeAt,
    });

    await scheduler.start();
    await waitForSchedulerPolls(150);
    expect((await repository.getById(id))!.status).toBe(NotificationStatus.PENDING);

    await new Promise((resolve) => setTimeout(resolve, 250));
    await waitForSchedulerPolls(300);

    expect((await repository.getById(id))!.status).toBe(NotificationStatus.COMPLETED);
    expect(sendEventMock).toHaveBeenCalledTimes(1);
  });

  it('runs cleanup after completed notifications age past retention', async () => {
    const id = await createDueNotification();

    await scheduler.start();
    await waitForSchedulerPolls(300);
    expect((await repository.getById(id))!.status).toBe(NotificationStatus.COMPLETED);

    const registry = new EventRegistry();
    const cleanup = new CleanupService(db, registry, {
      intervalMs: 60_000,
      notificationRetentionMs: 1,
      rateLimitEventRetentionMs: 1,
    });

    await new Promise((resolve) => setTimeout(resolve, 5));
    const result = await cleanup.runDbCleanup();

    expect(result.notifications).toBeGreaterThanOrEqual(1);
    expect(await repository.getById(id)).toBeNull();
  });
});
