/**
 * #999 - Bounded decompression of compressed request bodies.
 */
import zlib from 'zlib';
import {
  decompressBounded,
  parseContentEncoding,
  DEFAULT_DECOMPRESSION_LIMITS,
  UnsupportedEncodingError,
  PayloadTooLargeError,
  MalformedBodyError,
} from './bounded-decompression';

const gz = (b: Buffer) => zlib.gzipSync(b);
const def = (b: Buffer) => zlib.deflateSync(b);
const br = (b: Buffer) => zlib.brotliCompressSync(b);

describe('parseContentEncoding (#999)', () => {
  it('treats an absent header as identity', () => {
    expect(parseContentEncoding(undefined)).toBe('identity');
    expect(parseContentEncoding('')).toBe('identity');
  });

  it('treats an explicit identity as identity', () => {
    expect(parseContentEncoding('identity')).toBe('identity');
  });

  it('accepts gzip, deflate and br (case-insensitive)', () => {
    expect(parseContentEncoding('gzip')).toBe('gzip');
    expect(parseContentEncoding('DEFLATE')).toBe('deflate');
    expect(parseContentEncoding('Br')).toBe('br');
  });

  it('rejects an unknown encoding', () => {
    expect(() => parseContentEncoding('zstd')).toThrow(UnsupportedEncodingError);
  });

  it('rejects a chained encoding (cannot bound the intermediate)', () => {
    expect(() => parseContentEncoding('gzip, br')).toThrow(UnsupportedEncodingError);
  });

  it('joins duplicate headers before rejecting a chain', () => {
    expect(() => parseContentEncoding(['gzip', 'br'])).toThrow(UnsupportedEncodingError);
  });
});

describe('decompressBounded (#999)', () => {
  const limits = { maxCompressedBytes: 100_000, maxDecompressedBytes: 100_000 };

  it('returns identity bodies unchanged', async () => {
    const body = Buffer.from('hello');
    await expect(decompressBounded(body, 'identity', limits)).resolves.toEqual(body);
  });

  it('decodes a normal gzip body', async () => {
    const original = Buffer.from('a normal payload');
    await expect(decompressBounded(gz(original), 'gzip', limits)).resolves.toEqual(original);
  });

  it('decodes a normal deflate body', async () => {
    const original = Buffer.from('a normal payload');
    await expect(decompressBounded(def(original), 'deflate', limits)).resolves.toEqual(original);
  });

  it('decodes a normal brotli body', async () => {
    const original = Buffer.from('a normal payload');
    await expect(decompressBounded(br(original), 'br', limits)).resolves.toEqual(original);
  });

  it('rejects a compressed body over the compressed limit', async () => {
    const body = Buffer.alloc(200_000);
    await expect(decompressBounded(body, 'identity', limits)).rejects.toBeInstanceOf(
      PayloadTooLargeError,
    );
  });

  it('rejects a decompression bomb by expanded size', async () => {
    // 1 MiB of zeros compresses to a few hundred bytes.
    const bomb = gz(Buffer.alloc(1024 * 1024));
    expect(bomb.length).toBeLessThan(limits.maxCompressedBytes);
    const err = await decompressBounded(bomb, 'gzip', limits).catch((e) => e);
    expect(err).toBeInstanceOf(PayloadTooLargeError);
    expect((err as PayloadTooLargeError).limit).toBe('decompressed');
  });

  it('rejects malformed gzip input', async () => {
    await expect(
      decompressBounded(Buffer.from('not gzip at all'), 'gzip', limits),
    ).rejects.toBeInstanceOf(MalformedBodyError);
  });

  it('rejects malformed brotli input', async () => {
    await expect(
      decompressBounded(Buffer.from([0xff, 0xff, 0xff, 0xff]), 'br', limits),
    ).rejects.toBeInstanceOf(MalformedBodyError);
  });

  it('accepts a body exactly at the compressed limit', async () => {
    const at = Buffer.alloc(limits.maxCompressedBytes);
    await expect(decompressBounded(at, 'identity', limits)).resolves.toHaveLength(
      limits.maxCompressedBytes,
    );
  });

  it('accepts output exactly at the decompressed limit', async () => {
    const original = Buffer.alloc(limits.maxDecompressedBytes, 0x41);
    await expect(decompressBounded(gz(original), 'gzip', limits)).resolves.toHaveLength(
      limits.maxDecompressedBytes,
    );
  });

  it('exposes sane defaults', () => {
    expect(DEFAULT_DECOMPRESSION_LIMITS.maxCompressedBytes).toBe(1024 * 1024);
    expect(DEFAULT_DECOMPRESSION_LIMITS.maxDecompressedBytes).toBe(10 * 1024 * 1024);
  });
});
