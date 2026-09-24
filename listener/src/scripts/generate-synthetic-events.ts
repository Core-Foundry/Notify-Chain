#!/usr/bin/env ts-node
/**
 * Synthetic Event Generator for Local Development (Issue #699)
 *
 * Generates schema-compliant synthetic Soroban events for local pipeline testing,
 * local UI development, and benchmarking without dispatching external notifications.
 */

import { randomUUID } from 'crypto';

export interface SyntheticEvent {
  id: string;
  contractAddress: string;
  eventName: string;
  ledger: number;
  txHash: string;
  type: 'contract' | 'system';
  topics: string[];
  data: Record<string, unknown>;
  timestamp: string;
}

export interface GeneratorOptions {
  count?: number;
  contractAddress?: string;
  eventType?: 'transfer' | 'task_created' | 'bounty_awarded' | 'random';
  dryRun?: boolean;
}

const DEFAULT_CONTRACT = 'CA7QYNF7SOWQ3GLR2BGMZEHXAVIRZA4KVWLTJJFC7MGXUA64P7TV5A4W';

export function createSyntheticEvent(
  type: 'transfer' | 'task_created' | 'bounty_awarded',
  contractAddress = DEFAULT_CONTRACT,
  ledgerBase = 100000
): SyntheticEvent {
  const id = `syn-${randomUUID()}`;
  const txHash = randomUUID().replace(/-/g, '') + randomUUID().replace(/-/g, '');
  const timestamp = new Date().toISOString();
  const ledger = ledgerBase + Math.floor(Math.random() * 1000);

  switch (type) {
    case 'transfer':
      return {
        id,
        contractAddress,
        eventName: 'transfer',
        ledger,
        txHash,
        type: 'contract',
        topics: ['transfer', 'tokens'],
        data: {
          from: 'GBRPYHIL2CI3WHGSUJGY6O7SROQOMJG7QBCACN4QPKUOQNXJDGONXHPA',
          to: 'GDQPBW6B7G56J27V2W3K57XJ4L2J4P6Y3W56J27V2W3K57XJ4L2J4P6Y',
          amount: '500.0000000',
          asset: 'XLM',
        },
        timestamp,
      };

    case 'task_created':
      return {
        id,
        contractAddress,
        eventName: 'task_created',
        ledger,
        txHash,
        type: 'contract',
        topics: ['task', 'created'],
        data: {
          taskId: Math.floor(Math.random() * 10000),
          reward: '250.0000000',
          deadline: Math.floor(Date.now() / 1000) + 86400 * 7,
          creator: 'GBRPYHIL2CI3WHGSUJGY6O7SROQOMJG7QBCACN4QPKUOQNXJDGONXHPA',
        },
        timestamp,
      };

    case 'bounty_awarded':
      return {
        id,
        contractAddress,
        eventName: 'bounty_awarded',
        ledger,
        txHash,
        type: 'contract',
        topics: ['bounty', 'awarded'],
        data: {
          bountyId: `bounty-${Math.floor(Math.random() * 500)}`,
          recipient: 'GDQPBW6B7G56J27V2W3K57XJ4L2J4P6Y3W56J27V2W3K57XJ4L2J4P6Y',
          points: 200,
        },
        timestamp,
      };
  }
}

export function generateBatch(options: GeneratorOptions = {}): SyntheticEvent[] {
  const count = options.count ?? 5;
  const contract = options.contractAddress ?? DEFAULT_CONTRACT;
  const eventTypes: Array<'transfer' | 'task_created' | 'bounty_awarded'> = [
    'transfer',
    'task_created',
    'bounty_awarded',
  ];

  const events: SyntheticEvent[] = [];
  for (let i = 0; i < count; i++) {
    const selectedType =
      options.eventType && options.eventType !== 'random'
        ? options.eventType
        : eventTypes[i % eventTypes.length];

    events.push(createSyntheticEvent(selectedType, contract, 100000 + i * 10));
  }

  return events;
}

function main() {
  const args = process.argv.slice(2);
  const countArg = args.find((a) => a.startsWith('--count='));
  const count = countArg ? parseInt(countArg.split('=')[1], 10) : 3;

  console.log(`\n🎲 Generating ${count} schema-compliant synthetic events for local development...\n`);
  const events = generateBatch({ count });

  console.log(JSON.stringify(events, null, 2));
  console.log(`\n✅ Generated ${events.length} events successfully. (External dispatch disabled)`);
}

if (require.main === module) {
  main();
}
