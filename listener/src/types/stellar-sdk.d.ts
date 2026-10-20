declare module '@stellar/stellar-sdk' {
  export namespace rpc {
    export namespace Api {
      export type GetEventsResponse = any;
      export type GetEventsRequest = any;
      export type RawEvent = any;
      export type EventResponse = any;
      export type GetLatestLedgerResponse = any;
      export type SimulateTransactionResponse = any;
      export type Pagination = any;
      export type LedgerInfo = any;
    }
    export class Server {
      constructor(serverURL: string, opts?: any);
      getHealth(): Promise<any>;
      getLatestLedger(): Promise<any>;
      simulateTransaction(tx: any): Promise<any>;
      getAccount(address: string): Promise<any>;
      getEvents(request: any): Promise<any>;
      [key: string]: any;
    }
  }
  export namespace xdr {
    export class ScVal {
      static fromXDR(input: any, format?: string): any;
      static scvSymbol(val: any): any;
      static scvString(val: any): any;
      static scvMap(val: any): any;
      static scvU32(val: any): any;
      toXDR(format?: string): any;
      switch(): any;
      value(): any;
      u64(): any;
      i64(): any;
      str(): any;
      sym(): any;
      address(): any;
      [key: string]: any;
    }
    export const ScValType: any;
    export const ScMapEntry: any;
  }
  export class Contract {
    constructor(address: string);
    call(functionName: string, ...args: any[]): any;
    [key: string]: any;
  }
  export class Keypair {
    static random(): any;
    publicKey(): string;
    secret(): string;
    [key: string]: any;
  }
  export class Account {
    constructor(accountId: string, sequence: string);
    [key: string]: any;
  }
  export class TransactionBuilder {
    constructor(sourceAccount: any, opts?: any);
    addOperation(op: any): TransactionBuilder;
    setTimeout(timeout: number): TransactionBuilder;
    build(): any;
    [key: string]: any;
  }
  export const BASE_FEE: any;
  export function scValToNative(scVal: any): any;
  const sdk: any;
  export default sdk;
}
