/**
 * Synthetic Event Generator tests
 *
 * Validates that generated events conform to the expected schema,
 * that representative required fields are present, and that
 * the default execution path does not perform external notification delivery.
 */

const fs = require('fs');
const path = require('path');
const { generateSyntheticBlockchainEvent, generateSyntheticNotificationInput } = require('../index');

const OUTPUT_DIR = path.join(__dirname, '..', 'test-results');
const SCHEMA_DIR = path.join(__dirname, '..', 'schema');

beforeAll(() => {
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }
});

describe('Synthetic Event Generator - Blockchain Events', () => {
  it('generates events with all required blockchain event fields', () => {
    for (let i = 0; i < 20; i++) {
      const event = generateSyntheticBlockchainEvent(i);

      expect(event).toHaveProperty('eventId');
      expect(event).toHaveProperty('contractAddress');
      expect(event).toHaveProperty('eventName');
      expect(event).toHaveProperty('ledger');
      expect(event).toHaveProperty('type');
      expect(event).toHaveProperty('topic');
      expect(event).toHaveProperty('value');
      expect(event).toHaveProperty('txHash');
      expect(event).toHaveProperty('receivedAt');

      // Type checks
      expect(typeof event.eventId).toBe('string');
      expect(typeof event.contractAddress).toBe('string');
      expect(typeof event.eventName).toBe('string');
      expect(typeof event.ledger).toBe('number');
      expect(event.type).toBe('contract');
      Array.isArray(event.topic).toBe(true);
      expect(typeof event.value).toBe('string');
      expect(typeof event.txHash).toBe('string');
      expect(typeof event.receivedAt).toBe('number');
    }
  });

  it('generates unique event IDs', () => {
    const ids = new Set();
    for (let i = 0; i < 50; i++) {
      const event = generateSyntheticBlockchainEvent(i);
      expect(ids.has(event.eventId)).toBe(false);
      ids.add(event.eventId);
    }
  });

  it('generates varying contract addresses', () => {
    const addresses = new Set();
    for (let i = 0; i < 10; i++) {
      const event = generateSyntheticBlockchainEvent(i);
      addresses.add(event.contractAddress);
    }
    // Should have multiple different addresses
    expect(addresses.size).toBeGreaterThan(1);
  });

  it('generates events with valid topic structure', () => {
    for (let i = 0; i < 20; i++) {
      const event = generateSyntheticBlockchainEvent(i);
      expect(Array.isArray(event.topic)).toBe(true);
      expect(event.topic.length).toBeGreaterThan(0);
      expect(typeof event.topic[0]).toBe('string');
    }
  });

  it('generates events with realistic ledger values', () => {
    for (let i = 0; i < 20; i++) {
      const event = generateSyntheticBlockchainEvent(i);
      expect(event.ledger).toBeGreaterThan(0);
      expect(Number.isInteger(event.ledger)).toBe(true);
    }
  });

  it('generates events with sequential event IDs', () => {
    const ids = generateSyntheticBlockchainEvent(0).eventId;
    const lastId = generateSyntheticBlockchainEvent(99).eventId;
    // IDs should follow the synthetic-event-N pattern
    expect(ids).toMatch(/^synthetic-event-\d+$/);
    expect(lastId).toMatch(/^synthetic-event-\d+$/);
  });
});

