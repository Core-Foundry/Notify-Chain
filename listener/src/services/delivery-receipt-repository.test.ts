import { describe, expect, it, jest } from '@jest/globals';
import { Database } from '../database/database';
import { DeliveryReceiptRepository } from './delivery-receipt-repository';
import { DeliveryReceiptRow } from '../types/delivery-receipt';

describe('DeliveryReceiptRepository', () => {
  it('stores an allowlisted provider response and redacts credentials and personal data', async () => {
    const db = {
      run: jest.fn<() => Promise<{ lastID: number; changes: number }>>().mockResolvedValue({
        lastID: 5,
        changes: 1,
      }),
      all: jest.fn<() => Promise<any[]>>().mockResolvedValue([]),
    } as unknown as Database;
    const receipts = new DeliveryReceiptRepository(db);

    await receipts.create({
      notificationId: 8,
      channel: 'webhook',
      status: 'failed',
      attemptCount: 2,
      providerMessageId: null,
      providerResponse: {
        statusCode: 503,
        messageId: 'provider-msg-1',
        authorization: 'Bearer do-not-store',
        email: 'person@example.com',
      },
      errorCode: 'token=do-not-store',
      errorMessage: 'Request failed for https://example.com/hook?token=secret',
    });

    const parameters = (db.run as jest.Mock).mock.calls[0][1] as unknown[];
    expect(parameters[5]).toBe(JSON.stringify({ statusCode: 503, messageId: 'provider-msg-1' }));
    expect(parameters[6]).toBe('DELIVERY_FAILED');
    expect(parameters[7]).toBe('Request failed for [REDACTED_URL]');
    expect(JSON.stringify(parameters)).not.toContain('do-not-store');
    expect(JSON.stringify(parameters)).not.toContain('person@example.com');
    expect(JSON.stringify(parameters)).not.toContain('secret');
  });

  it('stores eventId, contractAddress, outcome, and providerStatus fields', async () => {
    const db = {
      run: jest.fn<() => Promise<{ lastID: number; changes: number }>>().mockResolvedValue({
        lastID: 10,
        changes: 1,
      }),
      all: jest.fn<() => Promise<any[]>>().mockResolvedValue([]),
    } as unknown as Database;
    const receipts = new DeliveryReceiptRepository(db);

    const now = new Date('2026-11-21T12:00:00Z');
    await receipts.create({
      notificationId: 101,
      channel: 'discord',
      status: 'delivered',
      attemptCount: 1,
      providerMessageId: 'msg-999',
      eventId: 'evt-stellar-12345',
      contractAddress: 'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
      outcome: 'ACCEPTED',
      providerStatus: 200,
      attemptTimestamp: now,
      deliveredAt: now,
      providerResponse: {
        statusCode: 200,
        messageId: 'msg-999',
      },
    });

    expect(db.run).toHaveBeenCalledTimes(1);
    const sql = (db.run as jest.Mock).mock.calls[0][0] as string;
    const parameters = (db.run as jest.Mock).mock.calls[0][1] as unknown[];

    expect(sql).toContain('event_id');
    expect(sql).toContain('contract_address');
    expect(sql).toContain('outcome');
    expect(sql).toContain('provider_status');

    // Indices:
    // 0: notification_id
    // 1: channel
    // 2: status
    // 3: attempt_count
    // 4: provider_message_id
    // 5: provider_response
    // 6: error_code
    // 7: error_message
    // 8: event_id
    // 9: contract_address
    // 10: outcome
    // 11: provider_status
    // 12: attempt_timestamp
    // 13: delivered_at
    expect(parameters[0]).toBe(101);
    expect(parameters[1]).toBe('discord');
    expect(parameters[2]).toBe('delivered');
    expect(parameters[3]).toBe(1);
    expect(parameters[4]).toBe('msg-999');
    expect(parameters[8]).toBe('evt-stellar-12345');
    expect(parameters[9]).toBe('CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA');
    expect(parameters[10]).toBe('ACCEPTED');
    expect(parameters[11]).toBe(200);
    expect(parameters[12]).toBe(now.toISOString());
    expect(parameters[13]).toBe(now.toISOString());
  });

  it('filters receipts by notification and status', async () => {
    const db = {
      run: jest.fn(),
      all: jest.fn<() => Promise<any[]>>().mockResolvedValue([]),
    } as unknown as Database;
    const receipts = new DeliveryReceiptRepository(db);

    await receipts.findByNotificationId(8, 'delivered');
    await receipts.findByStatus('failed');

    expect(db.all).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining('notification_id = ? AND status = ?'),
      [8, 'delivered'],
    );
    expect(db.all).toHaveBeenNthCalledWith(2, expect.stringContaining('WHERE status = ?'), [
      'failed',
    ]);
  });

  it('finds receipts by originating event ID', async () => {
    const fakeRow: DeliveryReceiptRow = {
      id: 1,
      notification_id: 42,
      channel: 'webhook',
      status: 'delivered',
      attempt_count: 1,
      provider_message_id: 'p-1',
      provider_response: '{"statusCode":200}',
      error_code: null,
      error_message: null,
      event_id: 'evt-abc-999',
      contract_address: 'C_ADDR_123',
      outcome: 'ACCEPTED',
      provider_status: 200,
      attempt_timestamp: '2026-11-21T12:00:00.000Z',
      delivered_at: '2026-11-21T12:00:00.000Z',
      created_at: '2026-11-21T12:00:00.000Z',
      updated_at: '2026-11-21T12:00:00.000Z',
    };

    const db = {
      run: jest.fn(),
      all: jest.fn<() => Promise<any[]>>().mockResolvedValue([fakeRow]),
    } as unknown as Database;
    const receipts = new DeliveryReceiptRepository(db);

    const results = await receipts.findByEventId('evt-abc-999');

    expect(db.all).toHaveBeenCalledWith(
      expect.stringContaining('event_id = ?'),
      ['evt-abc-999'],
    );
    expect(results).toHaveLength(1);
    expect(results[0].eventId).toBe('evt-abc-999');
    expect(results[0].contractAddress).toBe('C_ADDR_123');
    expect(results[0].outcome).toBe('ACCEPTED');
  });

  it('queries delivery history with multi-filter options and pagination', async () => {
    const fakeRow: DeliveryReceiptRow = {
      id: 2,
      notification_id: 45,
      channel: 'discord',
      status: 'failed',
      attempt_count: 2,
      provider_message_id: null,
      provider_response: '{"statusCode":500}',
      error_code: 'SERVER_ERROR',
      error_message: 'Service unavailable',
      event_id: 'evt-100',
      contract_address: 'C_ADDR_TEST',
      outcome: 'UNKNOWN',
      provider_status: 500,
      attempt_timestamp: '2026-11-21T12:10:00.000Z',
      delivered_at: null,
      created_at: '2026-11-21T12:10:00.000Z',
      updated_at: '2026-11-21T12:10:00.000Z',
    };

    const db = {
      run: jest.fn(),
      get: jest.fn<() => Promise<any>>().mockResolvedValue({ count: 1 }),
      all: jest.fn<() => Promise<any[]>>().mockResolvedValue([fakeRow]),
    } as unknown as Database;
    const receipts = new DeliveryReceiptRepository(db);

    const historyResult = await receipts.queryHistory({
      eventId: 'evt-100',
      contractAddress: 'C_ADDR_TEST',
      outcome: 'UNKNOWN',
      channel: 'discord',
      startDate: new Date('2026-11-20T00:00:00Z'),
      endDate: new Date('2026-11-22T00:00:00Z'),
      limit: 10,
      offset: 0,
    });

    expect(historyResult.total).toBe(1);
    expect(historyResult.receipts).toHaveLength(1);
    expect(historyResult.receipts[0].outcome).toBe('UNKNOWN');
    expect(historyResult.receipts[0].providerStatus).toBe(500);

    const allCall = (db.all as jest.Mock).mock.calls[0];
    const sql = allCall[0] as string;
    const params = allCall[1] as unknown[];

    expect(sql).toContain('event_id = ?');
    expect(sql).toContain('contract_address = ?');
    expect(sql).toContain('outcome = ?');
    expect(sql).toContain('channel = ?');
    expect(sql).toContain('created_at');
    expect(params).toContain('evt-100');
    expect(params).toContain('C_ADDR_TEST');
    expect(params).toContain('UNKNOWN');
    expect(params).toContain('discord');
  });

  it('runs ensureSchema to add new columns if table exists', async () => {
    const db = {
      run: jest.fn<() => Promise<any>>().mockResolvedValue({}),
      get: jest.fn<() => Promise<any>>().mockResolvedValue({ name: 'delivery_receipts' }),
    } as unknown as Database;
    const receipts = new DeliveryReceiptRepository(db);

    await receipts.ensureSchema();

    expect(db.get).toHaveBeenCalledWith(
      expect.stringContaining("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'delivery_receipts'"),
    );
    // Verified that ALTER TABLE statements and index creations were called
    const runCalls = (db.run as jest.Mock).mock.calls.map((c) => c[0] as string);
    expect(runCalls.some((c) => c.includes('ADD COLUMN event_id'))).toBe(true);
    expect(runCalls.some((c) => c.includes('ADD COLUMN contract_address'))).toBe(true);
    expect(runCalls.some((c) => c.includes('ADD COLUMN outcome'))).toBe(true);
    expect(runCalls.some((c) => c.includes('ADD COLUMN provider_status'))).toBe(true);
    expect(runCalls.some((c) => c.includes('idx_delivery_receipts_outcome_created'))).toBe(true);
  });

  it('ignores confirmed SQLite duplicate-column errors during ensureSchema', async () => {
    const db = {
      run: jest.fn<(sql: string) => Promise<any>>().mockImplementation(async (sql: string) => {
        if (sql.includes('ADD COLUMN event_id')) {
          throw new Error('duplicate column name: event_id');
        }
        return {};
      }),
      get: jest.fn<() => Promise<any>>().mockResolvedValue({ name: 'delivery_receipts' }),
    } as unknown as Database;
    const receipts = new DeliveryReceiptRepository(db);

    await expect(receipts.ensureSchema()).resolves.not.toThrow();
    // After succeeding, subsequent ensureSchema is a no-op
    await receipts.ensureSchema();
    expect(db.get).toHaveBeenCalledTimes(1);
  });

  it('propagates non-duplicate-column migration errors and does not set schemaEnsured', async () => {
    const db = {
      run: jest.fn<(sql: string) => Promise<any>>().mockImplementation(async (sql: string) => {
        if (sql.includes('ADD COLUMN outcome')) {
          throw new Error('disk I/O error');
        }
        return {};
      }),
      get: jest.fn<() => Promise<any>>().mockResolvedValue({ name: 'delivery_receipts' }),
    } as unknown as Database;
    const receipts = new DeliveryReceiptRepository(db);

    await expect(receipts.ensureSchema()).rejects.toThrow('disk I/O error');

    // Schema was not marked ensured: retrying will attempt migrations again rather than skipping
    expect(db.get).toHaveBeenCalledTimes(1);
    await expect(receipts.ensureSchema()).rejects.toThrow('disk I/O error');
    expect(db.get).toHaveBeenCalledTimes(2);
  });

  it('resumes partially completed migrations safely upon retry', async () => {
    let failOnContractAddress = true;
    const db = {
      run: jest.fn<(sql: string) => Promise<any>>().mockImplementation(async (sql: string) => {
        if (sql.includes('ADD COLUMN contract_address') && failOnContractAddress) {
          throw new Error('database is locked');
        }
        if (sql.includes('ADD COLUMN event_id') && !failOnContractAddress) {
          // On second run, event_id is already added in the database
          throw new Error('duplicate column name: event_id');
        }
        return {};
      }),
      get: jest.fn<() => Promise<any>>().mockResolvedValue({ name: 'delivery_receipts' }),
    } as unknown as Database;
    const receipts = new DeliveryReceiptRepository(db);

    // Run 1: Fails mid-migration at contract_address
    await expect(receipts.ensureSchema()).rejects.toThrow('database is locked');

    // Run 2: Lock released; event_id reports duplicate-column; remaining migrations succeed
    failOnContractAddress = false;
    await expect(receipts.ensureSchema()).resolves.not.toThrow();

    // Now schema is fully ensured; third call is a no-op
    await receipts.ensureSchema();
    expect(db.get).toHaveBeenCalledTimes(2);
  });

  it('handles concurrent ensureSchema calls safely', async () => {
    let runCallCount = 0;
    const db = {
      run: jest.fn<() => Promise<any>>().mockImplementation(async () => {
        runCallCount++;
        return {};
      }),
      get: jest.fn<() => Promise<any>>().mockResolvedValue({ name: 'delivery_receipts' }),
    } as unknown as Database;
    const receipts = new DeliveryReceiptRepository(db);

    // Call concurrently on the same repository instance
    await Promise.all([receipts.ensureSchema(), receipts.ensureSchema(), receipts.ensureSchema()]);

    expect(db.get).toHaveBeenCalledTimes(1);
  });
});
