import {
  compressPayload,
  decompressPayload,
  COMPRESSION_PREFIX,
  DEFAULT_COMPRESSION_THRESHOLD_BYTES,
} from './payload-compression';

describe('payload compression utilities', () => {
  it('compresses and restores a large payload without data loss', () => {
    const payload = {
      event: 'large-notification',
      message: 'x'.repeat(15000),
      details: Array.from({ length: 200 }, (_, index) => ({
        id: index,
        label: `entry-${index}`,
        text: 'compressed-payload'.repeat(20),
      })),
    };

    const serialized = JSON.stringify(payload);
    const compressed = compressPayload(payload);
    const restored = decompressPayload(compressed);

    expect(compressed).toContain(COMPRESSION_PREFIX);
    expect(Buffer.byteLength(compressed, 'utf8')).toBeLessThan(Buffer.byteLength(serialized, 'utf8'));
    expect(restored).toEqual(serialized);
  });

  it('passes a small payload through without compression', () => {
    const payload = { message: 'small payload' };
    const serialized = JSON.stringify(payload);

    const compressed = compressPayload(payload, { thresholdBytes: DEFAULT_COMPRESSION_THRESHOLD_BYTES + 10000 });

    expect(compressed).toEqual(serialized);
    expect(decompressPayload(compressed)).toEqual(serialized);
  });

  it('falls back safely for legacy uncompressed payloads', () => {
    const legacyPayload = JSON.stringify({ message: 'legacy payload' });

    expect(decompressPayload(legacyPayload)).toEqual(legacyPayload);
  });

  it('handles invalid or corrupted compressed input without throwing', () => {
    const corruptedPayload = `${COMPRESSION_PREFIX}not-valid-base64`;

    expect(() => decompressPayload(corruptedPayload)).not.toThrow();
    expect(decompressPayload(corruptedPayload)).toEqual(corruptedPayload);
  });

  it('passes unsupported payload formats through safely', () => {
    const unsupportedPayload = 42 as unknown;

    expect(compressPayload(unsupportedPayload)).toBe('42');
    expect(decompressPayload(unsupportedPayload)).toBe('42');
  });
});
