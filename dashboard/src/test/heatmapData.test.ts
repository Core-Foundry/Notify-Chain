import {
  aggregateHeatmapData,
  filterEventsByDateRange,
  intensityLevel,
} from '../utils/heatmapData';
import type { BlockchainEvent } from '../types/event';

function makeEvent(overrides: Partial<BlockchainEvent> = {}): BlockchainEvent {
  return {
    eventId: 'evt-1',
    contractAddress: 'CABC',
    eventName: 'TaskCreated',
    ledger: 100,
    type: 'contract',
    topic: ['TaskCreated'],
    value: '42',
    txHash: 'tx-0001',
    receivedAt: Date.now(),
    ...overrides,
  };
}

describe('filterEventsByDateRange', () => {
  const events = [
    makeEvent({ eventId: 'e1', receivedAt: new Date('2026-01-10T12:00:00Z').getTime() }),
    makeEvent({ eventId: 'e2', receivedAt: new Date('2026-02-15T08:00:00Z').getTime() }),
    makeEvent({ eventId: 'e3', receivedAt: new Date('2026-03-20T20:00:00Z').getTime() }),
  ];

  it('returns all events when no range is provided', () => {
    expect(filterEventsByDateRange(events, null, null)).toHaveLength(3);
  });

  it('filters events after start date', () => {
    const start = new Date('2026-02-01T00:00:00Z');
    const result = filterEventsByDateRange(events, start, null);
    expect(result).toHaveLength(2);
    expect(result[0].eventId).toBe('e2');
  });

  it('filters events before end date', () => {
    const end = new Date('2026-02-28T23:59:59Z');
    const result = filterEventsByDateRange(events, null, end);
    expect(result).toHaveLength(2);
    expect(result[1].eventId).toBe('e2');
  });

  it('filters events within start and end dates', () => {
    const start = new Date('2026-02-01T00:00:00Z');
    const end = new Date('2026-02-28T23:59:59Z');
    const result = filterEventsByDateRange(events, start, end);
    expect(result).toHaveLength(1);
    expect(result[0].eventId).toBe('e2');
  });
});

describe('aggregateHeatmapData', () => {
  it('returns a 7×24 grid with all zeros for an empty array', () => {
    const result = aggregateHeatmapData([]);
    expect(result.cells).toHaveLength(7);
    result.cells.forEach((row) => {
      expect(row).toHaveLength(24);
      row.forEach((cell) => expect(cell.count).toBe(0));
    });
    expect(result.maxCount).toBe(0);
    expect(result.totalCount).toBe(0);
    expect(result.dateRange).toBeNull();
  });

  it('buckets events into the correct day/hour cells', () => {
    // Wed, Jan 7 2026 14:30:00 UTC → getDay()=3 (Wed), getHours() depends on locale,
    // so we use a fixed approach.
    const date = new Date('2026-01-07T14:30:00');
    const day = date.getDay();
    const hour = date.getHours();

    const events = [
      makeEvent({ eventId: 'e1', receivedAt: date.getTime() }),
      makeEvent({ eventId: 'e2', receivedAt: date.getTime() + 60_000 }),
    ];

    const result = aggregateHeatmapData(events);
    expect(result.cells[day][hour].count).toBe(2);
    expect(result.maxCount).toBe(2);
    expect(result.totalCount).toBe(2);
  });

  it('normalises intensities correctly', () => {
    const baseDate = new Date('2026-03-02T10:00:00'); // Monday
    const events = [
      makeEvent({ eventId: 'e1', receivedAt: baseDate.getTime() }),
      makeEvent({ eventId: 'e2', receivedAt: baseDate.getTime() + 1000 }),
      makeEvent({ eventId: 'e3', receivedAt: baseDate.getTime() + 2000 }),
      makeEvent({ eventId: 'e4', receivedAt: baseDate.getTime() + 3000 }),
    ];

    const result = aggregateHeatmapData(events);
    const day = baseDate.getDay();
    const hour = baseDate.getHours();

    // All 4 events in the same cell → intensity = 1.0
    expect(result.cells[day][hour].intensity).toBe(1);
    // An empty cell → intensity = 0
    expect(result.cells[(day + 1) % 7][hour].intensity).toBe(0);
  });

  it('respects date range filter', () => {
    const events = [
      makeEvent({ eventId: 'e1', receivedAt: new Date('2026-01-05T08:00:00').getTime() }),
      makeEvent({ eventId: 'e2', receivedAt: new Date('2026-06-15T14:00:00').getTime() }),
    ];

    const start = new Date('2026-06-01T00:00:00');
    const end = new Date('2026-06-30T23:59:59');
    const result = aggregateHeatmapData(events, start, end);

    expect(result.totalCount).toBe(1);
  });
});

describe('intensityLevel', () => {
  it('returns 0 for zero intensity', () => {
    expect(intensityLevel(0)).toBe(0);
  });

  it('returns 1 for low intensity', () => {
    expect(intensityLevel(0.1)).toBe(1);
    expect(intensityLevel(0.24)).toBe(1);
  });

  it('returns 2 for medium-low intensity', () => {
    expect(intensityLevel(0.25)).toBe(2);
    expect(intensityLevel(0.49)).toBe(2);
  });

  it('returns 3 for medium-high intensity', () => {
    expect(intensityLevel(0.5)).toBe(3);
    expect(intensityLevel(0.74)).toBe(3);
  });

  it('returns 4 for high intensity', () => {
    expect(intensityLevel(0.75)).toBe(4);
    expect(intensityLevel(1.0)).toBe(4);
  });
});
