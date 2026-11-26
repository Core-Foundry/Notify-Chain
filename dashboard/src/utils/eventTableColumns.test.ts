import type { BlockchainEvent } from '../types/event';
import {
  COLUMN_VISIBILITY_STORAGE_KEY,
  DEFAULT_VISIBLE_COLUMNS,
  findEmptyColumns,
  loadVisibleColumns,
  normalizeVisibleColumns,
  persistVisibleColumns,
  toggleColumn,
} from './eventTableColumns';

// Issue #1160: responsive data table column management.

const event = (overrides: Partial<BlockchainEvent> = {}): BlockchainEvent => ({
  eventId: 'evt-1',
  contractAddress: 'CABC',
  eventName: 'Transfer',
  type: 'contract',
  ledger: 10,
  topic: [],
  value: '{}',
  txHash: 'tx1',
  receivedAt: Date.UTC(2026, 0, 1),
  ...overrides,
});

describe('event table columns', () => {
  beforeEach(() => localStorage.clear());

  it('shows every column by default', () => {
    expect(loadVisibleColumns()).toEqual([...DEFAULT_VISIBLE_COLUMNS]);
  });

  it('hides and re-shows optional columns, keeping table order', () => {
    const hidden = toggleColumn(DEFAULT_VISIBLE_COLUMNS, 'kind');
    expect(hidden).not.toContain('kind');
    expect(toggleColumn(hidden, 'kind')).toEqual([...DEFAULT_VISIBLE_COLUMNS]);
  });

  it('never hides identifier columns', () => {
    for (const id of ['contract', 'event', 'ledger'] as const) {
      expect(toggleColumn(DEFAULT_VISIBLE_COLUMNS, id)).toContain(id);
    }
    expect(normalizeVisibleColumns([])).toEqual(['contract', 'event', 'ledger']);
  });

  it('persists the choice and ignores unknown or corrupt stored values', () => {
    persistVisibleColumns(['contract', 'event', 'ledger', 'transaction']);
    expect(loadVisibleColumns()).toEqual(['contract', 'event', 'ledger', 'transaction']);

    localStorage.setItem(COLUMN_VISIBILITY_STORAGE_KEY, JSON.stringify(['bogus', 'kind']));
    expect(loadVisibleColumns()).toEqual(['contract', 'event', 'kind', 'ledger']);

    localStorage.setItem(COLUMN_VISIBILITY_STORAGE_KEY, '{not json');
    expect(loadVisibleColumns()).toEqual([...DEFAULT_VISIBLE_COLUMNS]);
  });

  it('flags columns with no data on the current page', () => {
    const empty = findEmptyColumns([
      event({ txHash: undefined }),
      event({ eventId: 'evt-2', txHash: undefined, receivedAt: Number.NaN }),
    ]);
    expect(empty.has('transaction')).toBe(true);
    expect(empty.has('received')).toBe(false);
    expect(empty.has('ledger')).toBe(false);
  });

  it('reports nothing as empty when there are no events', () => {
    expect(findEmptyColumns([]).size).toBe(0);
  });
});
