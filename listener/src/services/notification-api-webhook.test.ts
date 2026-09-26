/**
 * NotificationAPI — scheduleWebhookNotification tests
 *
 * Covers:
 *  - Happy-path scheduling stores a WEBHOOK notification
 *  - targetUrl is stored as targetRecipient
 *  - Payload is forwarded to the repository
 *  - Optional fields (maxRetries, priority, metadata) are respected
 *  - Standard validation (executeAt, payload, targetRecipient) still applies
 */

import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import { NotificationAPI } from './notification-api';
import { NotificationType } from '../types/scheduled-notification';

// ---------------------------------------------------------------------------
// Mock repository
// ---------------------------------------------------------------------------

const mockCreate = jest.fn<() => Promise<number>>().mockResolvedValue(42);

const mockRepository = {
  create: mockCreate,
  cancel: jest.fn(),
  getById: jest.fn(),
  getStats: jest.fn(),
} as any;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function futureDate(offsetMs = 60_000): Date {
  return new Date(Date.now() + offsetMs);
}

const TARGET_URL = 'https://hooks.example.com/notify';
const PAYLOAD = { event: 'order.shipped', orderId: 'ord-001' };

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('NotificationAPI.scheduleWebhookNotification', () => {
  let api: NotificationAPI;

  beforeEach(() => {
    jest.clearAllMocks();
    api = new NotificationAPI(mockRepository);
  });

  it('returns the notification ID from the repository', async () => {
    const id = await api.scheduleWebhookNotification(TARGET_URL, PAYLOAD, futureDate());
    expect(id).toBe(42);
  });

  it('calls repository.create once', async () => {
    await api.scheduleWebhookNotification(TARGET_URL, PAYLOAD, futureDate());
    expect(mockCreate).toHaveBeenCalledTimes(1);
  });

  it('stores notificationType as WEBHOOK', async () => {
    await api.scheduleWebhookNotification(TARGET_URL, PAYLOAD, futureDate());

    const [input] = mockCreate.mock.calls[0] as any[];
    expect(input.notificationType).toBe(NotificationType.WEBHOOK);
  });

  it('stores targetUrl as targetRecipient', async () => {
    await api.scheduleWebhookNotification(TARGET_URL, PAYLOAD, futureDate());

    const [input] = mockCreate.mock.calls[0] as any[];
    expect(input.targetRecipient).toBe(TARGET_URL);
  });

  it('forwards the payload to the repository', async () => {
    await api.scheduleWebhookNotification(TARGET_URL, PAYLOAD, futureDate());

    const [input] = mockCreate.mock.calls[0] as any[];
    expect(input.payload).toEqual(PAYLOAD);
  });

  it('respects the maxRetries option', async () => {
    await api.scheduleWebhookNotification(TARGET_URL, PAYLOAD, futureDate(), { maxRetries: 7 });

    const [input] = mockCreate.mock.calls[0] as any[];
    expect(input.maxRetries).toBe(7);
  });

  it('respects the priority option', async () => {
    await api.scheduleWebhookNotification(TARGET_URL, PAYLOAD, futureDate(), { priority: 1 });

    const [input] = mockCreate.mock.calls[0] as any[];
    expect(input.priority).toBe(1);
  });

  it('respects the metadata option', async () => {
    const meta = { source: 'order-service', region: 'eu-west' };
    await api.scheduleWebhookNotification(TARGET_URL, PAYLOAD, futureDate(), { metadata: meta });

    const [input] = mockCreate.mock.calls[0] as any[];
    expect(input.metadata).toEqual(meta);
  });

  it('stores the correct executeAt', async () => {
    const executeAt = futureDate(120_000);
    await api.scheduleWebhookNotification(TARGET_URL, PAYLOAD, executeAt);

    const [input] = mockCreate.mock.calls[0] as any[];
    expect(input.executeAt).toEqual(executeAt);
  });

  // ── Validation ────────────────────────────────────────────────────────────

  it('rejects a past executeAt', async () => {
    await expect(
      api.scheduleWebhookNotification(TARGET_URL, PAYLOAD, new Date(Date.now() - 1000)),
    ).rejects.toThrow('executeAt must be a future timestamp');
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('rejects an invalid executeAt (null)', async () => {
    await expect(
      api.scheduleWebhookNotification(TARGET_URL, PAYLOAD, null as any),
    ).rejects.toThrow('executeAt must be a valid date');
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('rejects an empty targetUrl', async () => {
    await expect(
      api.scheduleWebhookNotification('', PAYLOAD, futureDate()),
    ).rejects.toThrow('targetRecipient is required');
    expect(mockCreate).not.toHaveBeenCalled();
  });
});
