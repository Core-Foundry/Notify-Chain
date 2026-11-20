import {
  buildTransactionExplorerUrl,
  getEventExplorerUrl,
  isValidTransactionHash,
  normalizeExplorerNetwork,
} from './explorerLinks';

const HASH = 'a'.repeat(64);

describe('explorer links (#1152)', () => {
  it('builds a testnet transaction link using the configured network', () => {
    expect(buildTransactionExplorerUrl(HASH, 'TESTNET')).toBe(
      `https://testnet.stellar.expert/explorer/tx/${HASH}`,
    );
  });

  it('builds a mainnet transaction link', () => {
    expect(buildTransactionExplorerUrl(HASH, 'PUBLIC')).toBe(
      `https://stellar.expert/explorer/public/tx/${HASH}`,
    );
    expect(buildTransactionExplorerUrl(HASH, 'mainnet')).toContain('/explorer/public/tx/');
  });

  it('does not build a link for a missing or malformed hash', () => {
    expect(buildTransactionExplorerUrl(undefined, 'testnet')).toBeUndefined();
    expect(buildTransactionExplorerUrl('', 'testnet')).toBeUndefined();
    expect(buildTransactionExplorerUrl('not-a-hash', 'testnet')).toBeUndefined();
    expect(buildTransactionExplorerUrl('z'.repeat(64), 'testnet')).toBeUndefined();
  });

  it('trims whitespace around an otherwise valid hash', () => {
    expect(buildTransactionExplorerUrl(`  ${HASH}  `, 'testnet')).toBe(
      `https://testnet.stellar.expert/explorer/tx/${HASH}`,
    );
  });

  it('validates hashes independently', () => {
    expect(isValidTransactionHash(HASH)).toBe(true);
    expect(isValidTransactionHash(HASH.toUpperCase())).toBe(true);
    expect(isValidTransactionHash(42)).toBe(false);
  });

  it('normalises known network aliases and defaults to testnet', () => {
    expect(normalizeExplorerNetwork('pubnet')).toBe('mainnet');
    expect(normalizeExplorerNetwork('TESTNET')).toBe('testnet');
    expect(normalizeExplorerNetwork(undefined)).toBe('testnet');
    expect(normalizeExplorerNetwork('standalone')).toBe('testnet');
  });

  it('reads the hash from an event object', () => {
    expect(getEventExplorerUrl({ txHash: HASH }, 'testnet')).toContain(HASH);
    expect(getEventExplorerUrl({})).toBeUndefined();
    expect(getEventExplorerUrl(null)).toBeUndefined();
  });
});
