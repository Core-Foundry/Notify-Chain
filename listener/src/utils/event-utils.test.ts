import { xdr } from '@stellar/stellar-sdk';
import {
  getEventName,
  matchesEventFilter,
  validateEventPayload,
  validateRpcResponse,
} from './event-utils';

function createValidEvent(overrides: Record<string, unknown> = {}) {
  return {
    id: 'event-1',
    type: 'contract',
    ledger: 100,
    ledgerClosedAt: '2026-01-01T00:00:00Z',
    transactionIndex: 0,
    operationIndex: 0,
    inSuccessfulContractCall: true,
    txHash: 'hash',
    topic: [xdr.ScVal.scvSymbol('TaskCreated')],
    value: xdr.ScVal.scvU32(1),
    ...overrides,
  };
}

function createValidRpcResponse(overrides: Record<string, unknown> = {}) {
  return {
    latestLedger: 123,
    events: [
      {
        id: 'event-1',
        type: 'contract',
        ledger: 100,
        txHash: 'hash',
        topic: [],
        value: 1,
      },
    ],
    cursor: 'cursor-1',
    ...overrides,
  };
}

describe('event-utils', () => {
  describe('validateEventPayload', () => {
    it('accepts a complete event payload', () => {
      expect(validateEventPayload(createValidEvent() as any)).toEqual({
        valid: true,
      });
    });

    it('rejects missing event id', () => {
      const result = validateEventPayload(createValidEvent({ id: '' }) as any);
      expect(result.valid).toBe(false);
      expect(result.reason).toMatch(/id/i);
    });

    it('rejects missing event type', () => {
      const result = validateEventPayload(
        createValidEvent({ type: undefined }) as any
      );
      expect(result.valid).toBe(false);
      expect(result.reason).toMatch(/type/i);
    });

    it('rejects invalid ledger values', () => {
      const result = validateEventPayload(createValidEvent({ ledger: -1 }) as any);
      expect(result.valid).toBe(false);
      expect(result.reason).toMatch(/ledger/i);
    });

    it('rejects non-array topics', () => {
      const result = validateEventPayload(
        createValidEvent({ topic: undefined }) as any
      );
      expect(result.valid).toBe(false);
      expect(result.reason).toMatch(/topic/i);
    });

    it('rejects missing event value', () => {
      const result = validateEventPayload(
        createValidEvent({ value: undefined }) as any
      );
      expect(result.valid).toBe(false);
      expect(result.reason).toMatch(/value/i);
    });
  });

  describe('getEventName', () => {
    it('extracts symbol names from topics', () => {
      expect(
        getEventName([xdr.ScVal.scvSymbol('AutoshareCreated')])
      ).toBe('AutoshareCreated');
    });

    it('returns null for empty topics', () => {
      expect(getEventName([])).toBeNull();
    });
  });

  describe('matchesEventFilter', () => {
    it('matches all events when wildcard is configured', () => {
      expect(matchesEventFilter('TaskCreated', ['*'])).toBe(true);
      expect(matchesEventFilter(null, ['*'])).toBe(true);
    });

    it('matches only configured event names', () => {
      expect(matchesEventFilter('TaskCreated', ['TaskCreated'])).toBe(true);
      expect(matchesEventFilter('WorkSubmitted', ['TaskCreated'])).toBe(false);
    });

    it('rejects unnamed events when specific filters are configured', () => {
      expect(matchesEventFilter(null, ['TaskCreated'])).toBe(false);
    });
  });

  describe('validateRpcResponse', () => {
    it('accepts a complete RPC response', () => {
      expect(validateRpcResponse(createValidRpcResponse() as any)).toEqual({
        valid: true,
      });
    });

    it('rejects a null response', () => {
      const result = validateRpcResponse(null);
      expect(result.valid).toBe(false);
      expect(result.reason).toMatch(/missing/i);
    });

    it('rejects a non-object response', () => {
      const result = validateRpcResponse('not-an-object' as any);
      expect(result.valid).toBe(false);
      expect(result.reason).toMatch(/not an object/i);
    });

    it('rejects a response missing the events field', () => {
      const result = validateRpcResponse(
        createValidRpcResponse({ events: undefined }) as any
      );
      expect(result.valid).toBe(false);
      expect(result.reason).toMatch(/events/i);
    });

    it('rejects a response whose events field is not an array', () => {
      const result = validateRpcResponse(
        createValidRpcResponse({ events: 'not-an-array' }) as any
      );
      expect(result.valid).toBe(false);
      expect(result.reason).toMatch(/events field is not an array/i);
    });

    it('rejects a response whose cursor is not a string', () => {
      const result = validateRpcResponse(
        createValidRpcResponse({ cursor: 123 }) as any
      );
      expect(result.valid).toBe(false);
      expect(result.reason).toMatch(/cursor/i);
    });

    it('accepts a response without a cursor', () => {
      const { cursor, ...rest } = createValidRpcResponse();
      expect(validateRpcResponse(rest as any)).toEqual({ valid: true });
    });
  });
});