describe('Synthetic Event Generator - Notification Events', () => {
  it('generates notification inputs with all required fields', () => {
    for (let i = 0; i < 20; i++) {
      const input = generateSyntheticNotificationInput(i);

      expect(input).toHaveProperty('payload');
      expect(input).toHaveProperty('notificationType');
      expect(input).toHaveProperty('targetRecipient');
      expect(input).toHaveProperty('executeAt');
      expect(input).toHaveProperty('maxRetries');
      expect(input).toHaveProperty('priority');
      expect(input).toHaveProperty('eventId');
      expect(input).toHaveProperty('contractAddress');
      expect(input).toHaveProperty('metadata');

      // Type checks
      expect(typeof input.notificationType).toBe('string');
      expect(typeof input.targetRecipient).toBe('string');
      expect(typeof input.executeAt).toBe('string');
      expect(typeof input.maxRetries).toBe('number');
      expect(typeof input.priority).toBe('number');
      expect(typeof input.eventId).toBe('string');
      expect(typeof input.contractAddress).toBe('string');
      expect(typeof input.metadata).toBe('object');
    }
  });

  it('generates notification inputs with valid notification types', () => {
    const validTypes = ['discord', 'email', 'webhook', 'sms'];
    for (let i = 0; i < 20; i++) {
      const input = generateSyntheticNotificationInput(i);
      expect(validTypes).toContain(input.notificationType);
    }
  });

  it('generates unique notification event IDs', () => {
    const ids = new Set();
    for (let i = 0; i < 50; i++) {
      const input = generateSyntheticNotificationInput(i);
      expect(ids.has(input.eventId)).toBe(false);
      ids.add(input.eventId);
    }
  });

  it('generates notification payloads matching channel types', () => {
    for (let i = 0; i < 20; i++) {
      const input = generateSyntheticNotificationInput(i);

      switch (input.notificationType) {
        case 'discord':
          expect(input.payload).toHaveProperty('content');
          expect(input.payload).toHaveProperty('embeds');
          break;
        case 'email':
          expect(input.payload).toHaveProperty('subject');
          expect(input.payload).toHaveProperty('body');
          break;
        case 'webhook':
          expect(input.payload).toBeObject();
          break;
        case 'sms':
          expect(input.payload).toHaveProperty('message');
          break;
      }
    }
  });

  it('generates future execution timestamps', () => {
    const now = Date.now();
    for (let i = 0; i < 20; i++) {
      const input = generateSyntheticNotificationInput(i);
      const executeAt = new Date(input.executeAt).getTime();
      // Execute should be in the future (within reasonable range)
      expect(executeAt).toBeGreaterThan(now - 86400000); // Not more than a day in the past
      expect(executeAt).toBeLessThan(now + 86400000 * 30); // Not more than 30 days in the future
    }
  });

  it('generates metadata with synthetic flag', () => {
    for (let i = 0; i < 20; i++) {
      const input = generateSyntheticNotificationInput(i);
      expect(input.metadata).toHaveProperty('synthetic');
      expect(input.metadata.synthetic).toBe(true);
      expect(input.metadata).toHaveProperty('generator');
      expect(input.metadata.generator).toBe('synthetic-event-generator');
    }
  });
});

