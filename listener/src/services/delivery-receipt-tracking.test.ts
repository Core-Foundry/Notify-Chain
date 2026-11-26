import { describe, expect, it, jest } from '@jest/globals';
import {
  determineDeliveryOutcome,
  DeliveryOutcome,
  DeliveryReceipt,
  CreateDeliveryReceiptInput,
} from '../types/delivery-receipt';
import { DeliveryReceiptRepository } from './delivery-receipt-repository';
import { Database } from '../database/database';

describe('Issue #1116 — Delivery Receipt Tracking', () => {
  describe('Acceptance Criteria 1: Every delivery attempt has a traceable receipt', () => {
    it('creates distinct receipts for multiple delivery attempts without overwriting previous attempts', async () => {
      const storedReceipts: any[] = [];
      let autoId = 1;

      const db = {
        get: jest.fn<() => Promise<any>>().mockResolvedValue(null),
        run: jest.fn(async (sql: string, params: any[]) => {
          const id = autoId++;
          storedReceipts.push({
            id,
            notification_id: params[0],
            channel: params[1],
            status: params[2],
            attempt_count: params[3],
            provider_message_id: params[4],
            provider_response: params[5],
            error_code: params[6],
            error_message: params[7],
            event_id: params[8],
            contract_address: params[9],
            outcome: params[10],
            provider_status: params[11],
            attempt_timestamp: params[12],
            delivered_at: params[13],
            created_at: new Date().toISOString(),
          });
          return { lastID: id, changes: 1 };
        }),
        all: jest.fn(async (sql: string, params: any[]) => {
          if (sql.includes('notification_id = ?')) {
            return storedReceipts.filter((r) => r.notification_id === params[0]);
          }
          if (sql.includes('event_id = ?')) {
            return storedReceipts.filter((r) => r.event_id === params[0]);
          }
          return storedReceipts;
        }),
      } as unknown as Database;

      const repository = new DeliveryReceiptRepository(db);

      // Attempt 1: First try fails with network timeout (UNKNOWN)
      const receipt1Id = await repository.create({
        notificationId: 501,
        channel: 'webhook',
        status: 'failed',
        attemptCount: 1,
        providerMessageId: null,
        eventId: 'stellar-tx-abc-001',
        contractAddress: 'CDEMO_CONTRACT_ADDRESS_111',
        outcome: 'UNKNOWN',
        providerStatus: 504,
        errorMessage: 'Gateway Timeout connecting to webhook endpoint',
      });

      // Attempt 2: Retry succeeds with provider acceptance (ACCEPTED)
      const receipt2Id = await repository.create({
        notificationId: 501,
        channel: 'webhook',
        status: 'delivered',
        attemptCount: 2,
        providerMessageId: 'prov-msg-888',
        eventId: 'stellar-tx-abc-001',
        contractAddress: 'CDEMO_CONTRACT_ADDRESS_111',
        outcome: 'ACCEPTED',
        providerStatus: 200,
        providerResponse: { statusCode: 200, messageId: 'prov-msg-888' },
      });

      expect(receipt1Id).toBe(1);
      expect(receipt2Id).toBe(2);
      expect(storedReceipts).toHaveLength(2);

      // Verify previous receipt was preserved and not overwritten
      const notificationReceipts = await repository.findByNotificationId(501);
      expect(notificationReceipts).toHaveLength(2);
      expect(notificationReceipts[0].attemptCount).toBe(1);
      expect(notificationReceipts[0].outcome).toBe('UNKNOWN');
      expect(notificationReceipts[0].status).toBe('failed');

      expect(notificationReceipts[1].attemptCount).toBe(2);
      expect(notificationReceipts[1].outcome).toBe('ACCEPTED');
      expect(notificationReceipts[1].status).toBe('delivered');
      expect(notificationReceipts[1].providerMessageId).toBe('prov-msg-888');

      // Verify both receipts share the originating event ID
      const eventReceipts = await repository.findByEventId('stellar-tx-abc-001');
      expect(eventReceipts).toHaveLength(2);
      expect(eventReceipts[0].eventId).toBe('stellar-tx-abc-001');
      expect(eventReceipts[1].eventId).toBe('stellar-tx-abc-001');
    });
  });

  describe('Acceptance Criteria 2: Provider responses are recorded safely', () => {
    it('redacts authorization headers, API keys, bearer tokens, URLs and personal data', async () => {
      let savedParams: any[] = [];
      const db = {
        get: jest.fn<() => Promise<any>>().mockResolvedValue(null),
        run: jest.fn(async (sql: string, params: any[]) => {
          savedParams = params;
          return { lastID: 1, changes: 1 };
        }),
      } as unknown as Database;

      const repository = new DeliveryReceiptRepository(db);

      await repository.create({
        notificationId: 700,
        channel: 'webhook',
        status: 'failed',
        attemptCount: 1,
        providerMessageId: null,
        eventId: 'evt-secure-test',
        contractAddress: 'C_SECURE_CONTRACT',
        outcome: 'REJECTED',
        providerStatus: 401,
        providerResponse: {
          statusCode: 401,
          messageId: 'sec-msg-01',
          authorization: 'Bearer secret-token-xyz',
          apiKey: 'key_live_9999999999999999',
          userEmail: 'alice@company.internal',
          secretPayload: { sensitive: true },
        },
        errorCode: 'UNAUTHORIZED',
        errorMessage:
          'Failed request to https://hooks.slack.com/services/T00/B00/secretKey with Bearer super-secret-value and email bob@example.com',
      });

      const providerResponseStr = savedParams[5];
      const errorCode = savedParams[6];
      const errorMessage = savedParams[7];

      // Provider response only allows safe fields (statusCode, messageId, etc.)
      const parsedResponse = JSON.parse(providerResponseStr);
      expect(parsedResponse).toEqual({ statusCode: 401, messageId: 'sec-msg-01' });
      expect(parsedResponse.authorization).toBeUndefined();
      expect(parsedResponse.apiKey).toBeUndefined();
      expect(parsedResponse.userEmail).toBeUndefined();
      expect(parsedResponse.secretPayload).toBeUndefined();

      // Error code preserved if standard safe format
      expect(errorCode).toBe('UNAUTHORIZED');

      // Error message redacts URLs, Bearer tokens, and emails
      expect(errorMessage).not.toContain('https://hooks.slack.com');
      expect(errorMessage).toContain('[REDACTED_URL]');
      expect(errorMessage).not.toContain('super-secret-value');
      expect(errorMessage).toContain('Bearer [REDACTED]');
      expect(errorMessage).not.toContain('bob@example.com');
      expect(errorMessage).toContain('[REDACTED_EMAIL]');
    });
  });

  describe('Acceptance Criteria 3: Delivery history can be queried', () => {
    it('supports querying history by eventId, contractAddress, outcome, channel, and date range with pagination', async () => {
      const db = {
        get: jest.fn<() => Promise<any>>().mockResolvedValue({ total: 3 }),
        all: jest.fn<() => Promise<any[]>>().mockResolvedValue([
          {
            id: 10,
            notification_id: 101,
            channel: 'webhook',
            status: 'failed',
            attempt_count: 1,
            provider_message_id: null,
            provider_response: '{"statusCode":500}',
            error_code: 'SERVER_ERROR',
            error_message: 'Internal error',
            event_id: 'evt-target-1',
            contract_address: 'C_TARGET_CONTRACT',
            outcome: 'UNKNOWN',
            provider_status: 500,
            attempt_timestamp: '2026-11-21T10:00:00.000Z',
            delivered_at: null,
            created_at: '2026-11-21T10:00:00.000Z',
          },
        ]),
      } as unknown as Database;

      const repository = new DeliveryReceiptRepository(db);

      const result = await repository.queryHistory({
        eventId: 'evt-target-1',
        contractAddress: 'C_TARGET_CONTRACT',
        outcome: 'UNKNOWN',
        channel: 'webhook',
        status: 'failed',
        startDate: new Date('2026-11-21T00:00:00.000Z'),
        endDate: new Date('2026-11-21T23:59:59.999Z'),
        limit: 20,
        offset: 0,
      });

      expect(result.total).toBe(3);
      expect(result.receipts).toHaveLength(1);
      expect(result.receipts[0].eventId).toBe('evt-target-1');
      expect(result.receipts[0].contractAddress).toBe('C_TARGET_CONTRACT');
      expect(result.receipts[0].outcome).toBe('UNKNOWN');
      expect(result.receipts[0].channel).toBe('webhook');

      const countCall = (db.get as jest.Mock).mock.calls[0];
      const queryCall = (db.all as jest.Mock).mock.calls[0];

      expect(countCall[0]).toContain('SELECT COUNT(*) as count FROM delivery_receipts');
      expect(queryCall[0]).toContain('SELECT * FROM delivery_receipts');
      expect(queryCall[0]).toContain('LIMIT ? OFFSET ?');
    });
  });

  describe('Acceptance Criteria 4: Distinguish ACCEPTED, REJECTED, and UNKNOWN delivery outcomes', () => {
    describe('ACCEPTED outcome semantics', () => {
      it('classifies 200, 201, 202, 204 as ACCEPTED', () => {
        expect(determineDeliveryOutcome({ success: true, statusCode: 200 })).toBe('ACCEPTED');
        expect(determineDeliveryOutcome({ success: true, statusCode: 201 })).toBe('ACCEPTED');
        expect(determineDeliveryOutcome({ success: true, statusCode: 202 })).toBe('ACCEPTED');
        expect(determineDeliveryOutcome({ success: true, statusCode: 204 })).toBe('ACCEPTED');
      });

      it('classifies success=true with undefined statusCode as ACCEPTED', () => {
        expect(determineDeliveryOutcome({ success: true })).toBe('ACCEPTED');
      });
    });

    describe('REJECTED outcome semantics', () => {
      it('classifies client errors (400, 401, 403, 404, 413, 415, 422) as REJECTED', () => {
        expect(determineDeliveryOutcome({ success: false, statusCode: 400 })).toBe('REJECTED');
        expect(determineDeliveryOutcome({ success: false, statusCode: 401 })).toBe('REJECTED');
        expect(determineDeliveryOutcome({ success: false, statusCode: 403 })).toBe('REJECTED');
        expect(determineDeliveryOutcome({ success: false, statusCode: 404 })).toBe('REJECTED');
        expect(determineDeliveryOutcome({ success: false, statusCode: 413 })).toBe('REJECTED');
        expect(determineDeliveryOutcome({ success: false, statusCode: 415 })).toBe('REJECTED');
        expect(determineDeliveryOutcome({ success: false, statusCode: 422 })).toBe('REJECTED');
      });

      it('classifies explicit rejection error codes as REJECTED', () => {
        expect(
          determineDeliveryOutcome({
            success: false,
            errorCode: 'INVALID_PAYLOAD',
            errorMessage: 'Malformed payload rejected by provider',
          }),
        ).toBe('REJECTED');

        expect(
          determineDeliveryOutcome({
            success: false,
            errorCode: 'UNAUTHORIZED',
            errorMessage: 'Webhook secret invalid',
          }),
        ).toBe('REJECTED');
      });

      it('does NOT classify 429 (rate limit) or 408 (timeout) as REJECTED', () => {
        // 429 is temporary backpressure, not rejection of notification validity
        expect(determineDeliveryOutcome({ success: false, statusCode: 429 })).toBe('UNKNOWN');
        // 408 is timeout, cannot establish whether provider processed it
        expect(determineDeliveryOutcome({ success: false, statusCode: 408 })).toBe('UNKNOWN');
      });
    });

    describe('UNKNOWN outcome semantics', () => {
      it('classifies 5xx server errors as UNKNOWN', () => {
        expect(determineDeliveryOutcome({ success: false, statusCode: 500 })).toBe('UNKNOWN');
        expect(determineDeliveryOutcome({ success: false, statusCode: 502 })).toBe('UNKNOWN');
        expect(determineDeliveryOutcome({ success: false, statusCode: 503 })).toBe('UNKNOWN');
        expect(determineDeliveryOutcome({ success: false, statusCode: 504 })).toBe('UNKNOWN');
      });

      it('classifies timeouts (AbortError, ETIMEDOUT, timeout message) as UNKNOWN', () => {
        expect(
          determineDeliveryOutcome({
            success: false,
            errorCode: 'TIMEOUT',
            errorMessage: 'Request timed out after 5000ms',
          }),
        ).toBe('UNKNOWN');

        expect(
          determineDeliveryOutcome({
            success: false,
            errorCode: 'ETIMEDOUT',
            errorMessage: 'connect ETIMEDOUT 10.0.0.1:443',
          }),
        ).toBe('UNKNOWN');

        expect(
          determineDeliveryOutcome({
            success: false,
            errorMessage: 'The operation was aborted due to timeout',
          }),
        ).toBe('UNKNOWN');
      });

      it('classifies network failures (ECONNRESET, ENOTFOUND, network drop) as UNKNOWN', () => {
        expect(
          determineDeliveryOutcome({
            success: false,
            errorCode: 'ECONNRESET',
            errorMessage: 'socket hang up',
          }),
        ).toBe('UNKNOWN');

        expect(
          determineDeliveryOutcome({
            success: false,
            errorCode: 'ENOTFOUND',
            errorMessage: 'getaddrinfo ENOTFOUND api.provider.com',
          }),
        ).toBe('UNKNOWN');
      });

      it('classifies ambiguous or missing provider response as UNKNOWN', () => {
        expect(determineDeliveryOutcome({ success: false })).toBe('UNKNOWN');
        expect(determineDeliveryOutcome({ success: false, statusCode: 0 })).toBe('UNKNOWN');
      });
    });
  });
});
