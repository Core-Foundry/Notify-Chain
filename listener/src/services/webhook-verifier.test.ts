import crypto from 'crypto';
import {
  verifySignature,
  extractSignature,
  extractKeyId,
  getSecretForKey,
  isTimestampValid,
} from './webhook-verifier';

function computeSignature(payload: string, secret: string): string {
  const sig = crypto.createHmac('sha256', secret).update(payload, 'utf8').digest('hex');
  return `sha256=${sig}`;
}

describe('verifySignature', () => {
  it('returns true for a valid signature', () => {
    const payload = '{"event":"test"}';
    const secret = 'whsec_test_secret';
    const header = computeSignature(payload, secret);

    expect(verifySignature(payload, header, secret)).toBe(true);
  });

  it('returns false for an invalid signature', () => {
    const payload = '{"event":"test"}';
    const secret = 'whsec_test_secret';
    const header = computeSignature(payload, secret);

    expect(verifySignature(payload, header, 'wrong_secret')).toBe(false);
  });

  it('returns false when the header does not have the sha256= prefix', () => {
    const payload = '{"event":"test"}';
    const result = verifySignature(payload, 'invalidsignature', 'secret');
    expect(result).toBe(false);
  });

  it('returns false on empty payload with a non-matching signature', () => {
    const payload = '';
    const secret = 'whsec_secret';
    const header = computeSignature(payload, secret);

    expect(verifySignature(payload, header, secret)).toBe(true);
    expect(verifySignature(payload, header, 'different_secret')).toBe(false);
  });

  it('uses constant-time comparison (different lengths handled)', () => {
    const payload = '{}';
    const secret = 'test';
    const header = 'sha256=abc';

    expect(verifySignature(payload, header, secret)).toBe(false);
  });
});

describe('extractSignature', () => {
  it('extracts from x-webhook-signature header', () => {
    const headers = { 'x-webhook-signature': 'sha256=abc123' };
    expect(extractSignature(headers)).toBe('sha256=abc123');
  });

  it('extracts from X-Webhook-Signature header', () => {
    const headers = { 'X-Webhook-Signature': 'sha256=abc123' };
    expect(extractSignature(headers)).toBe('sha256=abc123');
  });

  it('returns null when no signature header is present', () => {
    expect(extractSignature({})).toBeNull();
  });

  it('takes the first value when header is an array', () => {
    const headers = { 'x-webhook-signature': ['sha256=first', 'sha256=second'] };
    expect(extractSignature(headers)).toBe('sha256=first');
  });
});

describe('extractKeyId', () => {
  it('extracts from x-webhook-key-id header', () => {
    const headers = { 'x-webhook-key-id': 'key-1' };
    expect(extractKeyId(headers)).toBe('key-1');
  });

  it('extracts from X-Webhook-Key-Id header', () => {
    const headers = { 'X-Webhook-Key-Id': 'key-1' };
    expect(extractKeyId(headers)).toBe('key-1');
  });

  it('returns null when no key-id header is present', () => {
    expect(extractKeyId({})).toBeNull();
  });
});

describe('getSecretForKey', () => {
  const secrets = [
    { id: 'key-1', secret: 'secret_1' },
    { id: 'key-2', secret: 'secret_2' },
  ];

  it('returns the matching secret', () => {
    expect(getSecretForKey(secrets, 'key-1')).toBe('secret_1');
    expect(getSecretForKey(secrets, 'key-2')).toBe('secret_2');
  });

  it('returns undefined for an unknown key', () => {
    expect(getSecretForKey(secrets, 'unknown-key')).toBeUndefined();
  });

  it('returns undefined for an empty secrets array', () => {
    expect(getSecretForKey([], 'key-1')).toBeUndefined();
  });
});