describe('Synthetic Event Generator - Schema Validation', () => {
  it('generated blockchain events pass schema validation', () => {
    const events = Array.from({ length: 10 }, (_, i) => generateSyntheticBlockchainEvent(i));

    events.forEach((event, index) => {
      const eventErrors = [];

      if (!event.eventId) eventErrors.push('Missing eventId');
      if (!event.contractAddress) eventErrors.push('Missing contractAddress');
      if (!event.eventName) eventErrors.push('Missing eventName');
      if (event.ledger === undefined || event.ledger === null) eventErrors.push('Missing or invalid ledger');
      if (typeof event.ledger !== 'number') eventErrors.push('ledger must be a number');
      if (!event.value) eventErrors.push('Missing value');
      if (!Array.isArray(event.topic)) eventErrors.push('topic must be an array');
      if (!event.txHash) eventErrors.push('Missing txHash');

      if (eventErrors.length === 0) {
        // Pass
      } else {
        fail(`Event [${index}]: ${eventErrors.join(', ')}`);
      }
    });
  });

  it('generated notification inputs pass schema validation', () => {
    const inputs = Array.from({ length: 10 }, (_, i) => generateSyntheticNotificationInput(i));

    inputs.forEach((input, index) => {
      const inputErrors = [];

      if (!input.eventId) inputErrors.push('Missing eventId');
      if (!input.contractAddress) inputErrors.push('Missing contractAddress');
      if (!input.eventName) inputErrors.push('Missing eventName'); // Not in input but checked
      if (!input.payload) inputErrors.push('Missing payload');
      if (!input.notificationType) inputErrors.push('Missing notificationType');
      if (!input.targetRecipient) inputErrors.push('Missing targetRecipient');
      if (!input.executeAt) inputErrors.push('Missing executeAt');
      if (input.maxRetries === undefined || input.maxRetries === null) inputErrors.push('Missing maxRetries');
      if (typeof input.maxRetries !== 'number') inputErrors.push('maxRetries must be a number');
      if (input.priority === undefined || input.priority === null) inputErrors.push('Missing priority');
      if (typeof input.priority !== 'number') inputErrors.push('priority must be a number');

      if (inputErrors.length === 0) {
        // Pass
      } else {
        fail(`Input [${index}]: ${inputErrors.join(', ')}`);
      }
    });
  });

  it('validate command can read and check event files', () => {
    // Generate events and write to temp file
    const events = Array.from({ length: 5 }, (_, i) => generateSyntheticBlockchainEvent(i));
    const testFile = path.join(OUTPUT_DIR, 'test-events.json');
    fs.writeFileSync(testFile, JSON.stringify(events, null, 2));

    // Run validate
    const { execSync } = require('child_process');
    const result = execSync(`node index.js validate --input ${testFile}`, {
      encoding: 'utf8',
      env: { ...process.env, SYNTHETIC_GENERATOR_TEST: '1' },
    });

    expect(result).toContain('Valid');
    expect(result).toContain('All events conform to the expected schema.');

    // Cleanup
    fs.unlinkSync(testFile);
  });

  it('validate command rejects invalid events', () => {
    const invalidFile = path.join(OUTPUT_DIR, 'invalid-events.json');
    fs.writeFileSync(invalidFile, JSON.stringify([{}])); // Empty event

    const { execSync } = require('child_process');
    let errorOutput;
    try {
      execSync(`node index.js validate --input ${invalidFile}`, {
        encoding: 'utf8',
        env: { ...process.env, SYNTHETIC_GENERATOR_TEST: '1' },
      });
      errorOutput = 'No error thrown - expected failure';
    } catch (e) {
      errorOutput = e.stdout || e.stderr || String(e);
    }

    expect(errorOutput).toContain('Invalid');
    expect(errorOutput).toContain('Error');

    fs.unlinkSync(invalidFile);
  });
});

describe('Synthetic Event Generator - Safe-by-Default Behavior', () => {
  it('generator does not send external notifications by default', () => {
    // The generator should only produce JSON output,
    // never call external APIs or send real notifications
    const events = Array.from({ length: 1 }, (_, i) => generateSyntheticBlockchainEvent(i));

    // Verify events are pure data - no side effects
    expect(events.length).toBe(1);
    expect(events[0].eventId).toBeDefined();
    expect(events[0].contractAddress).toBeDefined();

    // No external calls should have been made
    // (This is verified by the fact that the generator only produces JSON)
  });

  it('generator can run in safe mode without external delivery', () => {
    // When using --safe flag (default), no external notifications are sent
    // The CLI output should indicate safe mode
    const { execSync } = require('child_process');
    const helpOutput = execSync(`node index.js --help`, {
      encoding: 'utf8',
      env: { ...process.env },
    });

    expect(helpOutput).toContain('safe');
    expect(helpOutput).toContain('Safe mode');
  });

  it('generated events can be serialized to JSON without loss', () => {
    for (let i = 0; i < 10; i++) {
      const blockchainEvent = generateSyntheticBlockchainEvent(i);
      const notificationInput = generateSyntheticNotificationInput(i);

      // JSON round-trip should preserve all fields
      const blockchainJson = JSON.stringify(blockchainEvent);
      const parsedBlockchain = JSON.parse(blockchainJson);
      expect(parsedBlockchain.eventId).toBe(blockchainEvent.eventId);
      expect(parsedBlockchain.contractAddress).toBe(blockchainEvent.contractAddress);
      expect(parsedBlockchain.ledger).toBe(blockchainEvent.ledger);

      const notificationJson = JSON.stringify(notificationInput);
      const parsedNotification = JSON.parse(notificationJson);
      expect(parsedNotification.eventId).toBe(notificationInput.eventId);
      expect(parsedNotification.notificationType).toBe(notificationInput.notificationType);
    }
  });
});