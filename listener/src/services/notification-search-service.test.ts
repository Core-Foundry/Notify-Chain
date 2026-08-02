import {
  NotificationSearchService,
  normalizeSearchDateBound,
  type NotificationSearchParams,
} from './notification-search-service';

jest.mock('../database/database', () => {
  const mockDb = {
    get: jest.fn(),
    all: jest.fn(),
  };
  return {
    getDatabase: () => mockDb,
    __mockDb: mockDb,
  };
});

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { __mockDb: mockDb } = require('../database/database') as {
  __mockDb: { get: jest.Mock; all: jest.Mock };
};

describe('normalizeSearchDateBound', () => {
  it('expands YYYY-MM-DD to full UTC day bounds', () => {
    expect(normalizeSearchDateBound('2026-01-15', 'start')).toBe('2026-01-15T00:00:00.000Z');
    expect(normalizeSearchDateBound('2026-01-15', 'end')).toBe('2026-01-15T23:59:59.999Z');
  });

  it('leaves ISO datetimes unchanged', () => {
    expect(normalizeSearchDateBound('2026-01-15T12:00:00.000Z', 'start')).toBe(
      '2026-01-15T12:00:00.000Z'
    );
  });
});

describe('NotificationSearchService filters', () => {
  let service: NotificationSearchService;

  beforeEach(() => {
    mockDb.get.mockReset();
    mockDb.all.mockReset();
    mockDb.get.mockResolvedValue({ count: 0 });
    mockDb.all.mockResolvedValue([]);
    service = new NotificationSearchService();
  });

  function scheduledCalls() {
    return mockDb.get.mock.calls.filter(
      ([sql]: [string]) => typeof sql === 'string' && sql.includes('FROM scheduled_notifications')
    );
  }

  function processedCalls() {
    return mockDb.get.mock.calls.filter(
      ([sql]: [string]) => typeof sql === 'string' && sql.includes('FROM processed_events')
    );
  }

  it('filters by notification type with exact match', async () => {
    await service.search({ type: 'email' });

    const [sql, params] = scheduledCalls()[0];
    expect(sql).toContain('LOWER(notification_type) = ?');
    expect(params).toContain('email');

    const [processedSql, processedParams] = processedCalls()[0];
    expect(processedSql).toContain('LOWER(event_type) = ?');
    expect(processedParams).toContain('email');
  });

  it('filters by delivery status', async () => {
    await service.search({ status: 'FAILED' });

    const [sql, params] = scheduledCalls()[0];
    expect(sql).toContain('status = ?');
    expect(params).toContain('FAILED');
  });

  it('filters by date range using normalized bounds', async () => {
    const params: NotificationSearchParams = {
      startDate: '2026-01-10',
      endDate: '2026-01-20',
    };
    await service.search(params);

    const [sql, queryParams] = scheduledCalls()[0];
    expect(sql).toContain('created_at >= ?');
    expect(sql).toContain('created_at <= ?');
    expect(queryParams).toContain('2026-01-10T00:00:00.000Z');
    expect(queryParams).toContain('2026-01-20T23:59:59.999Z');

    const [processedSql, processedParams] = processedCalls()[0];
    expect(processedSql).toContain('processed_at >= ?');
    expect(processedSql).toContain('processed_at <= ?');
    expect(processedParams).toContain('2026-01-10T00:00:00.000Z');
    expect(processedParams).toContain('2026-01-20T23:59:59.999Z');
  });

  it('combines type, status, and date filters', async () => {
    await service.search({
      type: 'webhook',
      status: 'COMPLETED',
      startDate: '2026-04-01',
      endDate: '2026-04-30',
    });

    const [sql, params] = scheduledCalls()[0];
    expect(sql).toContain('LOWER(notification_type) = ?');
    expect(sql).toContain('status = ?');
    expect(sql).toContain('created_at >= ?');
    expect(sql).toContain('created_at <= ?');
    expect(params).toEqual(
      expect.arrayContaining([
        'webhook',
        'COMPLETED',
        '2026-04-01T00:00:00.000Z',
        '2026-04-30T23:59:59.999Z',
      ])
    );
  });

  it('returns merged scheduled results for matching filters', async () => {
    mockDb.get.mockImplementation(async (sql: string) => {
      if (sql.includes('scheduled_notifications')) return { count: 1 };
      return { count: 0 };
    });
    mockDb.all.mockImplementation(async (sql: string) => {
      if (sql.includes('FROM scheduled_notifications')) {
        return [
          {
            id: 7,
            event_id: 'match',
            contract_address: null,
            notification_type: 'webhook',
            target_recipient: 'hook',
            status: 'COMPLETED',
            created_at: '2026-04-01T08:00:00.000Z',
            payload: '{}',
          },
        ];
      }
      return [];
    });

    const result = await service.search({
      type: 'webhook',
      status: 'COMPLETED',
      startDate: '2026-04-01',
      endDate: '2026-04-30',
    });

    expect(result.total).toBe(1);
    expect(result.results[0].eventId).toBe('match');
    expect(result.results[0].notificationType).toBe('webhook');
    expect(result.results[0].status).toBe('COMPLETED');
  });
});
