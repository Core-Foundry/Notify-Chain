import crypto from 'crypto';

/**
 * Computes an HMAC-SHA256 hash of a payload string.
 * The secret should come from the PAYLOAD_INTEGRITY_SECRET env var.
 */
export function hashPayload(payload: string, secret: string): string {
  return crypto.createHmac('sha256', secret).update(payload, 'utf8').digest('hex');
}

/**
 * Verifies that a payload matches its stored hash using a timing-safe comparison.
 * Returns false if either argument is missing or the hash doesn't match.
 */
export function verifyPayloadIntegrity(
  payload: string,
  storedHash: string,
  secret: string
): boolean {
  if (!payload || !storedHash) return false;

  const expected = hashPayload(payload, secret);

  if (expected.length !== storedHash.length) return false;

  return crypto.timingSafeEqual(Buffer.from(expected, 'utf8'), Buffer.from(storedHash, 'utf8'));
}
