/**
 * Raw event data retention service (issue #945).
 *
 * Stores original blockchain event representations alongside normalized/parsed
 * fields to facilitate debugging when event parsing or decoding rules change.
 *
 * Guarantees:
 * 1. Distinguishable representations: explicit discriminators and separate models
 *    for raw and normalized representations.
 * 2. Storage limits: enforces per-payload byte limits with graceful truncation
 *    and bounded capacity in the retention store.
 * 3. Secret redaction: sanitizes credentials and sensitive values before storage.
 */

import { redactValue, redactString } from '../utils/redact';
import { sanitizeCredentials } from '../utils/credential-sanitizer';

/** Default maximum size in bytes for a single retained raw event payload (32 KB). */
export const DEFAULT_MAX_RAW_PAYLOAD_BYTES = 32 * 1024;

/** Default maximum number of raw events retained in memory. */
export const DEFAULT_MAX_RETAINED_EVENTS = 1000;

/**
 * Distinguishable raw event representation.
 */
export interface RawEventData {
  /** Discriminator identifying this as an original/raw representation. */
  readonly format: 'raw';
  /** Timestamp when the raw representation was captured. */
  readonly capturedAt: string;
  /** Retained payload size in bytes. */
  readonly sizeBytes: number;
  /** Sanitized original payload object or representation. */
  readonly payload: unknown;
  /** True if the original payload exceeded size limits and was truncated. */
  readonly truncated?: boolean;
  /** Original uncompressed size before truncation (if truncated). */
  readonly originalSizeBytes?: number;
}

/**
 * Envelope combining distinguishable raw and normalized representations of an event.
 */
export interface RetainedEventRecord<TNormalized = unknown> {
  readonly kind: 'retained_event';
  readonly eventId: string;
  readonly contractAddress: string;
  readonly ledger: number;
  readonly normalized: TNormalized;
  readonly raw: RawEventData | null;
}

export interface RawEventRetentionOptions {
  /** Maximum allowed size in bytes for the stored raw payload. Defaults to 32 KB. */
  maxPayloadBytes?: number;
  /** Whether to redact secrets and credentials from the raw payload. Defaults to true. */
  redactSecrets?: boolean;
}

/**
 * Type guard for RawEventData.
 */
export function isRawEventData(value: unknown): value is RawEventData {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Record<string, unknown>;
  return (
    candidate.format === 'raw' &&
    typeof candidate.capturedAt === 'string' &&
    typeof candidate.sizeBytes === 'number' &&
    'payload' in candidate
  );
}

/**
 * Type guard for RetainedEventRecord.
 */
export function isRetainedEventRecord(value: unknown): value is RetainedEventRecord {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Record<string, unknown>;
  return (
    candidate.kind === 'retained_event' &&
    typeof candidate.eventId === 'string' &&
    typeof candidate.contractAddress === 'string' &&
    typeof candidate.ledger === 'number' &&
    'normalized' in candidate &&
    ('raw' in candidate && (candidate.raw === null || isRawEventData(candidate.raw)))
  );
}

/**
 * Deeply sanitizes any sensitive credentials, seeds, or tokens in raw event data.
 */
function sanitizeRawPayload(payload: unknown): unknown {
  if (payload === null || payload === undefined) {
    return payload;
  }

  if (typeof payload === 'string') {
    return sanitizeCredentials(redactString(payload));
  }

  // Handle ScVal / XDR or complex objects with recursive redaction
  return redactValue(payload);
}

/**
 * Safely measures serialized byte size of an object or primitive.
 */
function calculateByteLength(value: unknown): number {
  if (value === null || value === undefined) return 0;
  if (typeof value === 'string') {
    return Buffer.byteLength(value, 'utf-8');
  }
  try {
    const serialized = JSON.stringify(value);
    return Buffer.byteLength(serialized ?? '', 'utf-8');
  } catch {
    return Buffer.byteLength(String(value), 'utf-8');
  }
}

/** Truncation indicator appended when payload exceeds max size. */
export const TRUNCATION_SUFFIX = '... [TRUNCATED]';
const TRUNCATION_SUFFIX_BYTES = Buffer.byteLength(TRUNCATION_SUFFIX, 'utf-8');

/**
 * Enforces per-event storage limits with safe truncation if payload is oversized.
 */
