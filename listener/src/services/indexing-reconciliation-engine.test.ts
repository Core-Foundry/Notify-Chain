import type { GapAlertSink } from './indexing-reconciliation-engine';
import { IndexingReconciliationEngine } from './indexing-reconciliation-engine';

jest.mock('../utils/logger', () => ({
  __esModule: true,
  default: {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

// We keep this unit test fully isolated: no RPC calls, no SQLite.
describe('IndexingReconciliationEngine', () => {
  it('detects a missing on-chain event, logs it, and triggers an alert', async () => {
    const logger = (await import('../utils/logger')).default as any;

    const alertSink: GapAlertSink = {
      notify: jest.fn(async () => {}),
    };

    const engine = new IndexingReconciliationEngine({
      db: {} as any,
      rpcUrl: 'http://example.invalid',
      contractAddresses: ['C1'],
      alertSink,
      getNetworkTipLedger: async () => 103,
      fetchOnChainEvents: async () => [
        { contractAddress: 'C1', eventId: 'E1', ledger: 101, txHash: 'T1' },
        { contractAddress: 'C1', eventId: 'E2', ledger: 102, txHash: 'T2' },
        { contractAddress: 'C1', eventId: 'E3', ledger: 103, txHash: 'T3' },
      ],
      fetchIndexedEvents: async () => [
        { contractAddress: 'C1', eventId: 'E1', ledger: 101, txHash: 'T1' },
        // Missing E2 (ledger 102)
        { contractAddress: 'C1', eventId: 'E3', ledger: 103, txHash: 'T3' },
      ],
    });

    await engine.runOnce();

    expect(logger.error).toHaveBeenCalledWith(
      'Indexing gap detected',
      expect.objectContaining({
        contractAddress: 'C1',
        missingEvents: 1,
      })
    );
    expect(alertSink.notify).toHaveBeenCalledTimes(1);
    expect((alertSink.notify as jest.Mock).mock.calls[0][0]).toEqual(
      expect.objectContaining({
        contractAddress: 'C1',
        gaps: expect.objectContaining({
          missingEvents: [expect.objectContaining({ eventId: 'E2', ledger: 102 })],
          missingLedgers: [102],
        }),
      })
    );
  });
});
