import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import { NotificationAPI } from './notification-api';
import { PayloadTooLargeError, DEFAULT_MAX_PAYLOAD_SIZE_BYTES } from '../utils/payload-size-validator';
import { NotificationType } from '../types/scheduled-notification';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function futureDate(offsetMs = 60_000): Date {
  return new Date(Date.now() + offsetMs);
}

/** Return a payload whose JSON representation is exactly `targetBytes` bytes. */
function payloadOfExactBytes(targetBytes: number): Record<string, string> {
  const overhead = Buffer.byteLength(JSON.stringify({ data: '' }), 'utf8'); // '{"data":""}' = 11
  const fillLength = targetBytes - overhead;
  if (fillLength < 0) throw new Error(`targetBytes ${targetBytes} too small for wrapper`);
  return { data: 'x'.repeat(fillLength) };
}

// ---------------------------------------------------------------------------
// Mock repository
// ---------------------------------------------------------------------------

const mockCreate = jest.fn<() => Promise<number>>().mockResolvedValue(1);
const mockCancel = jest.fn<() => Promise<boolean>>().mockResolvedValue(true);
const mockGetById = jest.fn<() => Promise<null>>().mockResolvedValue(null);
const mockGetStats = jest.fn<() => Promise<object>>().mockResolvedValue({});

const mockRepository = {
  create: mockCreate,
  cancel: mockCancel,
  getById: mockGetById,
  getStats: mockGetStats,
} as any;

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('NotificationAPI – payload size validation', () => {
  let api: NotificationAPI;

  beforeEach(() => {
    jest.clearAllMocks();
    api = new NotificationAPI(mockRepository);
  });

  describe('default limit (64 KB)', () => {
    it('exposes the default max payload size', () => {
      expect(api.maxPayloadSizeBytes).toBe(DEFAULT_MAX_PAYLOAD_SIZE_BYTES);
    });

    it('schedules a notification with a small payload (under limit)', async () => {
      const id = await api.scheduleNotification({
        payload: { message: 'hello world', recipient: 'alice' },
        notificationType: NotificationType.DISCORD,
        targetRecipient: 'https://discord.com/webhook',
        executeAt: futureDate(),
      });

      expect(id).toBe(1);
      expect(mockCreate).toHaveBeenCalledTimes(1);
    });

    it('schedules a notification whose payload is exactly at the limit', async () => {
      const payload = payloadOfExactBytes(DEFAULT_MAX_PAYLOAD_SIZE_BYTES);
      const byteLength = Buffer.byteLength(JSON.stringify(payload), 'utf8');
      expect(byteLength).toBe(DEFAULT_MAX_PAYLOAD_SIZE_BYTES);

      await expect(
        api.scheduleNotification({
          payload,
          notificationType: NotificationType.DISCORD,
          targetRecipient: 'https://discord.com/webhook',
          executeAt: futureDate(),
        })
      ).resolves.toBe(1);

      expect(mockCreate).toHaveBeenCalledTimes(1);
    });

    it('rejects a payload that is 1 byte over the limit', async () => {
      const payload = payloadOfExactBytes(DEFAULT_MAX_PAYLOAD_SIZE_BYTES + 1);

      await expect(
        api.scheduleNotification({
          payload,
          notificationType: NotificationType.DISCORD,
          targetRecipient: 'https://discord.com/webhook',
          executeAt: futureDate(),
        })
      ).rejects.toThrow(PayloadTooLargeError);

      // Storage must NOT be called when the payload is oversized.
      expect(mockCreate).not.toHaveBeenCalled();
    });

    it('rejects a clearly oversized payload', async () => {
      const payload = { data: 'a'.repeat(200_000) };

      await expect(
        api.scheduleNotification({
          payload,
          notificationType: NotificationType.DISCORD,
          targetRecipient: 'https://discord.com/webhook',
          executeAt: futureDate(),
        })
      ).rejects.toThrow(PayloadTooLargeError);

      expect(mockCreate).not.toHaveBeenCalled();
    });

    it('includes a descriptive message in the thrown error', async () => {
      const payload = { data: 'a'.repeat(200_000) };
      let thrown: Error | undefined;

      try {
        await api.scheduleNotification({
          payload,
          notificationType: NotificationType.DISCORD,
          targetRecipient: 'https://discord.com/webhook',
          executeAt: futureDate(),
        });
      } catch (err) {
        thrown = err as Error;
      }

      expect(thrown).toBeInstanceOf(PayloadTooLargeError);
      expect(thrown!.message).toContain('too large');
    });
  });

  describe('custom limit', () => {
    it('accepts a payload within a custom limit', async () => {
      const customLimit = 200;
      const customApi = new NotificationAPI(mockRepository, customLimit);
      const payload = { msg: 'small' };

      await expect(
        customApi.scheduleNotification({
          payload,
          notificationType: NotificationType.DISCORD,
          targetRecipient: 'https://discord.com/webhook',
          executeAt: futureDate(),
        })
      ).resolves.toBe(1);
    });

    it('rejects a payload that exceeds the custom limit', async () => {
      const customLimit = 50;
      const customApi = new NotificationAPI(mockRepository, customLimit);
      const payload = { data: 'x'.repeat(100) };

      await expect(
        customApi.scheduleNotification({
          payload,
          notificationType: NotificationType.DISCORD,
          targetRecipient: 'https://discord.com/webhook',
          executeAt: futureDate(),
        })
      ).rejects.toThrow(PayloadTooLargeError);

      expect(mockCreate).not.toHaveBeenCalled();
    });
  });

  describe('existing validation still works', () => {
    it('rejects a missing executeAt', async () => {
      await expect(
        api.scheduleNotification({
          payload: { msg: 'hi' },
          notificationType: NotificationType.DISCORD,
          targetRecipient: 'https://discord.com/webhook',
          executeAt: null as any,
        })
      ).rejects.toThrow('executeAt must be a valid date');
    });

    it('rejects a past executeAt', async () => {
      await expect(
        api.scheduleNotification({
          payload: { msg: 'hi' },
          notificationType: NotificationType.DISCORD,
          targetRecipient: 'https://discord.com/webhook',
          executeAt: new Date(Date.now() - 1000),
        })
      ).rejects.toThrow('executeAt must be a future timestamp');
    });

    it('rejects a missing targetRecipient', async () => {
      await expect(
        api.scheduleNotification({
          payload: { msg: 'hi' },
          notificationType: NotificationType.DISCORD,
          targetRecipient: '',
          executeAt: futureDate(),
        })
      ).rejects.toThrow('targetRecipient is required');
    });
  });
});
