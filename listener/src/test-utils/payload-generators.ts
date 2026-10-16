/**
 * Test utility functions for generating invalid, edge case, and boundary value payloads
 * Task 6.1: Create helpers for invalid/edge case/boundary value payload generation
 */

import { xdr } from '@stellar/stellar-sdk';
import { NotificationPayload } from '../utils/batch-validator';
import { ExtendedEventResponse } from '../services/notification-expiration';

/**
 * Generate invalid event payloads for testing
 */
export class InvalidPayloadGenerator {
  /**
   * Generate payloads with missing required fields
   */
  static generateMissingFieldPayloads(): Partial<NotificationPayload>[] {
    return [
      { recipient: 'test', channel: 'discord', message: 'test' }, // missing id
      { id: 'evt_001', channel: 'discord', message: 'test' }, // missing recipient
      { id: 'evt_001', recipient: 'test', message: 'test' }, // missing channel
      { id: 'evt_001', recipient: 'test', channel: 'discord' }, // missing message
    ];
  }

  /**
   * Generate payloads with null/undefined critical fields
   */
  static generateNullUndefinedPayloads(): any[] {
    return [
      { id: null, recipient: 'test', channel: 'discord', message: 'test' },
      { id: undefined, recipient: 'test', channel: 'discord', message: 'test' },
      { id: 'evt_001', recipient: null, channel: 'discord', message: 'test' },
      { id: 'evt_001', recipient: undefined, channel: 'discord', message: 'test' },
      { id: 'evt_001', recipient: 'test', channel: null, message: 'test' },
      { id: 'evt_001', recipient: 'test', channel: undefined, message: 'test' },
      { id: 'evt_001', recipient: 'test', channel: 'discord', message: null },
      { id: 'evt_001', recipient: 'test', channel: 'discord', message: undefined },
    ];
  }

  /**
   * Generate payloads with wrong data types
   */
  static generateWrongTypePayloads(): any[] {
    return [
      { id: 123, recipient: 'test', channel: 'discord', message: 'test' },
      { id: 'evt_001', recipient: 123, channel: 'discord', message: 'test' },
      { id: 'evt_001', recipient: 'test', channel: 'discord', message: 123 },
      { id: { nested: 'object' }, recipient: 'test', channel: 'discord', message: 'test' },
      { id: 'evt_001', recipient: ['array'], channel: 'discord', message: 'test' },
    ];
  }

  /**
   * Generate payloads with invalid field formats
   */
  static generateInvalidFormatPayloads(): any[] {
    return [
      { id: '', recipient: 'test', channel: 'discord', message: 'test' },
      { id: '   ', recipient: 'test', channel: 'discord', message: 'test' },
      { id: 'evt_001', recipient: '', channel: 'discord', message: 'test' },
      { id: 'evt_001', recipient: '   ', channel: 'discord', message: 'test' },
      { id: 'evt_001', recipient: 'test', channel: 'invalid_channel', message: 'test' },
      { id: 'evt_001', recipient: 'test', channel: 'discord', message: '' },
      { id: 'evt_001', recipient: 'test', channel: 'discord', message: '   ' },
    ];
  }
}

/**
 * Generate edge case payloads for testing
 */
export class EdgeCasePayloadGenerator {
  /**
   * Generate payloads with boundary length values
   */
  static generateBoundaryLengthPayloads(): NotificationPayload[] {
    return [
      {
        id: '0', // minimum id
        recipient: 'r',
        channel: 'discord',
        message: 'm',
      },
      {
        id: 'a'.repeat(1), // single char
        recipient: 'b',
        channel: 'discord',
        message: 'msg',
      },
      {
        id: 'id_' + 'x'.repeat(100), // 100+ chars
        recipient: 'recipient_' + 'y'.repeat(100),
        channel: 'discord',
        message: 'msg_' + 'z'.repeat(1000), // 1000+ chars
      },
      {
        id: 'id_' + 'a'.repeat(10000), // 10000+ chars
        recipient: 'r',
        channel: 'discord',
        message: 'msg_' + 'b'.repeat(10000),
      },
    ];
  }

  /**
   * Generate payloads with special characters
   */
  static generateSpecialCharacterPayloads(): NotificationPayload[] {
    const specialChars = ['!', '@', '#', '$', '%', '^', '&', '*', '(', ')', '<', '>', '"', "'"];
    return specialChars.map((char) => ({
      id: `evt_${char}_001`,
      recipient: `recipient_${char}`,
      channel: 'discord' as const,
      message: `message_with_${char}_special_char`,
    }));
  }

  /**
   * Generate payloads with unicode/emoji
   */
  static generateUnicodePayloads(): NotificationPayload[] {
    return [
      {
        id: 'evt_漢字_001',
        recipient: '日本語_recipient',
        channel: 'discord',
        message: 'Japanese: こんにちは',
      },
      {
        id: 'evt_emoji_001',
        recipient: 'emoji_recipient',
        channel: 'discord',
        message: 'Emojis: 🎉 🚀 ✨ 🌟',
      },
      {
        id: 'evt_العربية_001',
        recipient: 'arabic_recipient',
        channel: 'discord',
        message: 'Arabic: مرحبا بالعالم',
      },
      {
        id: 'evt_русский_001',
        recipient: 'russian_recipient',
        channel: 'discord',
        message: 'Russian: Привет мир',
      },
    ];
  }

