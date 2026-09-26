/**
 * Manual mock for @stellar/stellar-sdk.
 * Used by Jest (via moduleNameMapper) when the real package is not installed.
 *
 * Only the parts that need stubbing for tests are overridden here.
 * Everything else (xdr, scValToNative, etc.) is re-exported from the real
 * package so tests that construct ScVal fixtures work correctly.
 */

// Re-export the real SDK's XDR and conversion utilities so ScVal fixture
// helpers in tests work without hitting a live RPC endpoint.
export {
  xdr,
  scValToNative,
} from '../../../node_modules/@stellar/stellar-sdk/lib/index.js';

export const rpc = {
  Server: jest.fn().mockImplementation(() => ({
    getHealth: jest.fn().mockResolvedValue({ status: 'healthy' }),
    getEvents: jest.fn().mockResolvedValue({ events: [] }),
  })),
};

export const Contract = jest.fn().mockImplementation(() => ({
  call: jest.fn(),
}));

export const Keypair = {
  random: jest.fn().mockReturnValue({
    publicKey: jest.fn().mockReturnValue('GABC1234'),
    secret: jest.fn().mockReturnValue('SECRET'),
  }),
};

export const Account = jest.fn().mockImplementation((publicKey: string, sequence: string) => ({
  publicKey: () => publicKey,
  sequence,
}));

export const Networks = {
  TESTNET: 'Test SDF Network ; September 2015',
  MAINNET: 'Public Global Stellar Network ; September 2015',
};

export default {
  rpc,
  Contract,
  Keypair,
  Account,
  Networks,
};
