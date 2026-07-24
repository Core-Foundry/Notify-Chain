import { NotificationAPI } from './notification-api';
import { ScheduledNotificationRepository } from './scheduled-notification-repository';
import { NotificationType } from '../types/scheduled-notification';
import { ValidationError } from '../utils/validation';

function makeRepository(): jest.Mocked<Pick<ScheduledNotificationRepository, 'create'>> {
  return {
    create: jest.fn().mockResolvedValue(1),
  };
}

function futureDate(msFromNow = 60_000): Date {
  return new Date(Date.now() + msFromNow);
}

function baseInput() {
  return {
    payload: { message: 'hello' },
    notificationType: NotificationType.DISCORD,
    targetRecipient: 'https://discord.com/webhook/abc',
    executeAt: futureDate(),
  };
}

describe('NotificationAPI.scheduleNotification', () => {
  let repository: jest.Mocked<Pick<ScheduledNotificationRepository, 'create'>>;
  let api: NotificationAPI;

  beforeEach(() => {
    repository = makeRepository();
    api = new NotificationAPI(repository as unknown as ScheduledNotificationRepository);
  });

  it('accepts a valid notification and forwards it to the repository', async () => {
    const input = baseInput();
    const id = await api.scheduleNotification(input);
    expect(id).toBe(1);
    expect(repository.create).toHaveBeenCalledWith(input, undefined);
  });

  it('rejects a missing executeAt', async () => {
    const input = { ...baseInput(), executeAt: undefined as any };
    await expect(api.scheduleNotification(input)).rejects.toThrow('executeAt must be a valid date');
  });

  it('rejects an executeAt in the past', async () => {
    const input = { ...baseInput(), executeAt: new Date(Date.now() - 60_000) };
    await expect(api.scheduleNotification(input)).rejects.toThrow(
      'executeAt must be a future timestamp',
    );
  });

  it('rejects a non-object payload', async () => {
    const input = { ...baseInput(), payload: 'not-an-object' as any };
    await expect(api.scheduleNotification(input)).rejects.toThrow('payload must be a valid object');
  });

  it('rejects an array payload', async () => {
    const input = { ...baseInput(), payload: ['a', 'b'] as any };
    await expect(api.scheduleNotification(input)).rejects.toThrow('payload must be a valid object');
  });

  it('rejects an empty targetRecipient', async () => {
    const input = { ...baseInput(), targetRecipient: '   ' };
    await expect(api.scheduleNotification(input)).rejects.toThrow('targetRecipient is required');
  });

  it('rejects an unknown notificationType', async () => {
    const input = { ...baseInput(), notificationType: 'carrier-pigeon' as any };
    await expect(api.scheduleNotification(input)).rejects.toThrow(ValidationError);
    await expect(api.scheduleNotification(input)).rejects.toThrow(/notificationType/);
  });

  it('rejects a negative maxRetries', async () => {
    const input = { ...baseInput(), maxRetries: -1 };
    await expect(api.scheduleNotification(input)).rejects.toThrow(/maxRetries/);
  });

  it('rejects a non-integer maxRetries', async () => {
    const input = { ...baseInput(), maxRetries: 2.5 };
    await expect(api.scheduleNotification(input)).rejects.toThrow(/maxRetries/);
  });

  it('rejects a priority outside the documented 1-10 range', async () => {
    const tooLow = { ...baseInput(), priority: 0 };
    const tooHigh = { ...baseInput(), priority: 11 };
    await expect(api.scheduleNotification(tooLow)).rejects.toThrow(/priority/);
    await expect(api.scheduleNotification(tooHigh)).rejects.toThrow(/priority/);
  });

  it('accepts priority at the documented boundaries', async () => {
    await expect(api.scheduleNotification({ ...baseInput(), priority: 1 })).resolves.toBe(1);
    await expect(api.scheduleNotification({ ...baseInput(), priority: 10 })).resolves.toBe(1);
  });

  it('rejects a non-object metadata', async () => {
    const input = { ...baseInput(), metadata: 'oops' as any };
    await expect(api.scheduleNotification(input)).rejects.toThrow(/metadata/);
  });

  it('rejects an empty eventId when provided', async () => {
    const input = { ...baseInput(), eventId: '' };
    await expect(api.scheduleNotification(input)).rejects.toThrow(/eventId/);
  });

  it('reports every invalid field in a single error', async () => {
    const input = {
      ...baseInput(),
      notificationType: 'bogus' as any,
      maxRetries: -5,
      priority: 999,
    };
    try {
      await api.scheduleNotification(input);
      throw new Error('expected scheduleNotification to reject');
    } catch (err) {
      expect(err).toBeInstanceOf(ValidationError);
      const fields = (err as ValidationError).issues.map((i) => i.field);
      expect(fields).toEqual(expect.arrayContaining(['notificationType', 'maxRetries', 'priority']));
    }
  });

  it('does not call the repository when validation fails', async () => {
    const input = { ...baseInput(), priority: 999 };
    await expect(api.scheduleNotification(input)).rejects.toThrow();
    expect(repository.create).not.toHaveBeenCalled();
  });
});