  /**
   * Generate payloads with numerical boundaries
   */
  static generateNumericalBoundaryPayloads(): any[] {
    return [
      {
        id: '0',
        recipient: 'test',
        channel: 'discord',
        message: 'test',
        numericField: 0,
      },
      {
        id: '-1',
        recipient: 'test',
        channel: 'discord',
        message: 'test',
        numericField: -1,
      },
      {
        id: String(Number.MAX_SAFE_INTEGER),
        recipient: 'test',
        channel: 'discord',
        message: 'test',
        numericField: Number.MAX_SAFE_INTEGER,
      },
      {
        id: String(Number.MIN_SAFE_INTEGER),
        recipient: 'test',
        channel: 'discord',
        message: 'test',
        numericField: Number.MIN_SAFE_INTEGER,
      },
    ];
  }

  /**
   * Generate payloads with concurrent/timing edge cases
   */
  static generateTimingEdgeCases(): ExtendedEventResponse[] {
    const now = Date.now();
    return [
      {
        id: 'evt_now',
        type: 'contract',
        ledger: 100,
        ledgerClosedAt: new Date().toISOString(),
        transactionIndex: 0,
        operationIndex: 0,
        inSuccessfulContractCall: true,
        txHash: 'hash',
        topic: [xdr.ScVal.scvSymbol('Test')],
        value: xdr.ScVal.scvU32(1),
        receivedAt: now, // Current moment
      },
      {
        id: 'evt_1ms_future',
        type: 'contract',
        ledger: 100,
        ledgerClosedAt: new Date().toISOString(),
        transactionIndex: 0,
        operationIndex: 0,
        inSuccessfulContractCall: true,
        txHash: 'hash',
        topic: [xdr.ScVal.scvSymbol('Test')],
        value: xdr.ScVal.scvU32(1),
        receivedAt: now + 1, // 1ms in future
      },
      {
        id: 'evt_1ms_past',
        type: 'contract',
        ledger: 100,
        ledgerClosedAt: new Date().toISOString(),
        transactionIndex: 0,
        operationIndex: 0,
        inSuccessfulContractCall: true,
        txHash: 'hash',
        topic: [xdr.ScVal.scvSymbol('Test')],
        value: xdr.ScVal.scvU32(1),
        receivedAt: now - 1, // 1ms in past
      },
    ];
  }
}

/**
 * Generate property-based test cases
 */
export class PropertyBasedGenerator {
  /**
   * Generate random invalid payloads for fuzzing
   */
  static generateRandomInvalidPayloads(count: number): any[] {
    const payloads: any[] = [];
    const channels = ['discord', 'webhook', 'email', 'sms', 'invalid_channel', null, undefined];
    const nullableFields = [null, undefined, '', '   '];

    for (let i = 0; i < count; i++) {
      const randomChoice = Math.random();

      if (randomChoice < 0.2) {
        // Missing field
        payloads.push({
          recipient: 'test',
          channel: 'discord',
          message: 'test',
        });
      } else if (randomChoice < 0.4) {
        // Null/undefined field
        const field = Math.floor(Math.random() * 4);
        const payload: any = {
          id: 'evt_001',
          recipient: 'test',
          channel: 'discord',
          message: 'test',
        };
        const fields = ['id', 'recipient', 'channel', 'message'];
        payload[fields[field]] = nullableFields[Math.floor(Math.random() * nullableFields.length)];
        payloads.push(payload);
      } else if (randomChoice < 0.6) {
        // Invalid channel
        payloads.push({
          id: 'evt_001',
          recipient: 'test',
          channel: channels[Math.floor(Math.random() * channels.length)],
          message: 'test',
        });
      } else if (randomChoice < 0.8) {
        // Wrong type
        const field = Math.floor(Math.random() * 4);
        const payload: any = {
          id: 'evt_001',
          recipient: 'test',
          channel: 'discord',
          message: 'test',
        };
        const fields = ['id', 'recipient', 'channel', 'message'];
        payload[fields[field]] = { nested: 'object' };
        payloads.push(payload);
      } else {
        // Random extreme values
        payloads.push({
          id: Math.random() > 0.5 ? 'x'.repeat(Math.random() * 1000) : '',
          recipient: Math.random() > 0.5 ? 'y'.repeat(Math.random() * 1000) : null,
          channel: Math.random() > 0.5 ? 'discord' : 123,
          message: Math.random() > 0.5 ? 'msg' : undefined,
        });
      }
    }

    return payloads;
  }

  /**
   * Generate semi-valid payloads (mostly valid with occasional issues)
   */
  static generateSemiValidPayloads(count: number): NotificationPayload[] {
    const payloads: NotificationPayload[] = [];
    const channels: Array<'discord' | 'webhook' | 'email' | 'sms'> = [
      'discord',
      'webhook',
      'email',
      'sms',
    ];

    for (let i = 0; i < count; i++) {
      payloads.push({
        id: `evt_${i}_${Math.random().toString(36).substring(7)}`,
        recipient: `recipient_${i % 10}`, // Only 10 unique recipients - will create duplicates
        channel: channels[i % channels.length],
        message: `Test message ${i}: ${Math.random().toString(36)}`,
      });
    }

    return payloads;
  }
}
