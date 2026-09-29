import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as waitForIO } from 'node:timers/promises';
import { Database } from '../database/database';
import { NotificationScheduler } from '../services/notification-scheduler';
import { ScheduledNotificationRepository } from '../services/scheduled-notification-repository';
import { ProviderRegistry } from '../services/provider-registry';
import { getWorkerManager, resetWorkerManager } from '../services/worker-manager';
import { resetJobMonitor } from '../services/job-monitor';
import { resetStatsCache } from '../services/notification-stats-cache';
import { DeliveryPayload, DeliveryResult } from '../types/provider-capabilities';
import { NotificationStatus, NotificationType } from '../types/scheduled-notification';
import logger from '../utils/logger';

jest.mock('../utils/logger', () => ({
  __esModule: true,
  default: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

const POLL_MS = 100;
const LOCK_MS = 60_000;
const START = new Date('2030-01-01T00:00:00.000Z');
const delivered: DeliveryResult = { success: true, degradedCapabilities: [] };

// Fake timers control scheduling, but SQLite callbacks still need real I/O turns.
async function waitUntil(predicate: () => boolean): Promise<void> {
  for (let attempt = 0; attempt < 400; attempt++) {
    if (predicate()) return;
    await waitForIO(10);
  }
  throw new Error('Scheduler did not finish the expected operation');
}

describe('NotificationScheduler restart with persisted SQLite jobs', () => {
  let directory: string;
  let db: Database;
  let repository: ScheduledNotificationRepository;
  let scheduler: NotificationScheduler;
  let deliver: jest.Mock<Promise<DeliveryResult>, [DeliveryPayload]>;
  let releaseDelivery: (() => void) | undefined;

  async function openProcess(processorId: string): Promise<void> {
    db = new Database(join(directory, 'notifications.db'));
    await db.initialize();
    repository = new ScheduledNotificationRepository(db);
    const providers = new ProviderRegistry().register({
      metadata: {
        id: NotificationType.WEBHOOK,
        name: 'Test delivery provider',
        version: '1.0.0',
        capabilities: new Set(),
      },
      hasCapability: () => false,
      deliver,
    });
    scheduler = new NotificationScheduler(
      repository,
      {
        enabled: true,
        pollIntervalMs: POLL_MS,
        lockTimeoutMs: LOCK_MS,
        batchSize: 1,
        timingBufferMs: 0,
        processorId,
      },
      null,
      undefined,
      providers,
    );
  }

  async function restart(at: Date = new Date()): Promise<void> {
    await scheduler.stop();
    await db.close();
    // A restarted process has fresh in-memory workers, monitors and caches.
    // Reset only after the previous process has finished its active delivery.
    resetWorkerManager();
    resetJobMonitor();
    resetStatsCache();
    jest.setSystemTime(at);
    await openProcess('replacement-processor');
    await scheduler.start();
  }

  async function poll(): Promise<void> {
    await jest.advanceTimersByTimeAsync(POLL_MS);
    // The next timer is armed only after the real SQLite work has settled.
    await waitUntil(() => jest.getTimerCount() === 1);
  }

  function createJob(executeAt: Date = new Date()) {
    return repository.create({
      payload: { message: 'Scheduled restart notification' },
      notificationType: NotificationType.WEBHOOK,
      targetRecipient: 'https://example.com/notifications',
      executeAt,
      maxRetries: 3,
    });
  }

  function executionLog(id: number) {
    return db.all<{ status: string; execution_attempt: number }>(
      `SELECT status, execution_attempt FROM notification_execution_log
       WHERE scheduled_notification_id = ? ORDER BY id`,
      [id],
    );
  }

  beforeEach(async () => {
    jest.useFakeTimers({ now: START, doNotFake: ['nextTick', 'setImmediate'] });
    jest.clearAllMocks();
    resetWorkerManager();
    resetJobMonitor();
    resetStatsCache();
    directory = mkdtempSync(join(tmpdir(), 'scheduler-restart-'));
    deliver = jest.fn().mockResolvedValue(delivered);
    releaseDelivery = undefined;
    await openProcess('original-processor');
  });

  afterEach(async () => {
    releaseDelivery?.();
    await waitUntil(() => getWorkerManager().getActiveJobCount() === 0);
    const stopping = scheduler.stop();
    await jest.advanceTimersByTimeAsync(1_000);
    await stopping;
    await db.close();
    resetJobMonitor();
    resetStatsCache();
    rmSync(directory, { recursive: true, force: true });
    // Empty polls must succeed too; swallowed scheduler errors are not evidence
    // that a completed job or a valid lease was correctly left untouched.
    expect(logger.error).not.toHaveBeenCalledWith(
      'Error in scheduler processing loop',
      expect.anything(),
    );
  });

  it('recovers a pending job that became due while the process was stopped', async () => {
    const executeAt = new Date(START.getTime() + 10_000);
    const id = await createJob(executeAt);
    await scheduler.start();
    await poll();
    expect(deliver).not.toHaveBeenCalled();
    expect((await repository.getById(id))?.status).toBe(NotificationStatus.PENDING);

    await restart(new Date(executeAt.getTime() + 1_000));
    await poll();
    await poll();

    expect(deliver).toHaveBeenCalledTimes(1);
    expect(deliver).toHaveBeenCalledWith(
      expect.objectContaining({
        payload: { message: 'Scheduled restart notification' },
        targetRecipient: 'https://example.com/notifications',
      }),
    );
    expect((await repository.getById(id))?.status).toBe(NotificationStatus.COMPLETED);
    expect(await executionLog(id)).toEqual([{ status: 'SUCCESS', execution_attempt: 1 }]);
  });

  it('does not redeliver a completed job or append another execution after restart', async () => {
    const id = await createJob();
    await scheduler.start();
    await poll();
    const completed = await repository.getById(id);
    expect(completed?.status).toBe(NotificationStatus.COMPLETED);
    expect(deliver).toHaveBeenCalledTimes(1);

    await restart();
    await poll();
    await poll();

    expect(deliver).toHaveBeenCalledTimes(1);
    expect(await repository.getById(id)).toEqual(completed);
    expect(await executionLog(id)).toEqual([{ status: 'SUCCESS', execution_attempt: 1 }]);
  });

  it('finishes an in-flight delivery before graceful shutdown and does not resend it', async () => {
    const id = await createJob();
    deliver.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          releaseDelivery = () => resolve(delivered);
        }),
    );
    await scheduler.start();
    await jest.advanceTimersByTimeAsync(POLL_MS);
    await waitUntil(() => deliver.mock.calls.length === 1);
    expect((await repository.getById(id))?.status).toBe(NotificationStatus.PROCESSING);

    let stopped = false;
    const stopping = scheduler.stop().then(() => {
      stopped = true;
    });
    await jest.advanceTimersByTimeAsync(1_000);
    expect(stopped).toBe(false);
    expect(await executionLog(id)).toEqual([]);

    releaseDelivery!();
    await waitUntil(() => getWorkerManager().getActiveJobCount() === 0);
    await jest.advanceTimersByTimeAsync(1_000);
    await stopping;
    expect((await repository.getById(id))?.status).toBe(NotificationStatus.COMPLETED);

    await restart();
    await poll();
    await poll();

    expect(deliver).toHaveBeenCalledTimes(1);
    expect(await executionLog(id)).toEqual([{ status: 'SUCCESS', execution_attempt: 1 }]);
  });

  it('leaves a still-valid processing lease untouched after restart', async () => {
    const id = await createJob();
    await repository.fetchAndLockPendingNotifications('original-processor', LOCK_MS, 1);
    const locked = await repository.getById(id);
    expect(locked?.status).toBe(NotificationStatus.PROCESSING);

    await restart(new Date(START.getTime() + LOCK_MS / 2));
    await poll();
    await poll();

    expect(deliver).not.toHaveBeenCalled();
    expect(await repository.getById(id)).toEqual(locked);
    expect(await executionLog(id)).toEqual([]);
  });

  it('recovers an expired lease before delivery and records one retry and one success', async () => {
    const id = await createJob();
    await repository.fetchAndLockPendingNotifications('original-processor', LOCK_MS, 1);

    // Model a process that died after claiming the row, before outbound delivery.
    await restart(new Date(START.getTime() + LOCK_MS + 1));
    expect(await repository.getById(id)).toEqual(
      expect.objectContaining({
        status: NotificationStatus.PENDING,
        retryCount: 1,
        processorId: null,
      }),
    );
    await poll();
    await poll();

    expect(deliver).toHaveBeenCalledTimes(1);
    expect(await repository.getById(id)).toEqual(
      expect.objectContaining({
        status: NotificationStatus.COMPLETED,
        retryCount: 1,
        processorId: null,
      }),
    );
    expect(await executionLog(id)).toEqual([
      { status: 'RETRY', execution_attempt: 1 },
      { status: 'SUCCESS', execution_attempt: 2 },
    ]);
  });

  it('recovers a lease that expires after the replacement process has started', async () => {
    const id = await createJob();
    await repository.fetchAndLockPendingNotifications('original-processor', LOCK_MS, 1);

    await restart(new Date(START.getTime() + LOCK_MS / 2));
    await poll();
    expect(deliver).not.toHaveBeenCalled();
    expect((await repository.getById(id))?.status).toBe(NotificationStatus.PROCESSING);

    // Startup recovery cannot claim this row yet; a later poll must recover it.
    jest.setSystemTime(new Date(START.getTime() + LOCK_MS + 1));
    await poll();
    await poll();

    expect(deliver).toHaveBeenCalledTimes(1);
    expect((await repository.getById(id))?.status).toBe(NotificationStatus.COMPLETED);
    expect(await executionLog(id)).toEqual([
      { status: 'RETRY', execution_attempt: 1 },
      { status: 'SUCCESS', execution_attempt: 2 },
    ]);
  });

  it('recovers due work without resending completed or future jobs in the same database', async () => {
    const completedId = await createJob();
    await scheduler.start();
    await poll();
    const completed = await repository.getById(completedId);
    const pendingId = await createJob(new Date(START.getTime() + 10_000));
    const futureId = await createJob(new Date(START.getTime() + 120_000));

    await restart(new Date(START.getTime() + 20_000));
    await poll();
    await poll();

    expect(deliver).toHaveBeenCalledTimes(2);
    expect(await repository.getById(completedId)).toEqual(completed);
    expect((await repository.getById(pendingId))?.status).toBe(NotificationStatus.COMPLETED);
    expect((await repository.getById(futureId))?.status).toBe(NotificationStatus.PENDING);
    expect(await executionLog(completedId)).toEqual([{ status: 'SUCCESS', execution_attempt: 1 }]);
    expect(await executionLog(pendingId)).toEqual([{ status: 'SUCCESS', execution_attempt: 1 }]);
    expect(await executionLog(futureId)).toEqual([]);
  });
});
