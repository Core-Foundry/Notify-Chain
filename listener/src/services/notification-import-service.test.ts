import { NotificationImportService } from './notification-import-service';
import { NotificationAPI } from './notification-api';
import { NotificationType } from '../types/scheduled-notification';

describe('NotificationImportService', () => {
  let scheduleNotification: jest.Mock;
  let service: NotificationImportService;

  beforeEach(() => {
    scheduleNotification = jest.fn().mockResolvedValue(42);
    const api = { scheduleNotification } as unknown as NotificationAPI;
    service = new NotificationImportService(api);
  });

  it('imports valid JSON records and returns a summary', async () => {
    const executeAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    const summary = await service.importFromBody([
      {
        id: 'n1',
        recipient: 'https://discord.com/api/webhooks/1',
        channel: 'discord',
        message: 'Hello',
        executeAt,
      },
      {
        id: 'n2',
        recipient: 'user@example.com',
        channel: 'email',
        message: 'Hi',
        executeAt,
      },
    ]);

    expect(summary.imported).toBe(2);
    expect(summary.skipped).toBe(0);
    expect(summary.importedIds).toEqual([42, 42]);
    expect(summary.format).toBe('json');
    expect(scheduleNotification).toHaveBeenCalledTimes(2);
    expect(scheduleNotification.mock.calls[0][0].notificationType).toBe(NotificationType.DISCORD);
  });

  it('skips invalid records safely without failing the batch', async () => {
    const executeAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    const summary = await service.importFromBody({
      notifications: [
        {
          id: 'ok',
          recipient: 'https://hooks.example/1',
          channel: 'webhook',
          message: 'Valid',
          executeAt,
        },
        {
          id: 'bad',
          channel: 'carrier-pigeon',
          message: 'Nope',
          executeAt,
        },
        {
          id: 'missing',
          recipient: 'x@y.com',
          channel: 'email',
          executeAt,
        },
      ],
    });

    expect(summary.total).toBe(3);
    expect(summary.imported).toBe(1);
    expect(summary.skipped).toBe(2);
    expect(summary.skippedRecords.map((s) => s.index).sort()).toEqual([1, 2]);
  });

  it('parses CSV and imports valid rows', async () => {
    const executeAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    const csv =
      `id,recipient,channel,message,execute_at\n` +
      `c1,https://discord.com/api/webhooks/9,discord,Ping,${executeAt}\n` +
      `c2,,sms,Missing recipient,${executeAt}\n`;

    const summary = await service.importFromBody(csv, 'text/csv');

    expect(summary.format).toBe('csv');
    expect(summary.imported).toBe(1);
    expect(summary.skipped).toBe(1);
    expect(summary.skippedRecords[0].reason).toMatch(/recipient/i);
  });
});
