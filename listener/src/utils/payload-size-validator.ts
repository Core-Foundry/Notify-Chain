/**
 * Notification payload size validation.
 *
 * Payloads are serialised to JSON before storage; this module measures that
 * serialised byte length and rejects anything that exceeds the configured
 * maximum so oversized data never reaches the database layer.
 *
 * Default limit: 64 KB (65 536 bytes).
 * Override at runtime with the MAX_PAYLOAD_SIZE_BYTES environment variable.
 */

/** Default maximum payload size in bytes (64 KB). */
export const DEFAULT_MAX_PAYLOAD_SIZE_BYTES = 64 * 1024; // 65 536

/**
 * Thrown when a notification payload exceeds the maximum allowed byte size.
 */
export class PayloadTooLargeError extends Error {
  /** The byte size of the rejected payload. */
  public readonly payloadSizeBytes: number;
  /** The configured limit that was exceeded. */
  public readonly maxSizeBytes: number;

  constructor(payloadSizeBytes: number, maxSizeBytes: number) {
    super(
      `Notification payload is too large: ${payloadSizeBytes} bytes exceeds the ` +
        `${maxSizeBytes}-byte limit. Reduce the payload size and retry.`
    );
    this.name = 'PayloadTooLargeError';
    this.payloadSizeBytes = payloadSizeBytes;
    this.maxSizeBytes = maxSizeBytes;
  }
}

/**
 * Validate that a notification payload does not exceed the maximum allowed
 * byte size when serialised to JSON.
 *
 * @param payload - The raw payload object to validate.
 * @param maxSizeBytes - Maximum allowed byte size (defaults to 64 KB).
 * @throws {PayloadTooLargeError} when the serialised payload exceeds the limit.
 */
export function validatePayloadSize(
  payload: Record<string, unknown>,
  maxSizeBytes: number = DEFAULT_MAX_PAYLOAD_SIZE_BYTES
): void {
  const serialised = JSON.stringify(payload);
  // Use Buffer.byteLength to count UTF-8 bytes, not JS string characters.
  const byteLength = Buffer.byteLength(serialised, 'utf8');

  if (byteLength > maxSizeBytes) {
    throw new PayloadTooLargeError(byteLength, maxSizeBytes);
  }
}
