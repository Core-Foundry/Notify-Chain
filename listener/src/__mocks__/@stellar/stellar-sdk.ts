/**
 * Manual mock for @stellar/stellar-sdk.
 * Used by Jest (via moduleNameMapper) when the real package is not installed.
 */

// String constants used as ScValType enum stand-ins.
// Both ScValType.scvSymbol() and ScVal.scvSymbol(…).switch() return the same
// string so that switch/case identity comparisons inside event-utils.ts work.
const SCV_SYMBOL = 'scvSymbol';
const SCV_STRING = 'scvString';
const SCV_U32 = 'scvU32';
const SCV_VOID = 'scvVoid';

/**
 * Minimal xdr.ScVal stub supporting the types used by the test suite and
 * by getEventName() inside event-utils.ts.
 */
export const xdr = {
  ScVal: {
    scvSymbol: (value: string) => ({
      switch: () => SCV_SYMBOL,
      sym: () => ({ toString: () => value }),
      str: () => ({ toString: () => value }),
    }),
    scvString: (value: string) => ({
      switch: () => SCV_STRING,
      sym: () => ({ toString: () => value }),
      str: () => ({ toString: () => value }),
    }),
    scvU32: (value: number) => ({
      switch: () => SCV_U32,
      u32: () => value,
    }),
    scvVoid: () => ({
      switch: () => SCV_VOID,
    }),
  },
  ScValType: {
    scvSymbol: () => SCV_SYMBOL,
    scvString: () => SCV_STRING,
    scvU32: () => SCV_U32,
    scvVoid: () => SCV_VOID,
  },
};

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
  xdr,
  Contract,
  Keypair,
  Account,
  Networks,
};
