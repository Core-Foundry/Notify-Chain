import { getStellarNetworkName } from '../config/stellarNetwork';

export type ExplorerNetwork = 'testnet' | 'mainnet';

const TRANSACTION_HASH_PATTERN = /^[a-fA-F0-9]{64}$/;

const EXPLORER_BASE_URLS: Record<ExplorerNetwork, string> = {
  testnet: 'https://testnet.stellar.expert/explorer',
  mainnet: 'https://stellar.expert/explorer/public',
};

/**
 * Stellar transaction hashes are 64 hexadecimal characters. Anything else
 * (including the placeholder hashes used by mock data) must never become a
 * link — a broken link is worse than no link at all.
 */
export function isValidTransactionHash(hash: unknown): hash is string {
  return typeof hash === 'string' && TRANSACTION_HASH_PATTERN.test(hash.trim());
}

/**
 * Normalise the configured network name to the two networks the explorer
 * supports. Unknown values fall back to testnet, which is the safe default
 * for a development dashboard.
 */
export function normalizeExplorerNetwork(network?: string | null): ExplorerNetwork {
  const value = (network ?? '').trim().toLowerCase();
  if (value === 'mainnet' || value === 'public' || value === 'pubnet') {
    return 'mainnet';
  }
  return 'testnet';
}

/** Base URL of the Stellar explorer for a network. */
export function getExplorerBaseUrl(network?: string | null): string {
  return EXPLORER_BASE_URLS[normalizeExplorerNetwork(network)];
}

/**
 * Build the explorer URL for a transaction hash on a given network.
 *
 * Returns `undefined` when the hash is missing or malformed so callers can
 * omit the link entirely instead of rendering a broken URL.
 */
export function buildTransactionExplorerUrl(
  txHash: unknown,
  network?: string | null,
): string | undefined {
  if (!isValidTransactionHash(txHash)) return undefined;
  const base = getExplorerBaseUrl(network ?? getStellarNetworkName());
  return `${base}/tx/${txHash.trim()}`;
}

/**
 * Convenience helper for event objects that carry an optional `txHash`.
 */
export function getEventExplorerUrl(
  event: { txHash?: string } | null | undefined,
  network?: string | null,
): string | undefined {
  return event?.txHash ? buildTransactionExplorerUrl(event.txHash, network) : undefined;
}

/** Attributes for safely opening an external explorer link in a new tab. */
export const EXTERNAL_LINK_PROPS = {
  target: '_blank',
  rel: 'noopener noreferrer',
} as const;
