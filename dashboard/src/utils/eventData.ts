import type { BlockchainEvent, NotificationSortOption } from '../types/event';

export function generateMockEvents(count: number): BlockchainEvent[] {
  const eventNames = [
    'TaskCreated',
    'WorkSubmitted',
    'SubmissionApproved',
    'SubmissionRejected',
    'TaskCancelled',
    'DisputeRaised',
    'AutoshareCreated',
    'Withdrawal',
  ];
  const contracts = [
    'CCEMX6Q5V5F5F5F5F5F5F5F5F5F5F5F5F5F5F5F5F5F5F5F5F5F5F5',
    'CBDFMX6Q5V5F5F5F5F5F5F5F5F5F5F5F5F5F5F5F5F5F5F5F5F5F5F5',
  ];

  return Array.from({ length: count }, (_, index) => {
    const eventName = eventNames[index % eventNames.length];
    return {
      eventId: `event-${index}`,
      contractAddress: contracts[index % contracts.length],
      eventName,
      ledger: 100000 + index,
      type: 'contract',
      topic: [eventName],
      value: String(index % 1000),
      txHash: `tx-${index.toString(16).padStart(8, '0')}`,
      receivedAt: Date.now() - index * 1000,
    };
  });
}

/**
 * Sort comparator for blockchain events (#495).
 *
 * - newest          – most recently received first (default, matches previous behaviour)
 * - oldest          – earliest received first
 * - priority        – lower ledger number first (on-chain ordering proxy), then newest within ledger
 * - delivery_status – active → expired → revoked → undefined, then newest within each bucket
 */
export function sortEvents(
  events: BlockchainEvent[],
  sortBy: NotificationSortOption = 'newest',
): BlockchainEvent[] {
  const STATUS_ORDER: Record<string, number> = {
    active: 0,
    expired: 1,
    revoked: 2,
  };

  const copy = [...events];

  switch (sortBy) {
    case 'oldest':
      return copy.sort((a, b) => a.receivedAt - b.receivedAt);

    case 'priority':
      // Lower ledger number = earlier on-chain = higher priority; break ties newest-first
      return copy.sort((a, b) => {
        const ledgerDiff = a.ledger - b.ledger;
        if (ledgerDiff !== 0) return ledgerDiff;
        return b.receivedAt - a.receivedAt;
      });

    case 'delivery_status':
      return copy.sort((a, b) => {
        const sa = STATUS_ORDER[a.notificationStatus ?? ''] ?? 3;
        const sb = STATUS_ORDER[b.notificationStatus ?? ''] ?? 3;
        if (sa !== sb) return sa - sb;
        return b.receivedAt - a.receivedAt;
      });

    case 'newest':
    default:
      return copy.sort((a, b) => b.receivedAt - a.receivedAt);
  }
}

export function filterEvents(
  events: BlockchainEvent[],
  search: string,
  contractAddress: string,
  eventType: string,
  status: import('../types/event').NotificationReadFilter = 'all',
  dateFrom = '',
  dateTo = '',
  txHash = '',
  sortBy: NotificationSortOption = 'newest',
): BlockchainEvent[] {
  const normalizedSearch = search.trim().toLowerCase();
  const normalizedTxHash = txHash.trim().toLowerCase();
  const fromMs = dateFrom ? new Date(dateFrom).getTime() : 0;
  // dateTo is inclusive: include the entire day
  const toMs = dateTo ? new Date(dateTo).getTime() + 86_399_999 : Infinity;

  const filtered = events.filter((event) => {
    if (contractAddress !== 'all' && event.contractAddress !== contractAddress) return false;
    if (eventType !== 'all' && event.eventName !== eventType) return false;

    if (status === 'read' && !event.read) return false;
    if (status === 'unread' && event.read) return false;

    if (event.receivedAt < fromMs || event.receivedAt > toMs) return false;

    if (normalizedTxHash && !event.txHash?.toLowerCase().includes(normalizedTxHash)) return false;

    if (!normalizedSearch) return true;

    return (
      event.eventId.toLowerCase().includes(normalizedSearch) ||
      event.eventName?.toLowerCase().includes(normalizedSearch) ||
      event.contractAddress.toLowerCase().includes(normalizedSearch) ||
      event.txHash?.toLowerCase().includes(normalizedSearch)
    );
  });

  return sortEvents(filtered, sortBy);
}
