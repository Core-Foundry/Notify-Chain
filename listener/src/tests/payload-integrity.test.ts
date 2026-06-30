import { hashPayload, verifyPayloadIntegrity } from '../utils/payload-integrity';
import { Database } from '../database/database';
import { ScheduledNotificationRepository } from '../services/scheduled-notification-repository';
import { NotificationAPI } from '../services/notification-api';
import { NotificationType } from '../types/scheduled-notification';
import * as fs from 'fs';
import * as path from 'path';

const SECRET = 'test-secret-key';
const TEST_DB = './data/test-integrity.db';

// ─── Unit tests ──────────────────────────────────────────────────────────────

describe('hashPayload', () => {
  it('produces a hex string', () => {
    const hash = hashPayload('{"foo":"bar"}', SECRET);
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
  });

  it('is deterministic', () => {
    const payload = '{"event":"test"}';
    expect(hashPayload(payload, SECRET)).toBe(hashPayload(payload, SECRET));
  });

  it('differs when payload changes', () => {
    expect(hashPayload('{"a":1}', SECRET)).not.toBe(hashPayload('{"a":2}', SECRET));
  });

  it('differs when secret changes', () => {
    const payload = '{"a":1}';
    expect(hashPayload(payload, 'secret-a')).not.toBe(hashPayload(payload, 'secret-b'));
  });
});

describe('verifyPayloadIntegrity', () => {
  it('returns true for a valid payload/hash pair', () => {
    const payload = '{"message":"hello"}';
    const hash = hashPayload(payload, SECRET);
    expect(verifyPayloadIntegrity(payload, hash, SECRET)).toBe(true);
  });

  it('returns false when payload is tampered', () => {
    const original = '{"amount":100}';
    const hash = hashPayload(original, SECRET);
    expect(verifyPayloadIntegrity('{"amount":999}', hash, SECRET)).toBe(false);
  });

  it('returns false when hash is wrong', () => {
    const payload = '{"ok":true}';
    expect(verifyPayloadIntegrity(payload, 'deadbeef', SECRET)).toBe(false);
  });

  it('returns false for empty payload', () => {
    expect(verifyPayloadIntegrity('', hashPayload('', SECRET), SECRET)).toBe(false);
  });

  it('returns false for empty hash', () => {
    expect(verifyPayloadIntegrity('{"x":1}', '', SECRET)).toBe(false);
  });
});

// ─── Integration tests ───────────────────────────────────────────────────────

describe('payload integrity — repository and scheduler integration', () => {
  let db: Database;
  let repository: ScheduledNotificationRepository;
  let api: NotificationAPI;

  beforeAll(async () => {
    process.env.PAYLOAD_INTEGRITY_SECRET = SECRET;

    const dir = path.dirname(TEST_DB);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB);

    db = new Database(TEST_DB);
    await db.initialize();
    repository = new ScheduledNotificationRepository(db);
    api = new NotificationAPI(repository);
  });

  afterAll(async () => {
    delete process.env.PAYLOAD_INTEGRITY_SECRET;
    await db.close();
    if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB);
  });

  beforeEach(async () => {
    await db.run('DELETE FROM notification_execution_log');
    await db.run('DELETE FROM scheduled_notifications');
  });

  it('stores a payload_hash when secret is set', async () => {
    const id = await api.scheduleNotification({
      payload: { message: 'hello' },
      notificationType: NotificationType.DISCORD,
      targetRecipient: 'https://discord.com/webhook/test',
      executeAt: new Date(Date.now() + 60000),
    });

    const notification = await repository.getById(id);
    expect(notification!.payloadHash).toBeTruthy();
    expect(notification!.payloadHash).toMatch(/^[a-f0-9]{64}$/);
  });

  it('stored hash matches the payload', async () => {
    const payload = { message: 'integrity check' };
    const id = await api.scheduleNotification({
      payload,
      notificationType: NotificationType.DISCORD,
      targetRecipient: 'https://discord.com/webhook/test',
      executeAt: new Date(Date.now() + 60000),
    });

    const notification = await repository.getById(id);
    const expected = hashPayload(JSON.stringify(payload), SECRET);
    expect(notification!.payloadHash).toBe(expected);
  });

  it('detects a tampered payload', async () => {
    const id = await api.scheduleNotification({
      payload: { amount: 100 },
      notificationType: NotificationType.DISCORD,
      targetRecipient: 'https://discord.com/webhook/test',
      executeAt: new Date(Date.now() + 60000),
    });

    // Tamper directly in the DB
    await db.run('UPDATE scheduled_notifications SET payload = ? WHERE id = ?', [
      JSON.stringify({ amount: 999 }),
      id,
    ]);

    const notification = await repository.getById(id);
    expect(
      verifyPayloadIntegrity(notification!.payload, notification!.payloadHash!, SECRET)
    ).toBe(false);
  });

  it('verifies an untampered payload successfully', async () => {
    const payload = { event: 'TaskCreated', ledger: 42 };
    const id = await api.scheduleNotification({
      payload,
      notificationType: NotificationType.DISCORD,
      targetRecipient: 'https://discord.com/webhook/test',
      executeAt: new Date(Date.now() + 60000),
    });

    const notification = await repository.getById(id);
    expect(
      verifyPayloadIntegrity(notification!.payload, notification!.payloadHash!, SECRET)
    ).toBe(true);
  });
});