describe('isTimestampValid', () => {
  it('accepts a recent timestamp within the expiration window', () => {
    const currentTimestamp = Math.floor(Date.now() / 1000);
    expect(isTimestampValid(currentTimestamp.toString(), 300)).toBe(true);
  });

  it('rejects a timestamp older than the expiration window', () => {
    const oldTimestamp = Math.floor(Date.now() / 1000) - 400; // 400 seconds ago, max is 300
    expect(isTimestampValid(oldTimestamp.toString(), 300)).toBe(false);
  });

  it('accepts a timestamp at the exact expiration boundary', () => {
    const boundaryTimestamp = Math.floor(Date.now() / 1000) - 300; // Exactly 300 seconds ago
    expect(isTimestampValid(boundaryTimestamp.toString(), 300)).toBe(true);
  });

  it('rejects a timestamp just over the expiration boundary', () => {
    const overBoundaryTimestamp = Math.floor(Date.now() / 1000) - 301; // 301 seconds ago
    expect(isTimestampValid(overBoundaryTimestamp.toString(), 300)).toBe(false);
  });

  it('rejects a timestamp from the future (more than 1 minute ahead)', () => {
    const futureTimestamp = Math.floor(Date.now() / 1000) + 120; // 2 minutes in the future
    expect(isTimestampValid(futureTimestamp.toString(), 300)).toBe(false);
  });

  it('accepts a timestamp slightly in the future (within clock skew tolerance)', () => {
    const slightlyFutureTimestamp = Math.floor(Date.now() / 1000) + 30; // 30 seconds in the future
    expect(isTimestampValid(slightlyFutureTimestamp.toString(), 300)).toBe(true);
  });

  it('rejects an invalid timestamp string', () => {
    expect(isTimestampValid('not-a-number', 300)).toBe(false);
  });

  it('rejects an empty timestamp string', () => {
    expect(isTimestampValid('', 300)).toBe(false);
  });

  it('rejects NaN as a timestamp', () => {
    expect(isTimestampValid('NaN', 300)).toBe(false);
  });
});

describe('verifySignature with timestamp expiration', () => {
  it('verifies both signature and timestamp when both are valid', () => {
    const payload = '{"event":"test"}';
    const secret = 'whsec_test_secret';
    const header = computeSignature(payload, secret);
    const currentTimestamp = Math.floor(Date.now() / 1000).toString();

    expect(
      verifySignature(payload, header, secret, currentTimestamp, { maxAgeSeconds: 300 })
    ).toBe(true);
  });

  it('rejects when signature is valid but timestamp is expired', () => {
    const payload = '{"event":"test"}';
    const secret = 'whsec_test_secret';
    const header = computeSignature(payload, secret);
    const oldTimestamp = (Math.floor(Date.now() / 1000) - 400).toString();

    expect(
      verifySignature(payload, header, secret, oldTimestamp, { maxAgeSeconds: 300 })
    ).toBe(false);
  });

  it('rejects when signature is invalid but timestamp is valid', () => {
    const payload = '{"event":"test"}';
    const secret = 'whsec_test_secret';
    const header = computeSignature(payload, secret);
    const currentTimestamp = Math.floor(Date.now() / 1000).toString();

    expect(
      verifySignature(payload, header, 'wrong_secret', currentTimestamp, { maxAgeSeconds: 300 })
    ).toBe(false);
  });

  it('skips timestamp validation when maxAgeSeconds is not specified', () => {
    const payload = '{"event":"test"}';
    const secret = 'whsec_test_secret';
    const header = computeSignature(payload, secret);
    const oldTimestamp = (Math.floor(Date.now() / 1000) - 400).toString();

    // Should accept because timestamp validation is not enabled
    expect(verifySignature(payload, header, secret, oldTimestamp, {})).toBe(true);
  });

  it('skips timestamp validation when timestamp header is not provided', () => {
    const payload = '{"event":"test"}';
    const secret = 'whsec_test_secret';
    const header = computeSignature(payload, secret);

    // Should accept because timestamp is not provided
    expect(verifySignature(payload, header, secret, undefined, { maxAgeSeconds: 300 })).toBe(true);
  });
});
