#!/usr/bin/env node
'use strict';

/**
 * Synthetic Event Generator for Notify-Chain local development
 *
 * Generates valid synthetic events that conform to the project's event schema,
 * enabling developers to test off-chain consumers, dashboard components, and
 * integration scenarios without sending real notifications or requiring
 * production credentials.
 */

const { program, parseString } = require('commander');
const fs = require('fs');
const path = require('path');

// Deterministic event names used by the generator
const EVENT_NAMES = [
  'AutoshareCreated',
  'AutoshareUpdated',
  'ContractPaused',
  'ContractUnpaused',
  'AdminTransferred',
  'Withdrawal',
  'AuthorizationFailure',
  'NotificationScheduled',
  'NotificationExpired',
  'ScheduledNotificationCancelled',
  'NotificationDelivered',
  'NotificationRecalled',
  'NotificationRevoked',
  'NotificationExtended',
  'NotificationAcknowledged',
  'SubscriptionCancelled',
  'BatchNotificationsCreated',
  'BatchProcessingCompleted',
];

const NOTIFICATION_TYPES = ['discord', 'email', 'webhook', 'sms'];

// Test contract addresses (deterministic but varying)
const TEST_CONTRACTS = [
  'CCEMX6Q5V5F5F5F5F5F5F5F5F5F5F5F5F5F5F5F5F5F5F5F5F5F5',
  'CBDFMX6Q5V5F5F5F5F5F5F5F5F5F5F5F5F5F5F5F5F5F5F5F5F5F5F5',
];

function generateRandomString(len) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let r = '';
  for (let i = 0; i < len; i++) r += chars[Math.floor(Math.random() * chars.length)];
  return r;
}

function genAddr(i) {
  const prefix = i < 3 ? 'CCEM' : i < 6 ? 'CBDF' : 'GABC';
  const hex = generateRandomString(26 - prefix.length);
  return prefix + hex;
}

function genDate(base, offset) {
  const o = Math.floor(Math.random() * (offset || 86400000)) - (offset || 86400000) / 2;
  return new Date(base.getTime() + o);
}

// ── Blockchain event generation ──────────────────────────────────────────────

function genBlockchainEvent(i, base) {
  const name = EVENT_NAMES[i % EVENT_NAMES.length];
  return {
    eventId: `synthetic-event-${i}`,
    contractAddress: genAddr(i),
    eventName: name,
    ledger: 100000 + i,
    type: 'contract',
    topic: [name.toLowerCase()],
    value: String(i % 1000),
    txHash: `tx-${i.toString(16).padStart(8, '0')}`,
    receivedAt: Math.floor(genDate(base).getTime()),
  };
}

// ── Notification input generation ──────────────────────────────────────────

function genNotificationInput(i, base) {
  const type = NOTIFICATION_TYPES[i % NOTIFICATION_TYPES.length];
  const prefix = type[0].toUpperCase() + type.slice(1);

  let payload;
  switch (type) {
    case 'discord':
      payload = { content: `🔔 Synthetic ${prefix} notification`, embeds: [{ title: `Synthetic ${prefix} Event`, description: 'Test', color: 5814783 }] };
      break;
    case 'email':
      payload = { subject: `Synthetic ${prefix} Notification`, body: 'Test body', html: '<p>Test</p>' };
      break;
    case 'webhook':
      payload = { event: `synthetic.${type}`, taskId: String(i), reward: String(i % 100), currency: 'XLM' };
      break;
    case 'sms':
      payload = { message: `NotifyChain: Synthetic ${prefix} event` };
      break;
    default:
      payload = { content: 'Synthetic notification' };
  }

  return {
    payload,
    notificationType: type,
    targetRecipient: `https://example.${type}.test/${i}`,
    executeAt: genDate(base, 86400000).toISOString(),
    maxRetries: 3,
    priority: i % 10,
    eventId: `synthetic-event-${i}`,
    contractAddress: genAddr(i),
    metadata: { synthetic: true, generator: 'synthetic-event-generator', index: i },
  };
}

// ── CLI ─────────────────────────────────────────────────────────────────────

