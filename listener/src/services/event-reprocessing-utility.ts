import * as StellarSDK from '@stellar/stellar-sdk';
import { ContractConfig } from '../types';
import logger from '../utils/logger';

export interface ReprocessingRange {
  /** Inclusive start ledger for replay */
  startLedger: number;
  /** Inclusive end ledger for replay (undefined = latest) */
  endLedger?: number;
}

export interface ReprocessingProgress {
  jobId: string;
  contractAddress: string;
  startLedger: number;
  endLedger: number | null;
  currentLedger: number;
  eventsProcessed: number;
  eventsSkipped: number;
  errors: number;
  status: 'running' | 'completed' | 'failed' | 'cancelled';
  startedAt: number;
  completedAt?: number;
  lastError?: string;
}

export type ReprocessHandler = (
  event: StellarSDK.rpc.Api.EventResponse,
  contractConfig: ContractConfig
) => Promise<void>;

export interface ReprocessingOptions {
  /** Events to fetch per RPC request (default: 100) */
  batchSize?: number;
  /** Delay between batches in ms to avoid rate limiting (default: 100) */
  batchDelayMs?: number;
}

const DEFAULTS: Required<ReprocessingOptions> = {
  batchSize: 100,
  batchDelayMs: 100,
};

export class EventReprocessingUtility {
  private readonly server: StellarSDK.rpc.Server;
  private readonly jobs: Map<string, ReprocessingProgress> = new Map();
  private readonly cancelledJobs: Set<string> = new Set();
  private readonly batchSize: number;
  private readonly batchDelayMs: number;

  constructor(rpcUrl: string, options?: ReprocessingOptions) {
    this.server = new StellarSDK.rpc.Server(rpcUrl);
    this.batchSize = options?.batchSize ?? DEFAULTS.batchSize;
    this.batchDelayMs = options?.batchDelayMs ?? DEFAULTS.batchDelayMs;
  }

  /**
   * Start a reprocessing job for `contractConfig` over `range`.
   * Returns the job ID immediately; progress is queryable via `getProgress`.
   */
  async reprocess(
    contractConfig: ContractConfig,
    range: ReprocessingRange,
    handler: ReprocessHandler,
    jobId?: string
  ): Promise<string> {
    const id = jobId ?? `reprocess-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    const progress: ReprocessingProgress = {
      jobId: id,
      contractAddress: contractConfig.address,
      startLedger: range.startLedger,
      endLedger: range.endLedger ?? null,
      currentLedger: range.startLedger,
      eventsProcessed: 0,
      eventsSkipped: 0,
      errors: 0,
      status: 'running',
      startedAt: Date.now(),
    };

    this.jobs.set(id, progress);

    logger.info('Event reprocessing job started', {
      jobId: id,
      contractAddress: contractConfig.address,
      startLedger: range.startLedger,
      endLedger: range.endLedger ?? 'latest',
    });

    // Run asynchronously so the caller gets the job ID immediately
    this.runJob(id, contractConfig, range, handler).catch((err) => {
      const job = this.jobs.get(id);
      if (job) {
        job.status = 'failed';
        job.completedAt = Date.now();
        job.lastError = err instanceof Error ? err.message : String(err);
        logger.error('Event reprocessing job failed', { jobId: id, error: job.lastError });
      }
    });

    return id;
  }

  /** Cancel a running job. Idempotent. */
  cancel(jobId: string): void {
    this.cancelledJobs.add(jobId);
    const job = this.jobs.get(jobId);
    if (job && job.status === 'running') {
      job.status = 'cancelled';
      job.completedAt = Date.now();
      logger.info('Event reprocessing job cancelled', { jobId });
    }
  }

  /** Get a snapshot of the progress for `jobId`. */
  getProgress(jobId: string): ReprocessingProgress | undefined {
    return this.jobs.get(jobId);
  }

  /** Get all jobs, optionally filtered by status. */
  listJobs(status?: ReprocessingProgress['status']): ReprocessingProgress[] {
    const all = [...this.jobs.values()];
    return status ? all.filter((j) => j.status === status) : all;
  }

  private async runJob(
    jobId: string,
    contractConfig: ContractConfig,
    range: ReprocessingRange,
    handler: ReprocessHandler
  ): Promise<void> {
    const job = this.jobs.get(jobId)!;
    let cursor: string | undefined;

    // Fetch the first page anchored at startLedger
    let isFirstBatch = true;

    while (!this.cancelledJobs.has(jobId)) {
      const request: StellarSDK.rpc.Api.GetEventsRequest = isFirstBatch
        ? {
            filters: [{ contractIds: [contractConfig.address], type: 'contract' }],
            startLedger: range.startLedger,
            limit: this.batchSize,
          }
        : {
            filters: [{ contractIds: [contractConfig.address], type: 'contract' }],
            cursor,
            limit: this.batchSize,
          };

      let response: StellarSDK.rpc.Api.GetEventsResponse;
      try {
        response = await this.server.getEvents(request);
      } catch (err) {
        job.errors++;
        job.lastError = err instanceof Error ? err.message : String(err);
        logger.error('Reprocessing batch fetch failed', { jobId, error: job.lastError });
        break;
      }

      isFirstBatch = false;
      const events = response.events ?? [];

      for (const event of events) {
        if (this.cancelledJobs.has(jobId)) break;

        // Stop if we've passed the requested end ledger
        if (range.endLedger !== undefined && event.ledger > range.endLedger) {
          job.status = 'completed';
          job.completedAt = Date.now();
          this.logCompletion(job);
          return;
        }

        job.currentLedger = event.ledger;

        try {
          await handler(event, contractConfig);
          job.eventsProcessed++;
        } catch (err) {
          job.errors++;
          job.eventsSkipped++;
          job.lastError = err instanceof Error ? err.message : String(err);
          logger.warn('Reprocessing handler error, skipping event', {
            jobId,
            eventId: event.id,
            error: job.lastError,
          });
        }
      }

      logger.info('Reprocessing batch complete', {
        jobId,
        batchSize: events.length,
        eventsProcessed: job.eventsProcessed,
        currentLedger: job.currentLedger,
      });

      // No more events
      if (!response.cursor || events.length < this.batchSize) {
        break;
      }

      cursor = response.cursor;

      if (this.batchDelayMs > 0) {
        await new Promise((r) => setTimeout(r, this.batchDelayMs));
      }
    }

    if (!this.cancelledJobs.has(jobId)) {
      job.status = 'completed';
      job.completedAt = Date.now();
      this.logCompletion(job);
    }
  }

  private logCompletion(job: ReprocessingProgress): void {
    logger.info('Event reprocessing job completed', {
      jobId: job.jobId,
      contractAddress: job.contractAddress,
      eventsProcessed: job.eventsProcessed,
      eventsSkipped: job.eventsSkipped,
      errors: job.errors,
      durationMs: (job.completedAt ?? Date.now()) - job.startedAt,
      finalLedger: job.currentLedger,
    });
  }
}