function truncatePayload(
  payload: unknown,
  maxBytes: number,
): { payload: unknown; sizeBytes: number; originalSizeBytes: number; truncated: boolean } {
  const originalSize = calculateByteLength(payload);
  if (originalSize <= maxBytes) {
    return {
      payload,
      sizeBytes: originalSize,
      originalSizeBytes: originalSize,
      truncated: false,
    };
  }

  const maxStrLen = Math.max(0, maxBytes - TRUNCATION_SUFFIX_BYTES);

  if (typeof payload === 'string') {
    const truncatedString = payload.slice(0, maxStrLen) + TRUNCATION_SUFFIX;
    return {
      payload: truncatedString,
      sizeBytes: Buffer.byteLength(truncatedString, 'utf-8'),
      originalSizeBytes: originalSize,
      truncated: true,
    };
  }

  try {
    const serialized = JSON.stringify(payload);
    const truncatedStr = serialized.slice(0, maxStrLen) + TRUNCATION_SUFFIX;
    return {
      payload: {
        _rawTruncated: truncatedStr,
        _notice: 'Payload exceeded storage limit and was truncated',
      },
      sizeBytes: Buffer.byteLength(truncatedStr, 'utf-8'),
      originalSizeBytes: originalSize,
      truncated: true,
    };
  } catch {
    const fallbackStr = String(payload).slice(0, maxStrLen) + TRUNCATION_SUFFIX;
    return {
      payload: fallbackStr,
      sizeBytes: Buffer.byteLength(fallbackStr, 'utf-8'),
      originalSizeBytes: originalSize,
      truncated: true,
    };
  }
}

/**
 * Captures, sanitizes, and enforces storage limits on a raw event representation.
 */
export function captureRawEvent(
  rawInput: unknown,
  options: RawEventRetentionOptions = {},
): RawEventData | null {
  if (rawInput === null || rawInput === undefined) {
    return null;
  }

  const maxBytes = options.maxPayloadBytes ?? DEFAULT_MAX_RAW_PAYLOAD_BYTES;

  // Avoid double-wrapping if already captured as RawEventData
  if (isRawEventData(rawInput)) {
    if (rawInput.sizeBytes <= maxBytes && options.redactSecrets !== false) {
      return rawInput;
    }
    rawInput = rawInput.payload;
  }

  const shouldRedact = options.redactSecrets !== false;

  const sanitized = shouldRedact ? sanitizeRawPayload(rawInput) : rawInput;
  const { payload, sizeBytes, originalSizeBytes, truncated } = truncatePayload(sanitized, maxBytes);

  return {
    format: 'raw',
    capturedAt: new Date().toISOString(),
    sizeBytes,
    payload,
    ...(truncated ? { truncated: true, originalSizeBytes } : {}),
  };
}

/**
 * Combines a normalized event and raw event representation into a distinguishable envelope.
 */
export function createRetainedEvent<TNormalized extends { eventId: string; contractAddress: string; ledger: number }>(
  normalized: TNormalized,
  rawInput: unknown,
  options: RawEventRetentionOptions = {},
): RetainedEventRecord<TNormalized> {
  const raw = captureRawEvent(rawInput, options);
  return {
    kind: 'retained_event',
    eventId: normalized.eventId,
    contractAddress: normalized.contractAddress,
    ledger: normalized.ledger,
    normalized,
    raw,
  };
}

/**
 * In-memory storage controller for raw event retention with bounded capacity.
 */
export class RawEventStore {
  private readonly store = new Map<string, RawEventData>();
  private readonly maxEvents: number;
  private readonly defaultOptions: RawEventRetentionOptions;

  constructor(
    maxEvents = DEFAULT_MAX_RETAINED_EVENTS,
    options: RawEventRetentionOptions = {},
  ) {
    if (!Number.isInteger(maxEvents) || maxEvents < 1) {
      throw new Error('maxEvents must be a positive integer');
    }
    this.maxEvents = maxEvents;
    this.defaultOptions = options;
  }

  private getKey(eventId: string, contractAddress: string): string {
    return `${contractAddress}:${eventId}`;
  }

  /**
   * Captures and stores raw event data with capacity eviction.
   */
  set(eventId: string, contractAddress: string, rawInput: unknown): RawEventData | null {
    const rawData = captureRawEvent(rawInput, this.defaultOptions);
    if (!rawData) return null;

    const key = this.getKey(eventId, contractAddress);

    // Evict oldest if capacity exceeded
    if (this.store.size >= this.maxEvents && !this.store.has(key)) {
      const oldestKey = this.store.keys().next().value;
      if (oldestKey !== undefined) {
        this.store.delete(oldestKey);
      }
    }

    this.store.set(key, rawData);
    return rawData;
  }

  get(eventId: string, contractAddress: string): RawEventData | undefined {
    return this.store.get(this.getKey(eventId, contractAddress));
  }

  has(eventId: string, contractAddress: string): boolean {
    return this.store.has(this.getKey(eventId, contractAddress));
  }

  delete(eventId: string, contractAddress: string): boolean {
    return this.store.delete(this.getKey(eventId, contractAddress));
  }

  clear(): void {
    this.store.clear();
  }

  count(): number {
    return this.store.size;
  }

  /**
   * Returns current storage utilization statistics.
   */
  getStats(): { count: number; maxEvents: number; totalBytes: number } {
    let totalBytes = 0;
    for (const raw of this.store.values()) {
      totalBytes += raw.sizeBytes;
    }
    return {
      count: this.store.size,
      maxEvents: this.maxEvents,
      totalBytes,
    };
  }
}

export const rawEventStore = new RawEventStore();