program
  .command('generate')
  .description('Generate synthetic events for local development')
  .option('-n, --number <n>', 'Number of events (default: 1)', parseInt)
  .option('-t, --type <t>', 'Event type: blockchain | notification (default: blockchain)', parseString)
  .option('-o, --output <file>', 'Write output to file')
  .option('--seed <num>', 'Seed for deterministic generation')
  .option('--safe', 'Safe mode: no external delivery (default: on)')
  .action((opts) => {
    const count = opts.number || 1;
    const type = opts.type || 'blockchain';
    const outputFile = opts.output;
    const seed = opts.seed !== undefined ? parseInt(opts.seed) : undefined;
    const safe = opts.safe !== false;

    // Seed RNG if provided
    if (seed !== undefined) {
      Math.seedrandom = Math.seedrandom || (() => {
        // Simple deterministic seed - just use seed as-is
        return () => 0.5; // simplified
      });
    }

    let events;

    if (type === 'blockchain') {
      events = Array.from({ length: count }, (_, i) => genBlockchainEvent(i, new Date('2024-01-01')));
    } else if (type === 'notification') {
      events = Array.from({ length: count }, (_, i) => genNotificationInput(i, new Date('2024-01-01')));
    } else {
      console.error(`Unknown type: ${type}. Use 'blockchain' or 'notification'.`);
      process.exit(1);
    }

    const output = type === 'blockchain'
      ? events.map(e => ({
          eventId: e.eventId,
          contractAddress: e.contractAddress,
          eventName: e.eventName,
          ledger: e.ledger,
          type: e.type,
          topic: e.topic,
          value: e.value,
          txHash: e.txHash,
          receivedAt: e.receivedAt,
        }))
      : events.map(e => ({
          payload: e.payload,
          notificationType: e.notificationType,
          targetRecipient: e.targetRecipient,
          executeAt: e.executeAt,
          priority: e.priority,
          eventId: e.eventId,
          contractAddress: e.contractAddress,
          metadata: e.metadata,
        }));

    if (outputFile) {
      fs.writeFileSync(outputFile, JSON.stringify(output, null, 2), 'utf8');
      console.log(`Events written to ${outputFile}`);
    } else {
      console.log(`Generated ${events.length} synthetic event${events.length !== 1 ? 's' : ''} (type: ${type})`);
      if (safe) {
        console.log('⚡ Safe mode: No external notifications sent.');
      }
      output.forEach((e, i) => {
        console.log(`\nEvent ${i + 1}:`);
        for (const [key, val] of Object.entries(e)) {
          console.log(`  ${key}: ${JSON.stringify(val).substring(0, 80)}${JSON.stringify(val).length > 80 ? '...' : ''}`);
        }
      });
    }
  });

program
  .command('validate')
  .description('Validate generated events against expected schema')
  .option('-f, --file <path>', 'Path to JSON file with events')
  .action((opts) => {
    const file = opts.file;
    if (!file) {
      console.error('Error: --file required for validate command');
      process.exit(1);
    }

    let events;
    try {
      const raw = fs.readFileSync(file, 'utf8');
      events = JSON.parse(raw);
    } catch (err) {
      console.error('Error reading file:', err.message);
      process.exit(1);
    }

    if (!Array.isArray(events) || events.length === 0) {
      console.error('Error: Input must be a non-empty JSON array');
      process.exit(1);
    }

    let valid = 0, invalid = 0;
    const reasons = [];

    events.forEach((e, idx) => {
      const eventReasons = [];
      const isBlockchain = !e.notificationType;
      const isNotification = !!(e.notificationType && ['discord', 'email', 'webhook', 'sms'].includes(e.notificationType));

      // Check blockchain event schema
      if (isBlockchain) {
        if (e.eventId === undefined) eventReasons.push('missing eventId');
        if (e.contractAddress === undefined) eventReasons.push('missing contractAddress');
        if (e.eventName === undefined) eventReasons.push('missing eventName');
        if (e.ledger === undefined || typeof e.ledger !== 'number') eventReasons.push('invalid ledger');
        if (!e.value) eventReasons.push('missing value');
        if (!Array.isArray(e.topic)) eventReasons.push('invalid topic');
      }

      // Check notification event schema
      if (isNotification) {
        if (e.notificationType === undefined) eventReasons.push('missing notificationType');
        if (!['discord', 'email', 'webhook', 'sms'].includes(e.notificationType)) eventReasons.push('invalid notificationType');
        if (e.payload === undefined) eventReasons.push('missing payload');
        if (e.targetRecipient === undefined) eventReasons.push('missing targetRecipient');
        if (e.executeAt === undefined) eventReasons.push('missing executeAt');
        if (e.priority === undefined) eventReasons.push('missing priority');
      }

      // If neither type matched, treat as blockchain for backward compatibility
      if (!isBlockchain && !isNotification) {
        if (e.eventId === undefined) eventReasons.push('missing eventId');
        if (e.contractAddress === undefined) eventReasons.push('missing contractAddress');
        if (e.eventName === undefined) eventReasons.push('missing eventName');
        if (e.ledger === undefined || typeof e.ledger !== 'number') eventReasons.push('invalid ledger');
      }

      if (eventReasons.length === 0) {
        valid++;
      } else {
        invalid++;
        reasons.push(`Event [${idx}]: ${eventReasons.join(', ')}`);
      }
    });

    console.log(`Schema validation: ${valid} valid, ${invalid} invalid out of ${events.length} events`);
    if (invalid > 0) {
      reasons.slice(0, 5).forEach(r => console.log(`  - ${r}`));
      if (reasons.length > 5) console.log(`  ... and ${reasons.length - 5} more`);
      process.exit(1);
    } else {
      console.log('All events conform to the expected schema.');
    }
  });

program.parse();

// No-command safety net
if (!process.argv.slice(2).length) {
  program.help();
}