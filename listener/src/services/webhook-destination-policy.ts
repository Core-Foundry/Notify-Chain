/**
 * Outbound webhook destination policy (#994).
 *
 * A webhook URL is attacker-influenced: whoever registers the endpoint chooses
 * the hostname. Validating the hostname once is not enough, because DNS can
 * change between validation and delivery (DNS rebinding), and a hostname that
 * looks external can resolve to loopback, a private range or the cloud metadata
 * address. This module re-resolves the destination immediately before delivery
 * and rejects any address that is not publicly routable.
 */
import * as dns from 'dns';
import * as net from 'net';

/** Error raised when a webhook destination resolves to a non-public address. */
export class UnsafeWebhookDestinationError extends Error {
  constructor(
    public readonly hostname: string,
    public readonly addresses: string[],
  ) {
    super(
      `Webhook destination "${hostname}" resolves to a non-public address ` +
        `(${addresses.join(', ')}); refusing to deliver.`,
    );
    this.name = 'UnsafeWebhookDestinationError';
  }
}

export function isUnsafeWebhookDestinationError(
  error: unknown,
): error is UnsafeWebhookDestinationError {
  return error instanceof UnsafeWebhookDestinationError;
}

/**
 * True when `ip` is not a publicly routable unicast address.
 *
 * Covers IPv4 loopback/link-local/private/CGNAT/reserved and IPv6
 * loopback/unspecified/link-local/unique-local/embedded-IPv4.
 */
export function isPrivateAddress(ip: string): boolean {
  const version = net.isIP(ip);
  if (version === 4) {
    return isPrivateIPv4(ip);
  }
  if (version === 6) {
    return isPrivateIPv6(ip);
  }
  // Not a literal IP: callers must resolve first; treat as unsafe so an
  // unexpected value can never be treated as a safe destination.
  return true;
}

function isPrivateIPv4(ip: string): boolean {
  const parts = ip.split('.').map((p) => Number.parseInt(p, 10));
  if (parts.length !== 4 || parts.some((n) => Number.isNaN(n))) {
    return true;
  }
  const [a, b] = parts;
  if (a === 0) return true; // 0.0.0.0/8 "this network"
  if (a === 10) return true; // 10/8 private
  if (a === 127) return true; // loopback
  if (a === 169 && b === 254) return true; // link-local incl. 169.254.169.254
  if (a === 172 && b >= 16 && b <= 31) return true; // 172.16/12 private
  if (a === 192 && b === 168) return true; // 192.168/16 private
  if (a === 192 && b === 0) return true; // 192.0.0/24, 192.0.2/24 special
  if (a === 198 && (b === 18 || b === 19)) return true; // benchmarking
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT 100.64/10
  if (a >= 224) return true; // multicast + reserved + broadcast
  return false;
}

function isPrivateIPv6(ip: string): boolean {
  const lower = ip.toLowerCase();
  if (lower === '::' || lower === '::1') return true; // unspecified / loopback
  if (lower.startsWith('fe80:')) return true; // link-local
  if (lower.startsWith('fc') || lower.startsWith('fd')) return true; // ULA fc00::/7
  if (lower.startsWith('ff')) return true; // multicast
  // IPv4-mapped (::ffff:127.0.0.1) and IPv4-compatible forms.
  const embedded = lower.match(/(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/);
  if (embedded) {
    return isPrivateIPv4(embedded[1]);
  }
  return false;
}

export interface DestinationPolicyOptions {
  /**
   * Allow private destinations (development / self-hosted receivers). Set via
   * `WEBHOOK_ALLOW_PRIVATE_DESTINATIONS=true`.
   */
  allowPrivate?: boolean;
  /** Injectable resolver for tests. Defaults to `dns.promises.lookup`. */
  resolve?: (hostname: string) => Promise<string[]>;
}

/** Default resolver: every A/AAAA record for the hostname. */
async function defaultResolve(hostname: string): Promise<string[]> {
  const records = await dns.promises.lookup(hostname, { all: true });
  return records.map((r) => r.address);
}

/**
 * Resolve `url`'s hostname and reject it when any resolved address is not
 * publicly routable. Literal-IP hosts are checked directly without a lookup.
 *
 * @throws UnsafeWebhookDestinationError
 */
export async function assertSafeWebhookDestination(
  url: string,
  options: DestinationPolicyOptions = {},
): Promise<string[]> {
  const parsed = new URL(url);
  const hostname = parsed.hostname.replace(/^\[|\]$/g, ''); // strip IPv6 brackets

  if (options.allowPrivate) {
    return [hostname];
  }

  if (net.isIP(hostname)) {
    if (isPrivateAddress(hostname)) {
      throw new UnsafeWebhookDestinationError(hostname, [hostname]);
    }
    return [hostname];
  }

  const resolve = options.resolve ?? defaultResolve;
  let addresses: string[];
  try {
    addresses = await resolve(hostname);
  } catch (error) {
    // A hostname that does not resolve is not a safe destination either.
    throw new UnsafeWebhookDestinationError(hostname, [
      `unresolvable: ${(error as Error).message}`,
    ]);
  }

  const unsafe = addresses.filter((addr) => isPrivateAddress(addr));
  if (unsafe.length > 0 || addresses.length === 0) {
    throw new UnsafeWebhookDestinationError(hostname, addresses);
  }
  return addresses;
}
