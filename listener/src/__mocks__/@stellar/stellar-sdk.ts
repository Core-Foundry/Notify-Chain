/**
 * Manual mock for @stellar/stellar-sdk.
 * Used by Jest (via moduleNameMapper) because the real package is not a
 * dependency of this package.
 *
 * The mock previously exposed `rpc`, `Contract`, `Keypair`, `Account` and
 * `Networks` only. Production code and tests also construct and inspect
 * `xdr.ScVal` values (topic entries, event values) and call `scValToNative`, so
 * without an `xdr` export every suite that builds an event threw
 * `Cannot read properties of undefined (reading 'ScVal')` before running.
 *
 * Fidelity note: instead of the real XDR enum objects, a ScVal's `switch()`
 * returns a plain tag string, and `ScValType.scvX()` returns the same string, so
 * the `switch (val.switch()) case xdr.ScValType.scvX():` dispatch used
 * throughout this codebase compares equal. This is a test double: it models the
 * dispatch contract, not the binary encoding.
 */

// ---------------------------------------------------------------------------
// Minimal xdr.ScVal stub
// Supports the ScVal types used in tests (scvSymbol, scvString, scvU32).
//
// The real SDK returns singleton objects from ScValType.scvSymbol() /
// ScValType.scvString() so that switch-case comparisons via `===` work.
// This mock replicates that using frozen singleton constants.
// ---------------------------------------------------------------------------

const SYMBOL_TYPE = Object.freeze({ name: 'scvSymbol' });
const STRING_TYPE = Object.freeze({ name: 'scvString' });
const U32_TYPE    = Object.freeze({ name: 'scvU32' });

type ScValTypeSingleton = typeof SYMBOL_TYPE | typeof STRING_TYPE | typeof U32_TYPE;

interface MockScVal {
  _type: ScValTypeSingleton;
  _value: string | number;
  switch: () => ScValTypeSingleton;
  sym: () => { toString: () => string };
  str: () => { toString: () => string };
  toXDR: (format: string) => string;
}

function makeScVal(type: ScValTypeSingleton, value: string | number): MockScVal {
  return {
    _type: type,
    _value: value,
    switch: () => type,
    sym: () => ({ toString: () => String(value) }),
    str: () => ({ toString: () => String(value) }),
    toXDR: (_fmt: string) => Buffer.from(String(value)).toString('base64'),
  };
}

export const xdr = {
  ScVal: {
    scvSymbol: (sym: string) => makeScVal(SYMBOL_TYPE, sym),
    scvString: (str: string) => makeScVal(STRING_TYPE, str),
    scvU32: (n: number) => makeScVal(U32_TYPE, n),
  },
  /**
   * ScValType singletons — same references as the constants above so that
   * `switch (val.switch()) { case xdr.ScValType.scvSymbol(): ... }` works.
   */
  ScValType: {
    scvSymbol: () => SYMBOL_TYPE,
    scvString: () => STRING_TYPE,
    scvU32:    () => U32_TYPE,
  },
};

/**
 * Converts a mock ScVal to a native JS value for use in formatScVal.
 */
export function scValToNative(val: any): any {
  if (val && val._type) {
    if (val._type === SYMBOL_TYPE || val._type === STRING_TYPE) {
      return String(val._value);
    }
    if (val._type === U32_TYPE) {
      return Number(val._value);
    }
  }
  throw new Error('scValToNative: unknown type');
}

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
  scValToNative,
  Contract,
  Keypair,
  Account,
  Networks,
};
/**
 * The ScVal variants this codebase dispatches on.
 */
const SC_VAL_KINDS = [
  'scvSymbol',
  'scvString',
  'scvU32',
  'scvI32',
  'scvU64',
  'scvI64',
  'scvVoid',
  'scvAddress',
] as const;

type ScValKind = (typeof SC_VAL_KINDS)[number];

/** Anything with a `toString()`; mirrors the XDR string/int wrappers. */
interface Stringable {
  toString(): string;
}

interface ScValMock {
  switch(): ScValKind;
  sym(): Stringable;
  str(): Stringable;
  u32(): number;
  i32(): number;
  u64(): Stringable;
  i64(): Stringable;
  address(): Stringable;
  toXDR(format?: string): string;
  toString(): string;
}

function stringable(value: string): Stringable {
  return { toString: () => value };
}

/**
 * Builds a ScVal double for `kind` carrying `value`.
 *
 * Every accessor is present so a caller that reaches for the "wrong" one (as
 * the real SDK would allow within a union) still gets a usable value instead of
 * a TypeError.
 */
function scVal(kind: ScValKind, value: string | number = ''): ScValMock {
  const text = String(value);
  return {
    switch: () => kind,
    sym: () => stringable(text),
    str: () => stringable(text),
    u32: () => Number(value),
    i32: () => Number(value),
    u64: () => stringable(text),
    i64: () => stringable(text),
    address: () => stringable(text),
    toXDR: (format?: string) =>
      format === 'base64'
        ? Buffer.from(text, 'utf8').toString('base64')
        : text,
    toString: () => text,
  };
}

