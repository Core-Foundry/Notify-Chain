import { join } from 'node:path';
import { setTimeout as waitForIO } from 'node:timers/promises';
import { Database } from '../src/database/database';
import { NotificationScheduler } from '../src/services/notification-scheduler';
import { RetryScheduler } from '../src/services/retry-scheduler';
import { ScheduledNotificationRepository } from '../src/services/scheduled-notification-repository';
import { ProviderRegistry } from '../src/services/provider-registry';
import { WebhookNotificationProvider } from '../src/services/providers/webhook-provider';
import { DeliveryPayload, DeliveryResult } from '../src/types/provider-capabilities';
import { NotificationType } from '../src/types/scheduled-notification';

jest.mock('../src/utils/logger', () => ({
  __esModule: true,
  default: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

// Explicitly selected by the parent test, never part of Jest's *.test.ts scan.
it('runs one isolated delivery process', async () => {
  const directory = process.env.IDEMPOTENCY_PROBE_DIRECTORY;
  const endpoint = process.env.IDEMPOTENCY_PROBE_ENDPOINT;
  const mode = process.env.IDEMPOTENCY_PROBE_MODE;
  if (!directory || !endpoint || !['crash', 'recover', 'completed'].includes(mode ?? '')) {
    throw new Error(
      'This fixture must be launched by scheduler-idempotency-crash.integration.test.ts',
    );
  }
  const start = Date.parse('2030-01-01T00:00:00Z');
  jest.useFakeTimers({
    now: mode === 'crash' ? start : start + 61_000,
    doNotFake: ['nextTick', 'setImmediate'],
  });
  const db = new Database(join(directory, 'sender.db'));
  await db.initialize();
  const repository = new ScheduledNotificationRepository(db);

  class ExitAfterAcceptedDelivery extends WebhookNotificationProvider {
    async deliver(payload: DeliveryPayload): Promise<DeliveryResult> {
      const result = await super.deliver(payload);
      // Inject failure after the real receiver acknowledged, before the
      // scheduler can durably record completion. No graceful stop runs.
      if (mode === 'crash' && result.success) process.exit(79);
      return result;
    }
  }
  const providers = new ProviderRegistry().register(
    new ExitAfterAcceptedDelivery({
      receiverSupportsIdempotency: true,
    }),
  );
  const config = {
    enabled: true,
    pollIntervalMs: 100,
    lockTimeoutMs: 60_000,
    batchSize: 1,
    timingBufferMs: 0,
    processorId: `process-${mode}`,
  };
  const scheduler =
    mode === 'recover'
      ? new RetryScheduler(repository, config, null, undefined, providers)
      : new NotificationScheduler(repository, config, null, undefined, providers);

  if (mode === 'crash') {
    await repository.create({
      payload: { message: 'One business effect' },
      notificationType: NotificationType.WEBHOOK,
      targetRecipient: endpoint,
      executeAt: new Date(start),
      maxRetries: 3,
    });
  }
  if (mode === 'recover') expect((await repository.getById(1))?.status).toBe('PROCESSING');
  try {
    await scheduler.start();
    await jest.advanceTimersByTimeAsync(100);
    for (let attempt = 0; attempt < 400; attempt++) {
      await waitForIO(10);
      if ((await repository.getById(1))?.status === 'COMPLETED' && jest.getTimerCount() === 1)
        break;
    }
    expect(mode).not.toBe('crash');
    expect(await repository.getById(1)).toEqual(
      expect.objectContaining({ status: 'COMPLETED', retryCount: 1 }),
    );
    await jest.advanceTimersByTimeAsync(100);
    for (let attempt = 0; attempt < 400 && jest.getTimerCount() !== 1; attempt++)
      await waitForIO(10);
  } finally {
    await scheduler.stop();
    await db.close();
  }
});
