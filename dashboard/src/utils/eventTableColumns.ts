import type { BlockchainEvent } from '../types/event';

/**
 * Column configuration for the event explorer table (issue #1160).
 *
 * Users can hide optional columns. Identifier columns (contract, event name
 * and the ledger cell that carries the copyable event ID) are locked visible
 * so an event can always be identified and shared, whatever the layout.
 */

export type EventColumnId = 'contract' | 'event' | 'kind' | 'received' | 'ledger' | 'transaction';

export interface EventColumnDefinition {
  id: EventColumnId;
  label: string;
  /** Locked columns are always shown and cannot be hidden. */
  locked: boolean;
}

export const EVENT_COLUMNS: readonly EventColumnDefinition[] = [
  { id: 'contract', label: 'Contract', locked: true },
  { id: 'event', label: 'Event', locked: true },
  { id: 'kind', label: 'Kind', locked: false },
  { id: 'received', label: 'Received', locked: false },
  { id: 'ledger', label: 'Ledger', locked: true },
  { id: 'transaction', label: 'Transaction', locked: false },
];

export const EVENT_COLUMN_IDS: readonly EventColumnId[] = EVENT_COLUMNS.map((c) => c.id);

/** Every column is visible by default; narrow screens scroll horizontally. */
export const DEFAULT_VISIBLE_COLUMNS: readonly EventColumnId[] = EVENT_COLUMN_IDS;

export const COLUMN_VISIBILITY_STORAGE_KEY = 'notify-chain-event-table-columns';

const LOCKED = new Set(EVENT_COLUMNS.filter((c) => c.locked).map((c) => c.id));

function isColumnId(value: unknown): value is EventColumnId {
  return typeof value === 'string' && (EVENT_COLUMN_IDS as readonly string[]).includes(value);
}

/** Keep table order, drop unknown ids and always include locked columns. */
export function normalizeVisibleColumns(ids: readonly unknown[]): EventColumnId[] {
  const wanted = new Set(ids.filter(isColumnId));
  return EVENT_COLUMN_IDS.filter((id) => LOCKED.has(id) || wanted.has(id));
}

export function loadVisibleColumns(): EventColumnId[] {
  try {
    const raw = localStorage.getItem(COLUMN_VISIBILITY_STORAGE_KEY);
    if (!raw) return [...DEFAULT_VISIBLE_COLUMNS];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [...DEFAULT_VISIBLE_COLUMNS];
    return normalizeVisibleColumns(parsed);
  } catch {
    return [...DEFAULT_VISIBLE_COLUMNS];
  }
}

export function persistVisibleColumns(ids: readonly EventColumnId[]): void {
  try {
    localStorage.setItem(COLUMN_VISIBILITY_STORAGE_KEY, JSON.stringify(ids));
  } catch {
    // Storage can be unavailable (private mode, quota); the choice then lasts
    // for the session only.
  }
}

/** Show or hide one column. Locked columns are never hidden. */
export function toggleColumn(
  visible: readonly EventColumnId[],
  id: EventColumnId,
): EventColumnId[] {
  if (LOCKED.has(id)) return normalizeVisibleColumns(visible);
  const next = visible.includes(id) ? visible.filter((c) => c !== id) : [...visible, id];
  return normalizeVisibleColumns(next);
}

export function isColumnLocked(id: EventColumnId): boolean {
  return LOCKED.has(id);
}

/** Whether a column has a value for the event. */
export function hasColumnValue(event: BlockchainEvent, id: EventColumnId): boolean {
  switch (id) {
    case 'contract':
      return Boolean(event.contractAddress);
    case 'event':
      return Boolean(event.eventName ?? event.type);
    case 'kind':
      return Boolean(event.type);
    case 'received':
      return (
        Number.isFinite(event.receivedAt) &&
        event.receivedAt > 0 &&
        !Number.isNaN(new Date(event.receivedAt).getTime())
      );
    case 'ledger':
      return Number.isFinite(event.ledger);
    case 'transaction':
      return Boolean(event.txHash);
  }
}

/** Columns with no value for any of the given events (e.g. no tx hashes on this page). */
export function findEmptyColumns(events: readonly BlockchainEvent[]): Set<EventColumnId> {
  const empty = new Set<EventColumnId>();
  if (events.length === 0) return empty;
  for (const id of EVENT_COLUMN_IDS) {
    if (!events.some((event) => hasColumnValue(event, id))) empty.add(id);
  }
  return empty;
}