const ScVal = {
  scvSymbol: (value: string) => scVal('scvSymbol', value),
  scvString: (value: string) => scVal('scvString', value),
  scvU32: (value: number) => scVal('scvU32', value),
  scvI32: (value: number) => scVal('scvI32', value),
  scvU64: (value: unknown = 0n) => scVal('scvU64', String(value)),
  scvI64: (value: unknown = 0n) => scVal('scvI64', String(value)),
  scvVoid: () => scVal('scvVoid'),
  scvAddress: (value: string) => scVal('scvAddress', value),
  fromXDR: (value: unknown) => value,
};

/**
 * Tag factories matching {@link ScValMock.switch}.
 *
 * Deliberately plain strings so `val.switch() === ScValType.scvSymbol()` holds,
 * which is how the codebase dispatches on a value's type.
 */
export const ScValType = SC_VAL_KINDS.reduce(
  (acc, kind) => {
    acc[kind] = () => kind;
    return acc;
  },
  {} as Record<ScValKind, () => ScValKind>
);

/** Minimal 64-bit unsigned integer wrapper. */
export class Uint64 {
  private readonly value: bigint;

  constructor(value: bigint | number | string) {
    this.value = BigInt(value);
  }

  toString(): string {
    return this.value.toString();
  }

  toBigInt(): bigint {
    return this.value;
  }
}

export const xdr = { ScVal, ScValType, Uint64 };

/**
 * Reduces a ScVal to a plain JS value.
 *
 * Handles both this mock's ScVals and the ad-hoc doubles used in tests (whose
 * `switch()` returns an object, e.g. `{ name: 'scvVoid' }`). Unknown shapes
 * resolve to `null` rather than throwing, so callers can format a value instead
 * of falling into their error path.
 */
export function scValToNative(val: unknown): unknown {
  const target = val as { switch?: () => unknown } | null | undefined;
  const tag = typeof target?.switch === 'function' ? target.switch() : undefined;
  const name = typeof tag === 'string' ? tag : (tag as { name?: string } | undefined)?.name;

  const accessors = val as Partial<Record<string, () => unknown>> | null | undefined;
  const read = (key: string): string | null => {
    const accessor = accessors?.[key];
    if (typeof accessor !== 'function') return null;
    const value = accessor();
    return value === undefined || value === null ? null : String(value);
  };

  switch (name) {
    case 'scvSymbol':
      return read('sym') ?? read('str');
    case 'scvString':
      return read('str') ?? read('sym');
    case 'scvU32':
      return Number(read('u32'));
    case 'scvI32':
      return Number(read('i32'));
    case 'scvU64':
      return read('u64');
    case 'scvI64':
      return read('i64');
    default:
      return null;
  }
}

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

const SCV_VOID = 'scvVoid';
const SCV_U64 = 'scvU64';
const SCV_I64 = 'scvI64';
const SCV_STRING = 'scvString';
const SCV_SYMBOL = 'scvSymbol';
const SCV_ADDRESS = 'scvAddress';

export const xdr = {
  ScValType: {
    scvVoid: () => SCV_VOID,
    scvU64: () => SCV_U64,
    scvI64: () => SCV_I64,
    scvString: () => SCV_STRING,
    scvSymbol: () => SCV_SYMBOL,
    scvAddress: () => SCV_ADDRESS,
  },
  ScVal: {
    scvSymbol: (val: string) => ({
      switch: () => SCV_SYMBOL,
      sym: () => ({ toString: () => val }),
    }),
    scvString: (val: string) => ({
      switch: () => SCV_STRING,
      str: () => ({ toString: () => val }),
    }),
    scvVoid: () => ({
      switch: () => SCV_VOID,
    }),
    scvU64: (val: any) => ({
      switch: () => SCV_U64,
      u64: () => val,
    }),
    scvI64: (val: any) => ({
      switch: () => SCV_I64,
      i64: () => val,
    }),
    scvAddress: (val: string) => ({
      switch: () => SCV_ADDRESS,
      address: () => ({ toString: () => val }),
    }),
  },
};

export const BASE_FEE = '100';

