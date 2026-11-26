import {
  InvalidLedgerRangeError,
  LedgerRangeBackfillController,
} from './ledger-range-backfill';
import type { BackfillConfig } from '../types';
import { MAX_LEDGER_RANGE } from '../utils/ledger-range-validator';

const baseConfig: BackfillConfig = { enabled: true, maxPages: 5, maxEventsPerContract: 100 };

function makeController(runMock = jest.fn().mockResolvedValue({ totalEventsRecovered: 0 })) {
  const serviceFactory = jest.fn().mockReturnValue({ run: runMock });
  const controller = new LedgerRangeBackfillController({
    rpcUrl: 'http://rpc.invalid',
    contractConfigs: [],
    backfillConfig: baseConfig,
    deduplicationService: {} as any,
    serviceFactory,
  });
  return { controller, serviceFactory, runMock };
}

describe('LedgerRangeBackfillController (#1165)', () => {
  it('passes the explicit ledger window to the backfill service', async () => {
    const { controller, serviceFactory } = makeController();

    await controller.run(100, 200);

    expect(serviceFactory).toHaveBeenCalledWith(
      expect.objectContaining({ startLedger: 100, endLedger: 200 }),
    );
  });

  it('never writes to the live polling cursor', async () => {
    const deduplicationService = {
      updatePollingCursor: jest.fn(),
      getLastCursor: jest.fn(),
    } as any;
    const { controller } = (() => {
      const serviceFactory = jest.fn().mockReturnValue({
        run: jest.fn().mockResolvedValue({ totalEventsRecovered: 0 }),
      });
      return {
        controller: new LedgerRangeBackfillController({
          rpcUrl: 'http://rpc.invalid',
          contractConfigs: [],
          backfillConfig: baseConfig,
          deduplicationService,
          serviceFactory,
        }),
      };
    })();

    await controller.run(100, 200);

    expect(deduplicationService.updatePollingCursor).not.toHaveBeenCalled();
    expect(deduplicationService.getLastCursor).not.toHaveBeenCalled();
  });

  it('rejects inverted and non-integer ranges before starting', async () => {
    const { controller, serviceFactory } = makeController();

    await expect(controller.run(200, 100)).rejects.toBeInstanceOf(InvalidLedgerRangeError);
    await expect(controller.run(1.5, 10)).rejects.toBeInstanceOf(InvalidLedgerRangeError);
    await expect(controller.run(-1, 10)).rejects.toBeInstanceOf(InvalidLedgerRangeError);
    expect(serviceFactory).not.toHaveBeenCalled();
  });

  it('rejects ranges wider than the configured maximum', async () => {
    const { controller, serviceFactory } = makeController();

    await expect(controller.run(1, MAX_LEDGER_RANGE + 2)).rejects.toBeInstanceOf(
      InvalidLedgerRangeError,
    );
    expect(serviceFactory).not.toHaveBeenCalled();
  });

  it('exposes progress and notifies subscribers', async () => {
    const { controller } = makeController();
    const events: string[] = [];
    controller.subscribe((event) => events.push(event.type));

    await controller.run(100, 200);

    expect(events).toEqual(['started', 'completed']);
    expect(controller.getState().status).toBe('completed');
    expect(controller.getState().request).toEqual({ startLedger: 100, endLedger: 200 });
    expect(controller.isRunning()).toBe(false);
  });

  it('records a failure without leaving the controller busy', async () => {
    const { controller, runMock } = makeController(
      jest.fn().mockRejectedValue(new Error('RPC down')),
    );

    await expect(controller.run(100, 200)).rejects.toThrow('RPC down');
    expect(controller.getState().status).toBe('failed');
    expect(controller.getState().error).toBe('RPC down');
    expect(controller.isRunning()).toBe(false);
    expect(runMock).toHaveBeenCalledTimes(1);
  });
});
