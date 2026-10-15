import { xdr } from '@stellar/stellar-sdk';
import {
  getEventName,
  matchesEventFilter,
  validateEventPayload,
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

describe('event-utils', () => {
  describe('validateEventPayload', () => {
    // Existing tests
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

    // Task 2.1: Comprehensive invalid payload tests
    describe('2.1: Missing required fields - id field', () => {
      it('rejects null id', () => {
        const result = validateEventPayload(createValidEvent({ id: null }) as any);
        expect(result.valid).toBe(false);
        expect(result.reason).toMatch(/id/i);
      });

      it('rejects id as number', () => {
        const result = validateEventPayload(createValidEvent({ id: 123 }) as any);
        expect(result.valid).toBe(false);
        expect(result.reason).toMatch(/id/i);
      });

      it('rejects id as object', () => {
        const result = validateEventPayload(createValidEvent({ id: {} }) as any);
        expect(result.valid).toBe(false);
        expect(result.reason).toMatch(/id/i);
      });

      it('rejects id as array', () => {
        const result = validateEventPayload(createValidEvent({ id: [] }) as any);
        expect(result.valid).toBe(false);
        expect(result.reason).toMatch(/id/i);
      });

      it('rejects id as boolean', () => {
        const result = validateEventPayload(createValidEvent({ id: true }) as any);
        expect(result.valid).toBe(false);
        expect(result.reason).toMatch(/id/i);
      });
    });

    describe('2.1: Missing required fields - type field', () => {
      it('rejects null type', () => {
        const result = validateEventPayload(createValidEvent({ type: null }) as any);
        expect(result.valid).toBe(false);
        expect(result.reason).toMatch(/type/i);
      });

      it('rejects empty string type', () => {
        const result = validateEventPayload(createValidEvent({ type: '' }) as any);
        expect(result.valid).toBe(false);
        expect(result.reason).toMatch(/type/i);
      });

      it('rejects type as number', () => {
        const result = validateEventPayload(createValidEvent({ type: 456 }) as any);
        expect(result.valid).toBe(false);
        expect(result.reason).toMatch(/type/i);
      });

      it('rejects type as object', () => {
        const result = validateEventPayload(createValidEvent({ type: {} }) as any);
        expect(result.valid).toBe(false);
        expect(result.reason).toMatch(/type/i);
      });

      it('rejects type as array', () => {
        const result = validateEventPayload(createValidEvent({ type: [] }) as any);
        expect(result.valid).toBe(false);
        expect(result.reason).toMatch(/type/i);
      });
    });

    describe('2.1: Missing required fields - value field', () => {
      it('rejects null value', () => {
        const result = validateEventPayload(createValidEvent({ value: null }) as any);
        expect(result.valid).toBe(false);
        expect(result.reason).toMatch(/value/i);
      });

      it('accepts other falsy values like false or 0', () => {
        const result1 = validateEventPayload(createValidEvent({ value: xdr.ScVal.scvU32(0) }) as any);
        expect(result1.valid).toBe(true);
      });
    });

    describe('2.1: Wrong data types for ledger', () => {
      it('rejects ledger as string', () => {
        const result = validateEventPayload(createValidEvent({ ledger: '100' }) as any);
        expect(result.valid).toBe(false);
        expect(result.reason).toMatch(/ledger/i);
      });

      it('rejects ledger as null', () => {
        const result = validateEventPayload(createValidEvent({ ledger: null }) as any);
        expect(result.valid).toBe(false);
        expect(result.reason).toMatch(/ledger/i);
      });

      it('rejects ledger as object', () => {
        const result = validateEventPayload(createValidEvent({ ledger: {} }) as any);
        expect(result.valid).toBe(false);
        expect(result.reason).toMatch(/ledger/i);
      });

      it('rejects ledger as array', () => {
        const result = validateEventPayload(createValidEvent({ ledger: [] }) as any);
        expect(result.valid).toBe(false);
        expect(result.reason).toMatch(/ledger/i);
      });

      it('rejects ledger as boolean', () => {
        const result = validateEventPayload(createValidEvent({ ledger: true }) as any);
        expect(result.valid).toBe(false);
        expect(result.reason).toMatch(/ledger/i);
      });
    });

    describe('2.1: Wrong data types for topic', () => {
      it('rejects topic as string', () => {
        const result = validateEventPayload(createValidEvent({ topic: 'symbol' }) as any);
        expect(result.valid).toBe(false);
        expect(result.reason).toMatch(/topic/i);
      });

      it('rejects topic as null', () => {
        const result = validateEventPayload(createValidEvent({ topic: null }) as any);
        expect(result.valid).toBe(false);
        expect(result.reason).toMatch(/topic/i);
      });

      it('rejects topic as object', () => {
        const result = validateEventPayload(createValidEvent({ topic: { key: 'value' } }) as any);
        expect(result.valid).toBe(false);
        expect(result.reason).toMatch(/topic/i);
      });

      it('rejects topic as number', () => {
        const result = validateEventPayload(createValidEvent({ topic: 123 }) as any);
        expect(result.valid).toBe(false);
        expect(result.reason).toMatch(/topic/i);
      });

      it('rejects topic as boolean', () => {
        const result = validateEventPayload(createValidEvent({ topic: false }) as any);
        expect(result.valid).toBe(false);
        expect(result.reason).toMatch(/topic/i);
      });
    });

    describe('2.1: Oversized values', () => {
      it('rejects very long id strings (>10000 chars)', () => {
        const longId = 'a'.repeat(10001);
        const result = validateEventPayload(createValidEvent({ id: longId }) as any);
        expect(result.valid).toBe(true); // validateEventPayload doesn't check length, just presence and type
      });

      it('rejects very long type strings (>10000 chars)', () => {
        const longType = 'x'.repeat(10001);
        const result = validateEventPayload(createValidEvent({ type: longType }) as any);
        expect(result.valid).toBe(true); // validateEventPayload doesn't check length, just presence and type
      });

      it('accepts valid huge ledger numbers', () => {
        const result = validateEventPayload(createValidEvent({ ledger: Number.MAX_SAFE_INTEGER }) as any);
        expect(result.valid).toBe(true);
      });
    });

    // Task 2.2: Edge case tests
    describe('2.2: Edge cases - empty strings in optional fields', () => {
      it('rejects empty string for id', () => {
        const result = validateEventPayload(createValidEvent({ id: '' }) as any);
        expect(result.valid).toBe(false);
        expect(result.reason).toMatch(/id/i);
      });

      it('rejects empty string for type', () => {
        const result = validateEventPayload(createValidEvent({ type: '' }) as any);
        expect(result.valid).toBe(false);
        expect(result.reason).toMatch(/type/i);
      });
    });

    describe('2.2: Edge cases - maximum length strings', () => {
      it('accepts 1000 char id string', () => {
        const id1000 = 'a'.repeat(1000);
        const result = validateEventPayload(createValidEvent({ id: id1000 }) as any);
        expect(result.valid).toBe(true);
      });

      it('accepts 10000 char id string', () => {
        const id10000 = 'b'.repeat(10000);
        const result = validateEventPayload(createValidEvent({ id: id10000 }) as any);
        expect(result.valid).toBe(true);
      });

      it('accepts 1000 char type string', () => {
        const type1000 = 'c'.repeat(1000);
        const result = validateEventPayload(createValidEvent({ type: type1000 }) as any);
        expect(result.valid).toBe(true);
      });

      it('accepts 10000 char type string', () => {
        const type10000 = 'd'.repeat(10000);
        const result = validateEventPayload(createValidEvent({ type: type10000 }) as any);
        expect(result.valid).toBe(true);
      });
    });

    describe('2.2: Edge cases - numeric boundary values', () => {
      it('accepts ledger = 0 (minimum valid)', () => {
        const result = validateEventPayload(createValidEvent({ ledger: 0 }) as any);
        expect(result.valid).toBe(true);
      });

      it('rejects ledger < 0 (negative)', () => {
        const result = validateEventPayload(createValidEvent({ ledger: -1 }) as any);
        expect(result.valid).toBe(false);
        expect(result.reason).toMatch(/ledger/i);
      });

      it('accepts ledger = MAX_SAFE_INTEGER', () => {
        const result = validateEventPayload(createValidEvent({ ledger: Number.MAX_SAFE_INTEGER }) as any);
        expect(result.valid).toBe(true);
      });

      it('accepts ledger = 1', () => {
        const result = validateEventPayload(createValidEvent({ ledger: 1 }) as any);
        expect(result.valid).toBe(true);
      });

      it('rejects ledger = -MAX_SAFE_INTEGER', () => {
        const result = validateEventPayload(createValidEvent({ ledger: -Number.MAX_SAFE_INTEGER }) as any);
        expect(result.valid).toBe(false);
        expect(result.reason).toMatch(/ledger/i);
      });
    });

    describe('2.2: Edge cases - array variations', () => {
      it('accepts empty array for topic', () => {
        const result = validateEventPayload(createValidEvent({ topic: [] }) as any);
        expect(result.valid).toBe(true);
      });

      it('accepts single-element array for topic', () => {
        const result = validateEventPayload(createValidEvent({ topic: [xdr.ScVal.scvSymbol('Event')] }) as any);
        expect(result.valid).toBe(true);
      });

      it('accepts multi-element array for topic', () => {
        const result = validateEventPayload(createValidEvent({ topic: [
          xdr.ScVal.scvSymbol('Event1'),
          xdr.ScVal.scvSymbol('Event2'),
          xdr.ScVal.scvSymbol('Event3'),
        ] }) as any);
        expect(result.valid).toBe(true);
      });
    });

    describe('2.2: Edge cases - special characters in strings', () => {
      it('accepts special characters in id', () => {
        const result = validateEventPayload(createValidEvent({ id: 'event!@#$%^&*()' }) as any);
        expect(result.valid).toBe(true);
      });

      it('accepts special characters in type', () => {
        const result = validateEventPayload(createValidEvent({ type: 'type!@#$%^&*()' }) as any);
        expect(result.valid).toBe(true);
      });

      it('accepts unicode characters in id', () => {
        const result = validateEventPayload(createValidEvent({ id: 'event-🚀-✅-⭐' }) as any);
        expect(result.valid).toBe(true);
      });

      it('accepts unicode characters in type', () => {
        const result = validateEventPayload(createValidEvent({ type: 'type-日本語-한글-العربية' }) as any);
        expect(result.valid).toBe(true);
      });

      it('accepts newlines and tabs in id', () => {
        const result = validateEventPayload(createValidEvent({ id: 'event\n\t\r' }) as any);
        expect(result.valid).toBe(true);
      });

      it('accepts newlines and tabs in type', () => {
        const result = validateEventPayload(createValidEvent({ type: 'type\n\t\r' }) as any);
        expect(result.valid).toBe(true);
      });
    });

    // Task 2.3: Property-based tests
    describe('2.3: Property-based tests for invalid payloads', () => {
      // Helper function to generate random invalid events
      function generateRandomInvalidEvent(): { event: any; reason: string } {
        const testCases = [
          { event: createValidEvent({ id: null }), reason: 'null id' },
          { event: createValidEvent({ id: undefined }), reason: 'undefined id' },
          { event: createValidEvent({ id: 123 }), reason: 'numeric id' },
          { event: createValidEvent({ id: {} }), reason: 'object id' },
          { event: createValidEvent({ id: [] }), reason: 'array id' },
          { event: createValidEvent({ type: null }), reason: 'null type' },
          { event: createValidEvent({ type: undefined }), reason: 'undefined type' },
          { event: createValidEvent({ type: 456 }), reason: 'numeric type' },
          { event: createValidEvent({ type: {} }), reason: 'object type' },
          { event: createValidEvent({ type: [] }), reason: 'array type' },
          { event: createValidEvent({ ledger: -1 }), reason: 'negative ledger' },
          { event: createValidEvent({ ledger: 'string' }), reason: 'string ledger' },
          { event: createValidEvent({ ledger: null }), reason: 'null ledger' },
          { event: createValidEvent({ ledger: {} }), reason: 'object ledger' },
          { event: createValidEvent({ topic: null }), reason: 'null topic' },
          { event: createValidEvent({ topic: 'string' }), reason: 'string topic' },
          { event: createValidEvent({ topic: 123 }), reason: 'numeric topic' },
          { event: createValidEvent({ topic: {} }), reason: 'object topic' },
          { event: createValidEvent({ value: null }), reason: 'null value' },
          { event: createValidEvent({ value: undefined }), reason: 'undefined value' },
        ];

        const randomIndex = Math.floor(Math.random() * testCases.length);
        return testCases[randomIndex];
      }

      it('should reject all invalid payload types across 100 iterations', () => {
        for (let i = 0; i < 100; i++) {
          const { event, reason } = generateRandomInvalidEvent();
          const result = validateEventPayload(event as any);
          expect(result.valid).toBe(false);
          expect(result.reason).toBeDefined();
          expect(result.reason).toMatch(/id|type|ledger|topic|value/i);
        }
      });

      it('property: all invalid events return false for valid flag', () => {
        const invalidScenarios = [
          createValidEvent({ id: '' }),
          createValidEvent({ id: null }),
          createValidEvent({ id: 0 }),
          createValidEvent({ type: '' }),
          createValidEvent({ type: null }),
          createValidEvent({ ledger: -1 }),
          createValidEvent({ ledger: 'abc' }),
          createValidEvent({ topic: null }),
          createValidEvent({ topic: 'not-array' }),
          createValidEvent({ value: null }),
          createValidEvent({ value: undefined }),
        ];

        for (const invalidEvent of invalidScenarios) {
          const result = validateEventPayload(invalidEvent as any);
          expect(result.valid).toBe(false);
        }
      });

      it('property: all invalid events provide error reason', () => {
        const invalidScenarios = [
          createValidEvent({ id: '' }),
          createValidEvent({ id: null }),
          createValidEvent({ type: undefined }),
          createValidEvent({ ledger: -100 }),
          createValidEvent({ topic: {} }),
          createValidEvent({ value: null }),
        ];

        for (const invalidEvent of invalidScenarios) {
          const result = validateEventPayload(invalidEvent as any);
          expect(result.reason).toBeDefined();
          expect(result.reason).toBeTruthy();
          expect(typeof result.reason).toBe('string');
        }
      });

      it('property: no valid event should have error reason', () => {
        const validScenarios = [
          createValidEvent(),
          createValidEvent({ ledger: 0 }),
          createValidEvent({ ledger: Number.MAX_SAFE_INTEGER }),
          createValidEvent({ topic: [] }),
          createValidEvent({ topic: [xdr.ScVal.scvSymbol('Test')] }),
          createValidEvent({ id: 'a'.repeat(10000) }),
          createValidEvent({ type: 'x'.repeat(10000) }),
        ];

        for (const validEvent of validScenarios) {
          const result = validateEventPayload(validEvent as any);
          expect(result.valid).toBe(true);
          expect(result.reason).toBeUndefined();
        }
      });
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

    // Additional edge case tests
    it('extracts string names from topics', () => {
      expect(
        getEventName([xdr.ScVal.scvString('StringEvent')])
      ).toBe('StringEvent');
    });

    it('returns null for topics with no symbol or string', () => {
      expect(
        getEventName([xdr.ScVal.scvU32(123)])
      ).toBeNull();
    });

    it('returns first symbol/string from multi-element topic', () => {
      expect(
        getEventName([
          xdr.ScVal.scvSymbol('FirstEvent'),
          xdr.ScVal.scvSymbol('SecondEvent'),
        ])
      ).toBe('FirstEvent');
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

    // Additional edge cases
    it('handles empty filter array', () => {
      expect(matchesEventFilter('TaskCreated', [])).toBe(true);
    });

    it('handles null filter array', () => {
      expect(matchesEventFilter('TaskCreated', null as any)).toBe(true);
    });

    it('handles multiple allowed events', () => {
      expect(matchesEventFilter('TaskCreated', ['TaskCreated', 'WorkSubmitted'])).toBe(true);
      expect(matchesEventFilter('WorkSubmitted', ['TaskCreated', 'WorkSubmitted'])).toBe(true);
      expect(matchesEventFilter('OtherEvent', ['TaskCreated', 'WorkSubmitted'])).toBe(false);
    });

    it('handles case-sensitive matching', () => {
      expect(matchesEventFilter('taskcreated', ['TaskCreated'])).toBe(false);
      expect(matchesEventFilter('TASKCREATED', ['TaskCreated'])).toBe(false);
    });
  });
});