export const TransactionBuilder = jest.fn().mockImplementation(() => ({
  addOperation: jest.fn().mockReturnThis(),
  setTimeout: jest.fn().mockReturnThis(),
  build: jest.fn().mockReturnValue({ toXDR: jest.fn() }),
/**
 * Minimal ScVal stand-in. `switch()` returns the same discriminator that the
 * `ScValType` members produce, so `switch (val.switch())` in production code
 * resolves correctly under this mock.
 */
class MockScVal {
  private readonly kind: string;
  private readonly value: unknown;

  constructor(kind: string, value: unknown) {
    this.kind = kind;
    this.value = value;
  }

  switch(): string {
    return this.kind;
  }

  sym(): unknown {
    return this.value;
  }

  str(): unknown {
    return this.value;
  }

  u64(): unknown {
    return this.value;
  }

  i64(): unknown {
    return this.value;
  }

  toString(): string {
    return String(this.value);
  }
}

const scValKind = (kind: string) => (): string => kind;

export const ScValType = {
  scvBool: scValKind('scvBool'),
  scvVoid: scValKind('scvVoid'),
  scvU32: scValKind('scvU32'),
  scvI32: scValKind('scvI32'),
  scvU64: scValKind('scvU64'),
  scvI64: scValKind('scvI64'),
  scvTime: scValKind('scvTime'),
  scvString: scValKind('scvString'),
  scvSymbol: scValKind('scvSymbol'),
  scvAddress: scValKind('scvAddress'),
};

export const ScVal = {
  scvBool: (value: boolean) => new MockScVal('scvBool', value),
  scvVoid: () => new MockScVal('scvVoid', undefined),
  scvU32: (value: number) => new MockScVal('scvU32', value),
  scvI32: (value: number) => new MockScVal('scvI32', value),
  scvU64: (value: number) => new MockScVal('scvU64', value),
  scvI64: (value: number) => new MockScVal('scvI64', value),
  scvTime: (value: Date) => new MockScVal('scvTime', value),
  scvString: (value: string) => new MockScVal('scvString', value),
  scvSymbol: (value: string) => new MockScVal('scvSymbol', value),
  scvAddress: (value: string) => new MockScVal('scvAddress', value),
};

export const xdr = {
  ScVal,
  ScValType,
};

export const BASE_FEE = '100';

export const ScValType = {
  scvVoid: () => 'scvVoid',
  scvU32: () => 'scvU32',
  scvI32: () => 'scvI32',
  scvU64: () => 'scvU64',
  scvI64: () => 'scvI64',
  scvTimepoint: () => 'scvTimepoint',
  scvDuration: () => 'scvDuration',
  scvU128: () => 'scvU128',
  scvI128: () => 'scvI128',
  scvU256: () => 'scvU256',
  scvI256: () => 'scvI256',
  scvBytes: () => 'scvBytes',
  scvString: () => 'scvString',
  scvSymbol: () => 'scvSymbol',
  scvVec: () => 'scvVec',
  scvMap: () => 'scvMap',
  scvAddress: () => 'scvAddress',
  scvBool: () => 'scvBool',
};

export const xdr = {
  ScValType,
  ScVal: {
    scvSymbol: (val: string) => ({
      switch: () => ScValType.scvSymbol(),
      sym: () => ({ toString: () => val }),
      toString: () => val,
    }),
    scvString: (val: string) => ({
      switch: () => ScValType.scvString(),
      str: () => ({ toString: () => val }),
      toString: () => val,
    }),
    scvU32: (val: number) => ({
      switch: () => ScValType.scvU32(),
      u32: () => val,
      toString: () => String(val),
    }),
    scvI32: (val: number) => ({
      switch: () => ScValType.scvI32(),
      i32: () => val,
      toString: () => String(val),
    }),
    scvU64: (val: number | string | bigint) => ({
      switch: () => ScValType.scvU64(),
      u64: () => val,
      toString: () => String(val),
    }),
    scvI64: (val: number | string | bigint) => ({
      switch: () => ScValType.scvI64(),
      i64: () => val,
      toString: () => String(val),
    }),
    scvAddress: (val: string) => ({
      switch: () => ScValType.scvAddress(),
      address: () => ({ toString: () => val }),
      toString: () => val,
    }),
    scvVoid: () => ({
      switch: () => ScValType.scvVoid(),
      toString: () => '',
    }),
    scvBool: (val: boolean) => ({
      switch: () => ScValType.scvBool(),
      b: () => val,
      toString: () => String(val),
    }),
  },
};

export const scValToNative = (val: any) => {
  if (!val) return null;
  if (typeof val.switch === 'function') {
    const sw = val.switch();
    if (sw === ScValType.scvSymbol()) return val.sym().toString();
    if (sw === ScValType.scvString()) return val.str().toString();
    if (sw === ScValType.scvU32()) return val.u32();
    if (sw === ScValType.scvU64()) return val.u64();
    if (sw === ScValType.scvI64()) return val.i64();
    if (sw === ScValType.scvBool()) return val.b();
  }
  return val;
};

export const TransactionBuilder = jest.fn().mockImplementation(() => ({
  addOperation: jest.fn().mockReturnThis(),
  setTimeout: jest.fn().mockReturnThis(),
  build: jest.fn().mockReturnValue({}),
}));

export default {
  rpc,
  xdr,
  scValToNative,
  Contract,
  Keypair,
  Account,
  Networks,
  xdr,
  BASE_FEE,
  TransactionBuilder,
  xdr,
  scValToNative,
  xdr,
  scValToNative,
  BASE_FEE,
  TransactionBuilder,
};
