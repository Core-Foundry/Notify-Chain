import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Database } from '../database/database';
import { ScheduledNotificationRepository } from '../services/scheduled-notification-repository';
import { WebhookNotificationProvider } from '../services/providers/webhook-provider';
import { sendWebhook } from '../services/webhook-sender';
import { NotificationType } from '../types/scheduled-notification';

jest.mock('../utils/logger', () => ({
  __esModule: true,
  default: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));
jest.mock('../services/webhook-sender', () => ({ sendWebhook: jest.fn() }));

describe('persisted delivery identity', () => {
  let directory: string;
  let db: Database;
  let repository: ScheduledNotificationRepository;

  async function openDatabase() {
    db = new Database(join(directory, 'notifications.db'));
    await db.initialize();
    repository = new ScheduledNotificationRepository(db);
  }

  function createJob() {
    return repository.create({
      payload: { message: 'Same content, potentially different logical job' },
      notificationType: NotificationType.WEBHOOK,
      targetRecipient: 'https://example.com/notifications',
      executeAt: new Date(),
    });
  }

  beforeEach(async () => {
    directory = mkdtempSync(join(tmpdir(), 'delivery-key-'));
    await openDatabase();
  });

  afterEach(async () => {
    await db.close();
    rmSync(directory, { recursive: true, force: true });
  });

  it('reuses one committed key across concurrent requests and database reopen', async () => {
    const id = await createJob();
    const attempts = await Promise.allSettled(
      Array.from({ length: 8 }, () => repository.getOrCreateDeliveryKey(id)),
    );
    // Settle every request before cleanup even if one unexpectedly fails.
    expect(attempts.every((attempt) => attempt.status === 'fulfilled')).toBe(true);
    const keys = attempts.map((attempt) => (attempt as PromiseFulfilledResult<string>).value);
    expect(new Set(keys).size).toBe(1);
    expect(keys[0]).toMatch(/^[0-9a-f-]{36}$/);
    await db.close();
    await openDatabase();
    expect(await repository.getOrCreateDeliveryKey(id)).toBe(keys[0]);
    expect(
      await db.get('SELECT count(*) AS count FROM scheduled_notification_delivery_keys'),
    ).toEqual({ count: 1 });
  });

  it('does not collapse distinct jobs that have identical content', async () => {
    const first = await createJob();
    const second = await createJob();
    expect(await repository.getOrCreateDeliveryKey(first)).not.toBe(
      await repository.getOrCreateDeliveryKey(second),
    );
  });

  it('keeps the same identity when a failed job is manually retried', async () => {
    const id = await createJob();
    const key = await repository.getOrCreateDeliveryKey(id);
    await repository.markAsFailedOrRetry(id, new Error('test exhausted delivery'), 2, 3);
    const entries = await repository.getDeadLetterQueue();
    expect(entries).toHaveLength(1);
    expect(await repository.retryDeadLetterNotification(entries[0].id!)).toBe(true);
    expect((await repository.getById(id))?.status).toBe('PENDING');
    expect(await repository.getOrCreateDeliveryKey(id)).toBe(key);
  });

  it('adds the identity table when reopening a database from before the feature', async () => {
    const id = await createJob();
    await db.exec('DROP TABLE scheduled_notification_delivery_keys');
    await db.close();
    await openDatabase();
    expect(await repository.getOrCreateDeliveryKey(id)).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('surfaces foreign-key failures instead of fabricating an identity', async () => {
    await expect(repository.getOrCreateDeliveryKey(999999)).rejects.toThrow(/FOREIGN KEY/);
  });

  it('does not return an uncommitted key or roll back another caller transaction', async () => {
    const id = await createJob();
    await db.run('BEGIN IMMEDIATE');
    try {
      await db.run('UPDATE scheduled_notifications SET priority = 9 WHERE id = ?', [id]);
      await expect(repository.getOrCreateDeliveryKey(id)).rejects.toThrow(/SQLITE_BUSY/);
      expect((await repository.getById(id))?.priority).toBe(9);
      expect(
        await db.get('SELECT count(*) AS count FROM scheduled_notification_delivery_keys'),
      ).toEqual({ count: 0 });
    } finally {
      await db.run('ROLLBACK');
    }
    expect((await repository.getById(id))?.priority).toBe(5);
    const key = await repository.getOrCreateDeliveryKey(id);
    await db.close();
    await openDatabase();
    expect(await repository.getOrCreateDeliveryKey(id)).toBe(key);
  });
});

describe('webhook receiver idempotency opt-in', () => {
  const payload = {
    payload: { message: 'A scheduled notification' },
    targetRecipient: 'https://example.com/notifications',
    notificationType: 'webhook',
    deliveryKey: 'persisted-job-key',
  };

  beforeEach(() => {
    jest.clearAllMocks();
    (sendWebhook as jest.Mock).mockResolvedValue({ ok: true });
  });

  it('preserves default delivery without adding an idempotency header', async () => {
    const provider = new WebhookNotificationProvider();
    expect(provider.requiresDeliveryKey).toBe(false);
    await provider.deliver(payload);
    expect(sendWebhook).toHaveBeenCalledWith(payload.targetRecipient, payload.payload, {
      timeoutMs: 5000,
      headers: {},
    });
  });

  it('sends the persisted key on every opted-in attempt', async () => {
    const provider = new WebhookNotificationProvider({ receiverSupportsIdempotency: true });
    await provider.deliver(payload);
    await provider.deliver(payload);
    expect(sendWebhook).toHaveBeenCalledTimes(2);
    for (const call of (sendWebhook as jest.Mock).mock.calls) {
      expect(call[2].headers).toEqual({ 'Idempotency-Key': payload.deliveryKey });
    }
  });

  it.each([undefined, '', 'unsafe\r\nheader'])(
    'does not send without a valid durable key (%p)',
    async (deliveryKey) => {
      const provider = new WebhookNotificationProvider({ receiverSupportsIdempotency: true });
      expect(await provider.deliver({ ...payload, deliveryKey })).toEqual(
        expect.objectContaining({ success: false }),
      );
      expect(sendWebhook).not.toHaveBeenCalled();
    },
  );

  it.each(['Idempotency-Key', 'idempotency-key', 'IDEMPOTENCY-KEY'])(
    'rejects a fixed shared header (%s)',
    (header) => {
      expect(
        () =>
          new WebhookNotificationProvider({
            receiverSupportsIdempotency: true,
            defaultHeaders: { [header]: 'shared-key' },
          }),
      ).toThrow(/persisted notification/);
    },
  );
});
