import { xdr } from '@stellar/stellar-sdk';
import {
  getEventName,
  matchesEventFilter,
  validateEventPayload,
  validateRpcResponse,
  parseEventVersion,
  validateEventVersion,
  CURRENT_EVENT_VERSION,
  SUPPORTED_EVENT_VERSIONS,
} from './event-utils';
import { NotificationFixtureBuilder } from '../test-utils/notification-fixture-builder';

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

  // ---------------------------------------------------------------------------
  // Version constants
  // ---------------------------------------------------------------------------

  describe('version constants', () => {
    it('CURRENT_EVENT_VERSION is 1', () => {
      expect(CURRENT_EVENT_VERSION).toBe(1);
    });

    it('SUPPORTED_EVENT_VERSIONS contains version 1', () => {
      expect(SUPPORTED_EVENT_VERSIONS.has(1)).toBe(true);
    });

    it('SUPPORTED_EVENT_VERSIONS does not contain version 0', () => {
      expect(SUPPORTED_EVENT_VERSIONS.has(0)).toBe(false);
    });
  });

  // ---------------------------------------------------------------------------
  // parseEventVersion
  // ---------------------------------------------------------------------------

  describe('parseEventVersion', () => {
    describe('ScvMap payloads (NotificationScheduled-style)', () => {
      it('extracts payload_version from an ScvMap built with the fixture helper', () => {
        const event = NotificationFixtureBuilder.aStellarEvent()
          .withPayloadVersion(1)
          .build();

        const result = parseEventVersion(event.value);

        expect(result.found).toBe(true);
        expect(result.version).toBe(1);
        expect(result.parseError).toBeUndefined();
      });

      it('returns found=false when the map contains no payload_version key', () => {
        // A map with an unrelated key
        const value = xdr.ScVal.scvMap([
          new xdr.ScMapEntry({
            key: xdr.ScVal.scvSymbol('notification_id'),
            val: xdr.ScVal.scvU32(42),
          }),
        ]);

        const result = parseEventVersion(value);

        expect(result.found).toBe(false);
        expect(result.version).toBeUndefined();
      });

      it('returns a parseError when payload_version value is zero (invalid)', () => {
        const value = xdr.ScVal.scvMap([
          new xdr.ScMapEntry({
            key: xdr.ScVal.scvSymbol('payload_version'),
            val: xdr.ScVal.scvU32(0),
          }),
        ]);

        const result = parseEventVersion(value);

        expect(result.found).toBe(true);
        expect(result.version).toBeUndefined();
        expect(result.parseError).toMatch(/not a positive integer/i);
      });

      it('handles a map that also contains other fields alongside payload_version', () => {
        const value = xdr.ScVal.scvMap([
          new xdr.ScMapEntry({
            key: xdr.ScVal.scvSymbol('notification_id'),
            val: xdr.ScVal.scvU32(99),
          }),
          new xdr.ScMapEntry({
            key: xdr.ScVal.scvSymbol('payload_version'),
            val: xdr.ScVal.scvU32(1),
          }),
        ]);

        const result = parseEventVersion(value);

        expect(result.found).toBe(true);
        expect(result.version).toBe(1);
      });
    });

    describe('bare integer payloads', () => {
      it('extracts version from a bare ScvU32', () => {
        const result = parseEventVersion(xdr.ScVal.scvU32(1));

        expect(result.found).toBe(true);
        expect(result.version).toBe(1);
      });

      it('returns a parseError for a bare ScvU32 of zero', () => {
        const result = parseEventVersion(xdr.ScVal.scvU32(0));

        expect(result.found).toBe(true);
        expect(result.version).toBeUndefined();
        expect(result.parseError).toMatch(/not a positive integer/i);
      });
    });

    describe('pre-versioned / legacy event payloads', () => {
      it('returns found=false for a bare string value (pre-versioned event)', () => {
        const result = parseEventVersion(xdr.ScVal.scvString('legacy-payload'));

        expect(result.found).toBe(false);
        expect(result.version).toBeUndefined();
      });

      it('returns found=false for a symbol value (pre-versioned event)', () => {
        const result = parseEventVersion(xdr.ScVal.scvSymbol('AutoshareCreated'));

        expect(result.found).toBe(false);
        expect(result.version).toBeUndefined();
      });

      it('returns found=false for an empty map', () => {
        const result = parseEventVersion(xdr.ScVal.scvMap([]));

        expect(result.found).toBe(false);
        expect(result.version).toBeUndefined();
      });
    });

    describe('representative event fixtures via StellarEventBuilder', () => {
      it('returns found=false for a default StellarEventBuilder event (string value)', () => {
        const event = NotificationFixtureBuilder.aStellarEvent().build();

        const result = parseEventVersion(event.value);

        expect(result.found).toBe(false);
      });

      it('parses version 1 from a NotificationScheduled-style fixture', () => {
        const event = NotificationFixtureBuilder.aStellarEvent()
          .withTopicSymbol('NotificationScheduled')
          .withPayloadVersion(1)
          .build();

        const result = parseEventVersion(event.value);

        expect(result.found).toBe(true);
        expect(result.version).toBe(1);
      });
    });
  });

  // ---------------------------------------------------------------------------
  // validateEventVersion
  // ---------------------------------------------------------------------------

  describe('validateEventVersion', () => {
    describe('supported versions', () => {
      it('accepts version 1 (current supported version)', () => {
        const event = NotificationFixtureBuilder.aStellarEvent()
          .withPayloadVersion(1)
          .build();

        expect(validateEventVersion(event.value)).toEqual({ valid: true });
      });

      it('accepts version 1 built from a bare ScvU32', () => {
        expect(validateEventVersion(xdr.ScVal.scvU32(1))).toEqual({ valid: true });
      });
    });

    describe('backward compatibility — no version field', () => {
      it('accepts a pre-versioned string payload (no payload_version key)', () => {
        const event = NotificationFixtureBuilder.aStellarEvent()
          .withStringValue('legacy')
          .build();

        expect(validateEventVersion(event.value)).toEqual({ valid: true });
      });

      it('accepts a pre-versioned symbol payload', () => {
        expect(validateEventVersion(xdr.ScVal.scvSymbol('AutoshareCreated'))).toEqual({
          valid: true,
        });
      });

      it('accepts a map that has no payload_version key', () => {
        const value = xdr.ScVal.scvMap([
          new xdr.ScMapEntry({
            key: xdr.ScVal.scvSymbol('notification_id'),
            val: xdr.ScVal.scvU32(7),
          }),
        ]);

        expect(validateEventVersion(value)).toEqual({ valid: true });
      });

      it('accepts an empty map (pre-versioned event data)', () => {
        expect(validateEventVersion(xdr.ScVal.scvMap([]))).toEqual({ valid: true });
      });
    });

    describe('unsupported versions — actionable errors', () => {
      it('rejects a future version with a descriptive reason', () => {
        const value = xdr.ScVal.scvMap([
          new xdr.ScMapEntry({
            key: xdr.ScVal.scvSymbol('payload_version'),
            val: xdr.ScVal.scvU32(999),
          }),
        ]);

        const result = validateEventVersion(value);

        expect(result.valid).toBe(false);
        expect(result.reason).toMatch(/unsupported event payload version 999/i);
        expect(result.reason).toMatch(/supported versions are \[1\]/i);
      });

      it('rejects version 2 when only version 1 is supported', () => {
        const value = xdr.ScVal.scvMap([
          new xdr.ScMapEntry({
            key: xdr.ScVal.scvSymbol('payload_version'),
            val: xdr.ScVal.scvU32(2),
          }),
        ]);

        const result = validateEventVersion(value);

        expect(result.valid).toBe(false);
        expect(result.reason).toMatch(/2/);
      });

      it('rejects a zero payload_version with a descriptive reason', () => {
        const value = xdr.ScVal.scvMap([
          new xdr.ScMapEntry({
            key: xdr.ScVal.scvSymbol('payload_version'),
            val: xdr.ScVal.scvU32(0),
          }),
        ]);

        const result = validateEventVersion(value);

        expect(result.valid).toBe(false);
        expect(result.reason).toMatch(/unsupported event payload version/i);
      });

      it('rejects a bare ScvU32 of zero', () => {
        const result = validateEventVersion(xdr.ScVal.scvU32(0));

        expect(result.valid).toBe(false);
        expect(result.reason).toMatch(/unsupported event payload version/i);
      });
    });

    describe('existing event formats remain supported', () => {
      it('accepts a default StellarEventBuilder event unchanged', () => {
        const event = NotificationFixtureBuilder.aStellarEvent().build();

        expect(validateEventVersion(event.value)).toEqual({ valid: true });
      });

      it('accepts events built with withStringValue (legacy format)', () => {
        const event = NotificationFixtureBuilder.aStellarEvent()
          .withStringValue('some-legacy-payload')
          .build();

        expect(validateEventVersion(event.value)).toEqual({ valid: true });
      });

      it('accepts events built with withSymbolValue (legacy format)', () => {
        const event = NotificationFixtureBuilder.aStellarEvent()
          .withSymbolValue('AutoshareCreated')
          .build();

        expect(validateEventVersion(event.value)).toEqual({ valid: true });
      });
    });
  });
});
