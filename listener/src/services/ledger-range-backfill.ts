import { BackfillConfig, ContractConfig } from '../types';
import {
  validateLedgerRange,
  type LedgerRange,
} from '../utils/ledger-range-validator';
import { EventDeduplicationService } from './event-deduplication-service';
import { DiscordNotificationService } from './discord-notification';
import {
  HistoricalBackfillService,
  type BackfillResult,
} from './historical-backfill-service';
import logger from '../utils/logger';

/** Raised when an operator supplies an unusable ledger window. */
export class InvalidLedgerRangeError extends Error {
  readonly issues: Array<{ field: string; message: string }>;

  constructor(message: string, issues: Array<{ field: string; message: string }> = []) {
    super(message);
    this.name = 'InvalidLedgerRangeError';
    this.issues = issues;
  }
}

export type LedgerRangeBackfillStatus = 'idle' | 'running' | 'completed' | 'failed';

export interface LedgerRangeBackfillState {
  status: LedgerRangeBackfillStatus;
  request?: LedgerRange;
  startedAt?: string;
  finishedAt?: string;
  /** Per-contract progress while the backfill is in flight. */
  progress?: BackfillResult['contractResults'];
  result?: BackfillResult;
  error?: string;
}

export interface LedgerRangeBackfillEvent {
  type: 'started' | 'progress' | 'completed' | 'failed';
  state: LedgerRangeBackfillState;
}

export interface LedgerRangeBackfillControllerOptions {
  rpcUrl: string;
  contractConfigs: ContractConfig[];
  backfillConfig: BackfillConfig;
  deduplicationService: EventDeduplicationService;
  discordService?: DiscordNotificationService | null;
  /** Maximum number of ledgers a single operation may cover. */
  maxLedgerRange?: number;
  /** Primarily for tests: override construction of the underlying runner. */
  serviceFactory?: (config: BackfillConfig) => Pick<HistoricalBackfillService, 'run'>;
}

/**
 * Controlled historical backfill over an explicit ledger window.
 *
 * The operation runs independently of the live polling loop: it never reads or
 * writes the live polling cursor/checkpoint (`polling_cursors`) in the
 * deduplication service. The only persistent records it creates are
 * `processed_events` rows written by the shared deduplication service, which
 * is also what prevents duplicate notifications on a repeated backfill.
 *
 * Progress is observable through {@link getState} and {@link subscribe}.
 */
export class LedgerRangeBackfillController {
  private readonly options: LedgerRangeBackfillControllerOptions;
  private state: LedgerRangeBackfillState = { status: 'idle' };
  private readonly listeners = new Set<(event: LedgerRangeBackfillEvent) => void>();
  private running = false;

  constructor(options: LedgerRangeBackfillControllerOptions) {
    this.options = options;
  }

  /** Validate an operator-supplied window without starting a backfill. */
  validate(startLedger: unknown, endLedger: unknown): LedgerRange {
    try {
      return validateLedgerRange(startLedger, endLedger, this.options.maxLedgerRange);
    } catch (error) {
      const issues =
        error && typeof error === 'object' && 'issues' in error
          ? ((error as { issues: Array<{ field: string; message: string }> }).issues ?? [])
          : [];
      throw new InvalidLedgerRangeError(
        error instanceof Error ? error.message : String(error),
        issues,
      );
    }
  }

  /** Subscribe to status changes. Returns an unsubscribe function. */
  subscribe(listener: (event: LedgerRangeBackfillEvent) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Snapshot of the current operation (safe to serialise to an API response). */
  getState(): LedgerRangeBackfillState {
    return { ...this.state };
  }

  isRunning(): boolean {
    return this.running;
  }

  /**
   * Run a backfill over the inclusive range [startLedger, endLedger].
   *
   * Invalid ranges are rejected before any RPC call or database write occurs.
   */
  async run(startLedger: unknown, endLedger: unknown): Promise<BackfillResult> {
    const range = this.validate(startLedger, endLedger);

    if (this.running) {
      throw new Error('A ledger range backfill is already running');
    }

    this.running = true;
    this.state = {
      status: 'running',
      request: range,
      startedAt: new Date().toISOString(),
    };
    this.emit('started');

    logger.info('Ledger range backfill started', {
      startLedger: range.startLedger,
      endLedger: range.endLedger,
      contracts: this.options.contractConfigs.length,
    });

    try {
      const service = this.createService(range);
      const result = await service.run();

      this.state = {
        ...this.state,
        status: 'completed',
        finishedAt: new Date().toISOString(),
        progress: result.contractResults,
        result,
      };
      this.emit('completed');
      return result;
    } catch (error) {
      this.state = {
        ...this.state,
        status: 'failed',
        finishedAt: new Date().toISOString(),
        error: error instanceof Error ? error.message : String(error),
      };
      this.emit('failed');
      throw error;
    } finally {
      this.running = false;
    }
  }

  private createService(range: LedgerRange): Pick<HistoricalBackfillService, 'run'> {
    const config: BackfillConfig = {
      ...this.options.backfillConfig,
      enabled: true,
      startLedger: range.startLedger,
      endLedger: range.endLedger,
    };

    if (this.options.serviceFactory) {
      return this.options.serviceFactory(config);
    }

    return new HistoricalBackfillService(
      this.options.rpcUrl,
      this.options.contractConfigs,
      config,
      this.options.deduplicationService,
      this.options.discordService ?? null,
    );
  }

  private emit(type: LedgerRangeBackfillEvent['type']): void {
    const event: LedgerRangeBackfillEvent = { type, state: this.getState() };
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch (error) {
        logger.warn('Ledger range backfill listener failed', { error });
      }
    }
  }
}
