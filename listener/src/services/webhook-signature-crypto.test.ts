/**
 * Issue #1001 — Independent cryptographic verification tests for webhook
 * signatures.
 *
 * These tests deliberately do NOT rely on any other webhook test suites; they
 * build their own fixtures and exercise the public verification surface
 * (`verifySignature`, `computeWebhookSignature`, `verifyWebhookRequest`) for:
 *   (a) tampered payloads must fail,
 *   (b) malformed signatures must fail,
 *   (c) invalid signing-key configuration must fail,
 *   (d) verification must use a constant-time comparison
 *       (crypto.timingSafeEqual) after a length check.
 */
import crypto from 'crypto';
import {
  verifySignature,
  computeWebhookSignature,
  verifyWebhookRequest,
} from './webhook-verifier';
import logger from '../utils/logger';

jest.mock('../utils/logger', () => ({
  __esModule: true,
  default: { info: jest.fn(), error: jest.fn(), warn: jest.fn() },
}));

const mockLogger = logger as jest.Mocked<typeof logger>;

const SECRET = 'whsec_nc1001_independent_test_secret';
const PAYLOAD = '{"event":"issue.created","n":1001}';
const TIMESTAMP = '1700000000';

function sign(payload: string, secret = SECRET, timestamp = TIMESTAMP): string {
  return computeWebhookSignature(payload, secret, timestamp);
}

const freshTs = (): string => Math.floor(Date.now() / 1000).toString();

beforeEach(() => {
  jest.clearAllMocks();
});

describe('#1001 (a) tampered payloads are rejected', () => {
  it('fails when the payload is modified after signing', () => {
    const sig = sign(PAYLOAD);
    const tampered = PAYLOAD.replace('1001', '9999');
    expect(tampered).not.toBe(PAYLOAD);
    expect(verifySignature(tampered, sig, SECRET, TIMESTAMP).valid).toBe(false);
  });

  it('fails when a single byte of the body is flipped', () => {
    const sig = sign(PAYLOAD);
    expect(verifySignature(PAYLOAD.slice(0, -1) + '2}', sig, SECRET, TIMESTAMP).valid).toBe(false);
    expect(verifySignature(' ' + PAYLOAD, sig, SECRET, TIMESTAMP).valid).toBe(false);
  });

  it('fails end-to-end when the attacker re-uses a signature over a different body', async () => {
    const ts = freshTs();
    const sig = sign('{"amount":10}', SECRET, ts);
    const outcome = await verifyWebhookRequest({
      headers: {
        'x-webhook-signature': sig,
        'x-webhook-key-id': 'key-1',
        'x-webhook-timestamp': ts,
      },
      rawBody: '{"amount":1000000}',
      secrets: [{ id: 'key-1', secret: SECRET }],
      requestId: 'nc1001-tamper',
    });
    expect(outcome.authenticated).toBe(false);
    expect(outcome.statusCode).toBe(401);
    expect(outcome.errorCode).toBe('AUTH_INVALID_SIGNATURE');
  });

  it('does not verify a payload signed with a different timestamp (timestamp binding)', () => {
    const sig = sign(PAYLOAD, SECRET, '1700000000');
    expect(verifySignature(PAYLOAD, sig, SECRET, '1700000001').valid).toBe(false);
  });
});

describe('#1001 (b) malformed signatures are rejected', () => {
  it('rejects an empty signature header', () => {
    expect(verifySignature(PAYLOAD, '', SECRET, TIMESTAMP).valid).toBe(false);
  });

  it('rejects a non-string signature header', () => {
    expect(
      verifySignature(PAYLOAD, undefined as unknown as string, SECRET, TIMESTAMP).valid
    ).toBe(false);
  });

  it('rejects a signature without the sha256= prefix', () => {
    const raw = crypto.createHmac('sha256', SECRET).update(PAYLOAD, 'utf8').digest('hex');
    expect(verifySignature(PAYLOAD, raw, SECRET, TIMESTAMP).valid).toBe(false);
  });

  it('rejects a signature of the wrong length (truncated / padded)', () => {
    const good = sign(PAYLOAD);
    const truncated = good.slice(0, good.length - 4);
    expect(verifySignature(PAYLOAD, truncated, SECRET, TIMESTAMP).valid).toBe(false);
    expect(verifySignature(PAYLOAD, truncated + 'zz', SECRET, TIMESTAMP).valid).toBe(false);
  });

  it('rejects a hex digest that is the wrong length even though the prefix is valid', () => {
    const good = sign(PAYLOAD);
    const wrongLength = 'sha256=' + 'a'.repeat(63);
    expect(wrongLength.length).toBe(good.length - 1);
    expect(verifySignature(PAYLOAD, wrongLength, SECRET, TIMESTAMP).valid).toBe(false);
  });

  it('rejects non-hex garbage of the correct length', () => {
    const good = sign(PAYLOAD);
    const garbage = 'sha256=' + 'z'.repeat(64);
    expect(garbage.length).toBe(good.length);
    expect(verifySignature(PAYLOAD, garbage, SECRET, TIMESTAMP).valid).toBe(false);
  });
});

