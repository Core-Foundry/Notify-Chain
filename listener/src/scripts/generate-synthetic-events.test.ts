import { createSyntheticEvent, generateBatch } from './generate-synthetic-events';

describe('Synthetic Event Generator (Issue #699)', () => {
  test('generates valid schema-compliant synthetic transfer events', () => {
    const event = createSyntheticEvent('transfer');

    expect(event.id).toMatch(/^syn-/);
    expect(event.eventName).toBe('transfer');
    expect(event.type).toBe('contract');
    expect(event.topics).toContain('transfer');
    expect(event.data).toHaveProperty('from');
    expect(event.data).toHaveProperty('to');
    expect(event.data).toHaveProperty('amount');
    expect(event.timestamp).toBeDefined();
  });

  test('generates batches of deterministic events', () => {
    const batch = generateBatch({ count: 6 });

    expect(batch.length).toBe(6);
    expect(new Set(batch.map((e) => e.id)).size).toBe(6);
    expect(new Set(batch.map((e) => e.txHash)).size).toBe(6);
  });

  test('respects custom contract addresses and event types', () => {
    const customContract = 'CCONTRACTADDRESS1234567890123456789012345678901234567890';
    const batch = generateBatch({
      count: 3,
      contractAddress: customContract,
      eventType: 'bounty_awarded',
    });

    expect(batch.length).toBe(3);
    batch.forEach((e) => {
      expect(e.contractAddress).toBe(customContract);
      expect(e.eventName).toBe('bounty_awarded');
    });
  });
});
