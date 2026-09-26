import * as StellarSDK from '@stellar/stellar-sdk';

export interface EventValidationResult {
  valid: boolean;
  reason?: string;
}

export interface RpcResponseValidationResult {
  valid: boolean;
  reason?: string;
}

/**
 * The current event payload protocol version understood by this listener.
 * Matches `CURRENT_NOTIFICATION_VERSION` in the Soroban contract.
 */
export const CURRENT_EVENT_VERSION = 1;

/**
 * All event payload versions this listener can process.
 * Add a new entry here whenever the contract introduces a new schema version.
 */
export const SUPPORTED_EVENT_VERSIONS: ReadonlySet<number> = new Set([1]);

export interface EventVersionParseResult {
  /** Whether a version field was present and could be read. */
  found: boolean;
  /**
   * The numeric version extracted from the payload.
   * `undefined` when `found` is false (no version field present).
   */
  version: number | undefined;
  /**
   * Human-readable reason when the value could not be parsed as a valid
   * version number (e.g. wrong XDR type, non-integer).
   * Only set when `found` is true but the value is unusable.
   */
  parseError?: string;
}

/**
 * Attempt to extract `payload_version` from a raw Soroban `ScVal`.
 *
 * The Soroban contract serialises versioned event data as either:
 *   - An `ScvMap` containing a `payload_version` key (e.g. `NotificationScheduled`)
 *   - A direct `ScvU32` / `ScvU64` integer (future single-field events)
 *
 * Events that pre-date versioning (no `payload_version` key) return
 * `{ found: false, version: undefined }` so callers can apply a default
 * without breaking existing integrations.
 *
 * @param value - Raw `ScVal` from `StellarSDK.rpc.Api.EventResponse.value`
 */
export function parseEventVersion(value: StellarSDK.xdr.ScVal): EventVersionParseResult {
  if (value === undefined || value === null) {
    return { found: false, version: undefined };
  }

  try {
    const native = StellarSDK.scValToNative(value);

    // Case 1: struct/map — look for a payload_version key
    if (native !== null && typeof native === 'object' && !Array.isArray(native)) {
      const record = native as Record<string, unknown>;
      const raw = record['payload_version'];

      if (raw === undefined || raw === null) {
        // Map present but no payload_version key — pre-versioned event
        return { found: false, version: undefined };
      }

      const ver = Number(raw);
      if (!Number.isInteger(ver) || ver < 1) {
        return {
          found: true,
          version: undefined,
          parseError: `payload_version is not a positive integer: ${raw}`,
        };
      }

      return { found: true, version: ver };
    }

    // Case 2: bare integer value (u32 / u64 / i128 all convert to number/bigint)
    if (typeof native === 'number' || typeof native === 'bigint') {
      const ver = Number(native);
      if (!Number.isInteger(ver) || ver < 1) {
        return {
          found: true,
          version: undefined,
          parseError: `payload_version integer is not a positive integer: ${native}`,
        };
      }
      return { found: true, version: ver };
    }

    // Any other type (string, array, boolean…) — not a version field
    return { found: false, version: undefined };
  } catch {
    // scValToNative threw — XDR is malformed; treat as no version
    return { found: false, version: undefined };
  }
}

/**
 * Validate that the version extracted by `parseEventVersion` is supported.
 *
 * Returns `{ valid: true }` for:
 *   - Events with no version field (pre-versioning, treated as v1 for
 *     backward compatibility)
 *   - Events whose version is in `SUPPORTED_EVENT_VERSIONS`
 *
 * Returns `{ valid: false, reason }` for:
 *   - Malformed version values (non-integer, negative)
 *   - Versions greater than `CURRENT_EVENT_VERSION` (unknown future schema)
 *   - Versions that were explicitly removed from `SUPPORTED_EVENT_VERSIONS`
 */
export function validateEventVersion(value: StellarSDK.xdr.ScVal): EventValidationResult {
  const parsed = parseEventVersion(value);

  // No version field — backward-compatible; accept as v1
  if (!parsed.found) {
    return { valid: true };
  }

  // Version field found but could not be parsed as a usable integer
  if (parsed.version === undefined) {
    return {
      valid: false,
      reason: `Unsupported event payload version: ${parsed.parseError}`,
    };
  }

  if (!SUPPORTED_EVENT_VERSIONS.has(parsed.version)) {
    return {
      valid: false,
      reason: `Unsupported event payload version ${parsed.version}; supported versions are [${[...SUPPORTED_EVENT_VERSIONS].join(', ')}]`,
    };
  }

  return { valid: true };
}

export function validateRpcResponse(
  response: StellarSDK.rpc.Api.GetEventsResponse | null | undefined
): RpcResponseValidationResult {
  if (!response || typeof response !== 'object') {
    return { valid: false, reason: 'RPC response is missing or not an object' };
  }

  if (response.events === undefined || response.events === null) {
    return { valid: false, reason: 'RPC response is missing the events field' };
  }

  if (!Array.isArray(response.events)) {
    return { valid: false, reason: 'RPC response events field is not an array' };
  }

  if (response.cursor !== undefined && typeof response.cursor !== 'string') {
    return { valid: false, reason: 'RPC response cursor field is not a string' };
  }

  return { valid: true };
}

export function validateEventPayload(
  event: StellarSDK.rpc.Api.EventResponse
): EventValidationResult {
  if (!event.id || typeof event.id !== 'string') {
    return { valid: false, reason: 'Missing or invalid event id' };
  }
  if (!event.type || typeof event.type !== 'string') {
    return { valid: false, reason: 'Missing or invalid event type' };
  }
  if (typeof event.ledger !== 'number' || event.ledger < 0) {
    return { valid: false, reason: 'Missing or invalid ledger' };
  }
  if (!Array.isArray(event.topic)) {
    return { valid: false, reason: 'Missing or invalid topic' };
  }
  if (event.value === undefined || event.value === null) {
    return { valid: false, reason: 'Missing event value' };
  }
  return { valid: true };
}

export function getEventName(topic: StellarSDK.xdr.ScVal[]): string | null {
  if (!topic || topic.length === 0) {
    return null;
  }

  for (const entry of topic) {
    const name = scValToString(entry);
    if (name) {
      return name;
    }
  }

  return null;
}

export function matchesEventFilter(
  eventName: string | null,
  allowedEvents: string[]
): boolean {
  if (!allowedEvents || allowedEvents.length === 0 || allowedEvents.includes('*')) {
    return true;
  }

  if (!eventName) {
    return false;
  }

  return allowedEvents.includes(eventName);
}

function scValToString(val: StellarSDK.xdr.ScVal): string | null {
  switch (val.switch()) {
    case StellarSDK.xdr.ScValType.scvSymbol():
      return val.sym().toString();
    case StellarSDK.xdr.ScValType.scvString():
      return val.str().toString();
    default:
      return null;
  }
}