describe('#1001 (c) invalid signing-key configuration is rejected', () => {
  const SECRETS = [
    { id: 'key-live', secret: 'whsec_live_aaa' },
    { id: 'key-rotated', secret: 'whsec_rotated_bbb' },
  ];

  it('rejects when the signature was computed with a secret not in the configuration', async () => {
    const ts = freshTs();
    const sig = sign(PAYLOAD, 'whsec_from_somewhere_else', ts);
    const outcome = await verifyWebhookRequest({
      headers: {
        'x-webhook-signature': sig,
        'x-webhook-key-id': 'key-live',
        'x-webhook-timestamp': ts,
      },
      rawBody: PAYLOAD,
      secrets: SECRETS,
      requestId: 'nc1001-keycfg-1',
    });
    expect(outcome.authenticated).toBe(false);
    expect(outcome.statusCode).toBe(401);
    expect(['AUTH_UNKNOWN_KEY_ID', 'AUTH_INVALID_SIGNATURE']).toContain(outcome.errorCode);
  });

  it('rejects when the key-id refers to a key with a rotated-out secret', async () => {
    const ts = freshTs();
    const sig = sign(PAYLOAD, 'whsec_old_pre_rotation', ts);
    const outcome = await verifyWebhookRequest({
      headers: {
        'x-webhook-signature': sig,
        'x-webhook-key-id': 'key-rotated',
        'x-webhook-timestamp': ts,
      },
      rawBody: PAYLOAD,
      secrets: SECRETS,
      requestId: 'nc1001-keycfg-2',
    });
    expect(outcome.authenticated).toBe(false);
    expect(outcome.statusCode).toBe(401);
  });

  it('rejects an empty secrets configuration even for a well-formed request', async () => {
    const ts = freshTs();
    const sig = sign(PAYLOAD, SECRET, ts);
    const outcome = await verifyWebhookRequest({
      headers: {
        'x-webhook-signature': sig,
        'x-webhook-key-id': 'key-live',
        'x-webhook-timestamp': ts,
      },
      rawBody: PAYLOAD,
      secrets: [],
      requestId: 'nc1001-keycfg-3',
    });
    expect(outcome.authenticated).toBe(false);
    expect(outcome.statusCode).toBe(401);
    expect(outcome.errorCode).toBe('AUTH_UNKNOWN_KEY_ID');
  });

  it('accepts a correctly configured key as a positive control', async () => {
    const ts = freshTs();
    const sig = sign(PAYLOAD, SECRETS[0].secret, ts);
    const outcome = await verifyWebhookRequest({
      headers: {
        'x-webhook-signature': sig,
        'x-webhook-key-id': 'key-live',
        'x-webhook-timestamp': ts,
      },
      rawBody: PAYLOAD,
      secrets: SECRETS,
      requestId: 'nc1001-keycfg-ok',
    });
    expect(outcome.authenticated).toBe(true);
  });
});

describe('#1001 (d) verification is constant-time', () => {
  it('uses crypto.timingSafeEqual after a length check for equal-length digests', () => {
    const spy = jest.spyOn(crypto, 'timingSafeEqual');
    const sig = sign(PAYLOAD);
    verifySignature(PAYLOAD, sig, SECRET, TIMESTAMP);
    expect(spy).toHaveBeenCalledTimes(1);
    const [a, b] = spy.mock.calls[0];
    expect(a.length).toBe(64);
    expect(b.length).toBe(64);
    expect(a.equals(b)).toBe(true);
    spy.mockRestore();
  });

  it('uses crypto.timingSafeEqual (mismatching path) for a tampered payload', () => {
    const spy = jest.spyOn(crypto, 'timingSafeEqual');
    const sig = sign(PAYLOAD);
    const result = verifySignature(PAYLOAD + '!', sig, SECRET, TIMESTAMP);
    expect(result.valid).toBe(false);
    expect(result.reason).toBe('hmac_mismatch');
    expect(spy).toHaveBeenCalledTimes(1);
    const [a, b] = spy.mock.calls[0];
    expect(a.equals(b)).toBe(false);
    spy.mockRestore();
  });

  it('does NOT call timingSafeEqual when the digest lengths differ (length check first)', () => {
    const spy = jest.spyOn(crypto, 'timingSafeEqual');
    const sig = sign(PAYLOAD);
    const result = verifySignature(PAYLOAD, sig.slice(0, -8), SECRET, TIMESTAMP);
    expect(result.valid).toBe(false);
    expect(result.reason).toBe('signature_length_mismatch');
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it('rejects a wrong secret in constant time without throwing', () => {
    const spy = jest.spyOn(crypto, 'timingSafeEqual');
    const sig = sign(PAYLOAD, 'whsec_wrong_key_entirely', TIMESTAMP);
    expect(() => verifySignature(PAYLOAD, sig, SECRET, TIMESTAMP)).not.toThrow();
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });
});
