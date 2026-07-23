import { gzipSync, gunzipSync } from 'zlib';
import logger from './logger';

export const COMPRESSION_PREFIX = '__COMPRESSED__:';
export const DEFAULT_COMPRESSION_THRESHOLD_BYTES = 10 * 1024;

interface CompressionOptions {
  thresholdBytes?: number;
}

interface CompressionMetrics {
  originalSizeBytes: number;
  compressedSizeBytes: number;
  reductionPercent: number;
  wasCompressed: boolean;
}

function toSerializableString(payload: unknown): string {
  if (typeof payload === 'string') {
    return payload;
  }

  if (payload === null || payload === undefined) {
    return JSON.stringify(payload);
  }

  if (typeof payload === 'object' || typeof payload === 'number' || typeof payload === 'boolean') {
    return JSON.stringify(payload);
  }

  return String(payload);
}

function calculateMetrics(originalSizeBytes: number, compressedSizeBytes: number): CompressionMetrics {
  const reductionPercent = originalSizeBytes > 0
    ? Math.max(0, Math.round(((originalSizeBytes - compressedSizeBytes) / originalSizeBytes) * 100))
    : 0;

  return {
    originalSizeBytes,
    compressedSizeBytes,
    reductionPercent,
    wasCompressed: compressedSizeBytes < originalSizeBytes,
  };
}

export function compressPayload(payload: unknown, options: CompressionOptions = {}): string {
  const threshold = options.thresholdBytes ?? DEFAULT_COMPRESSION_THRESHOLD_BYTES;
  const serialized = toSerializableString(payload);
  const originalSize = Buffer.byteLength(serialized, 'utf8');

  if (originalSize < threshold) {
    return serialized;
  }

  try {
    const compressedBuffer = gzipSync(serialized);
    const compressedSize = compressedBuffer.length;
    const metrics = calculateMetrics(originalSize, compressedSize);

    logger.info('Payload compressed', {
      originalSizeBytes: metrics.originalSizeBytes,
      compressedSizeBytes: metrics.compressedSizeBytes,
      reductionPercent: metrics.reductionPercent,
    });

    return `${COMPRESSION_PREFIX}${compressedBuffer.toString('base64')}`;
  } catch (error) {
    logger.warn('Payload compression failed, using original payload', { error });
    return serialized;
  }
}

export function decompressPayload(compressedPayload: unknown): string {
  if (typeof compressedPayload !== 'string') {
    return toSerializableString(compressedPayload);
  }

  if (!compressedPayload.startsWith(COMPRESSION_PREFIX)) {
    return compressedPayload;
  }

  const base64Payload = compressedPayload.slice(COMPRESSION_PREFIX.length);

  try {
    const buffer = Buffer.from(base64Payload, 'base64');
    const decompressed = gunzipSync(buffer);
    return decompressed.toString('utf8');
  } catch (error) {
    logger.warn('Payload decompression failed, returning original value', { error, payloadPreview: compressedPayload.slice(0, 80) });
    return compressedPayload;
  }
}

export function logCompressionMetrics(metrics: CompressionMetrics): void {
  logger.info('Payload compression metrics', {
    originalSizeBytes: metrics.originalSizeBytes,
    compressedSizeBytes: metrics.compressedSizeBytes,
    reductionPercent: metrics.reductionPercent,
    wasCompressed: metrics.wasCompressed,
  });
}
