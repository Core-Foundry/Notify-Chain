export interface ChainEventRef {
  contractAddress: string;
  eventId: string;
  ledger: number;
  txHash?: string;
}

export interface IndexedEventRef {
  contractAddress: string;
  eventId: string;
  ledger: number;
  txHash?: string;
}

export interface IndexingGap {
  contractAddress: string;
  eventId: string;
  ledger: number;
  txHash?: string;
}

export interface GapDetectionResult {
  missingEvents: IndexingGap[];
  missingLedgers: number[];
  checkedOnChain: number;
  checkedIndexed: number;
}

function fingerprint(contractAddress: string, eventId: string): string {
  return `${contractAddress}:${eventId}`;
}

/**
 * Detect gaps between on-chain events and indexed store records.
 *
 * - missingEvents: chain events that are not present in the indexed set
 * - missingLedgers: ledgers where the chain emitted >=1 event, but the index has none
 */
export function detectIndexingGaps(
  onChain: ChainEventRef[],
  indexed: IndexedEventRef[]
): GapDetectionResult {
  const indexedSet = new Set(indexed.map((e) => fingerprint(e.contractAddress, e.eventId)));
  const indexedByLedger = new Map<number, number>();
  indexed.forEach((e) => indexedByLedger.set(e.ledger, (indexedByLedger.get(e.ledger) ?? 0) + 1));

  const chainByLedger = new Map<number, ChainEventRef[]>();
  onChain.forEach((e) => {
    const ledgerEvents = chainByLedger.get(e.ledger) ?? [];
    ledgerEvents.push(e);
    chainByLedger.set(e.ledger, ledgerEvents);
  });

  const missingEvents: IndexingGap[] = [];
  for (const ev of onChain) {
    if (!indexedSet.has(fingerprint(ev.contractAddress, ev.eventId))) {
      missingEvents.push({
        contractAddress: ev.contractAddress,
        eventId: ev.eventId,
        ledger: ev.ledger,
        txHash: ev.txHash,
      });
    }
  }

  const missingLedgers: number[] = [];
  for (const [ledger, events] of chainByLedger.entries()) {
    if (events.length > 0 && (indexedByLedger.get(ledger) ?? 0) === 0) {
      missingLedgers.push(ledger);
    }
  }
  missingLedgers.sort((a, b) => a - b);

  return {
    missingEvents: missingEvents.sort((a, b) => a.ledger - b.ledger),
    missingLedgers,
    checkedOnChain: onChain.length,
    checkedIndexed: indexed.length,
  };
}

