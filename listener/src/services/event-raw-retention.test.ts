import {
  captureRawEvent,
  createRetainedEvent,
  isRawEventData,
  isRetainedEventRecord,
  RawEventStore,
  DEFAULT_MAX_RAW_PAYLOAD_BYTES,
} from './event-raw-retention';

describe('Event Raw Retention (Issue #945)', () => {
  describe('Acceptance Criterion 1: Raw and normalized representations are distinguishable', () => {
    it('creates a raw representation with explicit discriminator and separate structure', () => {
      const rawPayload = {
        id: 'evt-001',
        topic: ['0x1234', '0x5678'],
        value: '0xabcd',
      };

      const raw = captureRawEvent(rawPayload);
      expect(raw).not.toBeNull();
      expect(raw?.format).toBe('raw');
      expect(isRawEventData(raw)).toBe(true);
      expect(typeof raw?.capturedAt).toBe('string');
      expect(raw?.sizeBytes).toBeGreaterThan(0);
      expect(raw?.payload).toEqual(rawPayload);
    });

    it('creates an envelope that clearly separates normalized fields from raw data', () => {
      const normalized = {
        eventId: 'evt-100',
        contractAddress: 'CCONTRACTADDR',
        ledger: 12345,
        eventName: 'NotificationScheduled',
        eventType: 'contract',
        topic: ['NotificationScheduled', 'recipient1'],
        value: '100',
        txHash: '0xhash',
        payloadVersion: 1,
      };

      const rawPayload = {
        id: 'evt-100',
        rawTopics: ['rawTopic1', 'rawTopic2'],
        rawValue: { encoded: true },
      };

      const retained = createRetainedEvent(normalized, rawPayload);

      expect(isRetainedEventRecord(retained)).toBe(true);
      expect(retained.kind).toBe('retained_event');
      expect(retained.eventId).toBe('evt-100');
      expect(retained.contractAddress).toBe('CCONTRACTADDR');

      // Normalized fields are completely intact and structured
      expect(retained.normalized.eventName).toBe('NotificationScheduled');
      expect(retained.normalized.topic).toEqual(['NotificationScheduled', 'recipient1']);

      // Raw fields are clearly partitioned in the raw container
      expect(retained.raw?.format).toBe('raw');
      expect(retained.raw?.payload).toEqual(rawPayload);
    });

    it('type guards distinguish between raw, retained, and arbitrary objects', () => {
      const raw = captureRawEvent({ foo: 'bar' });
      expect(isRawEventData(raw)).toBe(true);
      expect(isRawEventData({ foo: 'bar' })).toBe(false);
      expect(isRawEventData(null)).toBe(false);

      const retained = createRetainedEvent(
        { eventId: 'e', contractAddress: 'c', ledger: 1 },
        { some: 'raw' },
      );
      expect(isRetainedEventRecord(retained)).toBe(true);
      expect(isRetainedEventRecord({ kind: 'other' })).toBe(false);
    });

    it('handles null/undefined raw input gracefully while keeping envelope valid', () => {
      const retained = createRetainedEvent(
        { eventId: 'e', contractAddress: 'c', ledger: 1 },
        null,
      );
      expect(retained.raw).toBeNull();
      expect(isRetainedEventRecord(retained)).toBe(true);

      const capturedUndefined = captureRawEvent(undefined);
      expect(capturedUndefined).toBeNull();
    });

    it('is idempotent and prevents double-wrapping already captured RawEventData', () => {
      const initial = captureRawEvent({ topic: ['0x1'], value: '42' });
      expect(initial).not.toBeNull();
      expect(isRawEventData(initial)).toBe(true);

      const second = captureRawEvent(initial);
      expect(second).toBe(initial);
      expect(second?.format).toBe('raw');
      expect((second?.payload as any).format).toBeUndefined();
    });

    it('safely captures number, boolean and primitive raw payloads', () => {
      const numRaw = captureRawEvent(12345);
      expect(numRaw?.payload).toBe(12345);
      expect(numRaw?.format).toBe('raw');

      const boolRaw = captureRawEvent(true);
      expect(boolRaw?.payload).toBe(true);
    });
  });

  describe('Acceptance Criterion 2: Storage limits are enforced', () => {
    it('accepts payloads within default size limit without truncation', () => {
      const payload = { data: 'a'.repeat(1000) };
      const raw = captureRawEvent(payload);
      expect(raw?.truncated).toBeUndefined();
      expect(raw?.sizeBytes).toBeLessThan(DEFAULT_MAX_RAW_PAYLOAD_BYTES);
    });

    it('enforces custom maxPayloadBytes limit and truncates oversized string payloads', () => {
      const hugeString = 'X'.repeat(500);
      const raw = captureRawEvent(hugeString, { maxPayloadBytes: 100 });

      expect(raw).not.toBeNull();
      expect(raw?.truncated).toBe(true);
      expect(raw?.sizeBytes).toBeLessThanOrEqual(100);
      expect(raw?.originalSizeBytes).toBe(500);
      expect(typeof raw?.payload).toBe('string');
      expect((raw?.payload as string).endsWith('... [TRUNCATED]')).toBe(true);
    });

    it('enforces custom maxPayloadBytes limit on oversized object payloads', () => {
      const largeObject = {
        key: 'A'.repeat(500),
        nested: { inner: 'B'.repeat(500) },
      };
      const raw = captureRawEvent(largeObject, { maxPayloadBytes: 200 });

      expect(raw).not.toBeNull();
      expect(raw?.truncated).toBe(true);
      expect(raw?.sizeBytes).toBeLessThanOrEqual(200);
      expect(raw?.originalSizeBytes).toBeGreaterThan(1000);
    });

    it('enforces store capacity limit with FIFO/LRU eviction in RawEventStore', () => {
      const store = new RawEventStore(3); // Capacity = 3

      store.set('evt-1', 'contract-a', { id: 1 });
      store.set('evt-2', 'contract-a', { id: 2 });
      store.set('evt-3', 'contract-a', { id: 3 });

      expect(store.count()).toBe(3);
      expect(store.has('evt-1', 'contract-a')).toBe(true);

      // Adding 4th event should evict evt-1
      store.set('evt-4', 'contract-a', { id: 4 });

      expect(store.count()).toBe(3);
      expect(store.has('evt-1', 'contract-a')).toBe(false);
      expect(store.has('evt-2', 'contract-a')).toBe(true);
      expect(store.has('evt-3', 'contract-a')).toBe(true);
      expect(store.has('evt-4', 'contract-a')).toBe(true);
    });

    it('reports accurate memory and byte utilization statistics', () => {
      const store = new RawEventStore(10);
      store.set('e1', 'c1', { hello: 'world' });
      store.set('e2', 'c1', { answer: 42 });

      const stats = store.getStats();
      expect(stats.count).toBe(2);
      expect(stats.maxEvents).toBe(10);
      expect(stats.totalBytes).toBeGreaterThan(0);
    });
  });

  describe('Acceptance Criterion 3: Sensitive values are not exposed unintentionally', () => {
    it('redacts Stellar secret seeds from raw event strings and payloads', () => {
      const secretSeed = 'SCZANGBA5YHTNYVVV4C3U252E2B6P6IRKD45DCAHSKV2U2B6P6IRKD45';
      const rawPayload = {
        contractId: 'C123',
        signerSecret: secretSeed,
        nested: {
          key: secretSeed,
        },
      };

      const raw = captureRawEvent(rawPayload);
      expect(raw).not.toBeNull();

      const serialized = JSON.stringify(raw?.payload);
      expect(serialized).not.toContain(secretSeed);
      expect(serialized).toContain('[REDACTED]');
    });

    it('redacts passwords, tokens, API keys, and authorization secrets', () => {
      const rawPayload = {
        username: 'alice',
        password: 'SuperSecretPassword123!',
        apiKey: 'sk_live_1234567890abcdef',
        bearerToken: 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9',
      };

      const raw = captureRawEvent(rawPayload);
      const payload = raw?.payload as Record<string, unknown>;

      expect(payload.username).toBe('alice');
      expect(payload.password).toBe('[REDACTED]');
      expect(payload.apiKey).toBe('[REDACTED]');
      expect(payload.bearerToken).toBe('[REDACTED]');
    });

    it('redacts embedded credentials from webhook URLs in raw event payloads', () => {
      const rawPayload = {
        webhookUrl: 'https://user:mysecretpass@notifications.example.com/hook',
        discordWebhook: 'https://discord.com/api/webhooks/123456789/my-private-discord-token',
      };

      const raw = captureRawEvent(rawPayload);
      const serialized = JSON.stringify(raw?.payload);

      expect(serialized).not.toContain('mysecretpass');
      expect(serialized).not.toContain('my-private-discord-token');
      expect(serialized).toContain('[REDACTED]');
    });

    it('redacts secrets even when they appear in plain string payloads', () => {
      const rawString = 'Failed notification to https://admin:secret123@api.com with token SCZANGBA5YHTNYVVV4C3U252E2B6P6IRKD45DCAHSKV2U2B6P6IRKD45';
      const raw = captureRawEvent(rawString);

      expect(raw?.payload).not.toContain('secret123');
      expect(raw?.payload).not.toContain('SCZANGBA5YHTNYVVV4C3U252E2B6P6IRKD45DCAHSKV2U2B6P6IRKD45');
    });
  });
});
