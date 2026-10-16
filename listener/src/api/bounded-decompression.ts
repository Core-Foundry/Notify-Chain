/**
 * Bounded decompression for compressed request bodies (#999).
 *
 * Endpoints that accept `Content-Encoding: gzip|deflate|br` are exposed to
 * decompression bombs: a few KB of compressed input can expand to gigabytes and
 * exhaust memory or CPU. Bounding only the compressed size is not enough, so
 * this module enforces limits on BOTH sizes while decoding, aborting as soon as
 * the expanded output exceeds the cap rather than after the fact.
 */
import zlib from 'zlib';
import { promisify } from 'util';

const gunzip = promisify(zlib.gunzip);
const inflate = promisify(zlib.inflate);
const brotliDecompress = promisify(zlib.brotliDecompress);

/** Encodings we are willing to decode. Anything else is rejected up front. */
export const SUPPORTED_ENCODINGS = ['gzip', 'deflate', 'br', 'identity'] as const;
export type SupportedEncoding = (typeof SUPPORTED_ENCODINGS)[number];

export interface DecompressionLimits {
  /** Maximum accepted size of the compressed body, in bytes. */
  maxCompressedBytes: number;
  /** Maximum permitted size of the decompressed body, in bytes. */
  maxDecompressedBytes: number;
}

/**
 * Defaults chosen to be generous for real API traffic yet far below anything
 * that could threaten process memory: 1 MiB compressed, 10 MiB expanded.
 */
export const DEFAULT_DECOMPRESSION_LIMITS: DecompressionLimits = {
  maxCompressedBytes: 1 * 1024 * 1024,
  maxDecompressedBytes: 10 * 1024 * 1024,
};

export class UnsupportedEncodingError extends Error {
  readonly code = 'UNSUPPORTED_CONTENT_ENCODING';
  constructor(public readonly encoding: string) {
    super(`Unsupported content-encoding: ${encoding}`);
    this.name = 'UnsupportedEncodingError';
  }
}

export class PayloadTooLargeError extends Error {
  readonly code = 'PAYLOAD_TOO_LARGE';
  constructor(
    public readonly limit: 'compressed' | 'decompressed',
    public readonly maxBytes: number,
  ) {
    super(
      limit === 'compressed'
        ? `Compressed body exceeds ${maxBytes} bytes`
        : `Decompressed body exceeds ${maxBytes} bytes`,
    );
    this.name = 'PayloadTooLargeError';
  }
}

export class MalformedBodyError extends Error {
  readonly code = 'MALFORMED_BODY';
  constructor(public readonly encoding: string, cause?: unknown) {
    super(`Malformed ${encoding} body`);
    this.name = 'MalformedBodyError';
    if (cause !== undefined) {
      (this as { cause?: unknown }).cause = cause;
    }
  }
}

/**
 * Normalise a Content-Encoding header value to a single supported token.
 *
 * Only a single coding is supported: a chained value such as `gzip, br` is
 * rejected because we cannot bound the intermediate representation. An absent
 * or `identity` value means no decoding.
 */
export function parseContentEncoding(
  header: string | string[] | undefined,
): SupportedEncoding {
  const raw = (Array.isArray(header) ? header.join(',') : header ?? '').trim().toLowerCase();
  if (raw === '' || raw === 'identity') {
    return 'identity';
  }
  if (raw.includes(',')) {
    throw new UnsupportedEncodingError(raw);
  }
  if ((SUPPORTED_ENCODINGS as readonly string[]).includes(raw)) {
    return raw as SupportedEncoding;
  }
  throw new UnsupportedEncodingError(raw);
}

/**
 * Decode a compressed body under both size limits.
 *
 * The compressed length is checked before any work is done. The expanded length
 * is checked immediately after decoding; because Node's zlib exposes
 * `maxOutputLength`, the decode is also capped there so a bomb fails inside the
 * decoder instead of allocating an unbounded buffer first.
 */
export async function decompressBounded(
  body: Buffer,
  encoding: SupportedEncoding,
  limits: DecompressionLimits = DEFAULT_DECOMPRESSION_LIMITS,
): Promise<Buffer> {
  if (body.length > limits.maxCompressedBytes) {
    throw new PayloadTooLargeError('compressed', limits.maxCompressedBytes);
  }
  if (encoding === 'identity') {
    return body;
  }

  const opts = { maxOutputLength: limits.maxDecompressedBytes };
  let out: Buffer;
  try {
    switch (encoding) {
      case 'gzip':
        out = await gunzip(body, opts);
        break;
      case 'deflate':
        out = await inflate(body, opts);
        break;
      case 'br':
        out = await brotliDecompress(body, opts);
        break;
      default:
        throw new UnsupportedEncodingError(encoding as string);
    }
  } catch (err) {
    // zlib reports the output cap as ERR_BUFFER_TOO_LARGE / "output length".
    const code = (err as { code?: string }).code ?? '';
    if (code === 'ERR_BUFFER_TOO_LARGE' || /maxOutputLength|output length/i.test(String(err))) {
      throw new PayloadTooLargeError('decompressed', limits.maxDecompressedBytes);
    }
    throw new MalformedBodyError(encoding, err);
  }

  if (out.length > limits.maxDecompressedBytes) {
    throw new PayloadTooLargeError('decompressed', limits.maxDecompressedBytes);
  }
  return out;
}
