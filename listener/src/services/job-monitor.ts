import logger from '../utils/logger';

export type JobStatus = 'running' | 'completed' | 'failed';

export interface JobRecord {
  jobId: string;
  jobName: string;
  status: JobStatus;
  startedAt: string;
  finishedAt?: string;
  durationMs?: number;
  error?: string;
  metadata?: Record<string, unknown>;
}

export interface JobMonitorSnapshot {
  activeCount: number;
  completedCount: number;
  failedCount: number;
  recentJobs: JobRecord[];
  recentFailures: JobRecord[];
}

const MAX_HISTORY = 200;
const MAX_FAILURES = 100;

/**
 * In-memory monitor for scheduled / background job execution status.
 * Records start/complete/fail so operators can inspect recent runs
 * and failed jobs without querying raw execution logs.
 */
export class JobMonitor {
  private active = new Map<string, JobRecord>();
  private history: JobRecord[] = [];
  private failures: JobRecord[] = [];

  startJob(jobId: string, jobName: string, metadata?: Record<string, unknown>): void {
    const record: JobRecord = {
      jobId,
      jobName,
      status: 'running',
      startedAt: new Date().toISOString(),
      metadata,
    };
    this.active.set(jobId, record);
    logger.debug('Job monitor: job started', { jobId, jobName });
  }

  completeJob(jobId: string, metadata?: Record<string, unknown>): void {
    const existing = this.active.get(jobId);
    if (!existing) {
      logger.warn('Job monitor: complete called for unknown job', { jobId });
      return;
    }

    const finishedAt = new Date().toISOString();
    const durationMs = Date.now() - Date.parse(existing.startedAt);
    const record: JobRecord = {
      ...existing,
      status: 'completed',
      finishedAt,
      durationMs,
      metadata: { ...existing.metadata, ...metadata },
    };

    this.active.delete(jobId);
    this.pushHistory(record);
    logger.debug('Job monitor: job completed', { jobId, durationMs });
  }

  failJob(jobId: string, error: string, metadata?: Record<string, unknown>): void {
    const existing = this.active.get(jobId) ?? {
      jobId,
      jobName: 'unknown',
      status: 'running' as JobStatus,
      startedAt: new Date().toISOString(),
    };

    const finishedAt = new Date().toISOString();
    const durationMs = Date.now() - Date.parse(existing.startedAt);
    const record: JobRecord = {
      ...existing,
      status: 'failed',
      finishedAt,
      durationMs,
      error,
      metadata: { ...existing.metadata, ...metadata },
    };

    this.active.delete(jobId);
    this.pushHistory(record);
    this.pushFailure(record);

    logger.error('Job monitor: job failed', {
      jobId,
      jobName: record.jobName,
      error,
      durationMs,
    });
  }

  getJob(jobId: string): JobRecord | undefined {
    return (
      this.active.get(jobId) ??
      this.history.find((j) => j.jobId === jobId) ??
      this.failures.find((j) => j.jobId === jobId)
    );
  }

  listRecentJobs(limit = 50): JobRecord[] {
    const active = Array.from(this.active.values());
    return [...active, ...this.history].slice(0, limit);
  }

  listFailures(limit = 50): JobRecord[] {
    return this.failures.slice(0, limit);
  }

  getSnapshot(): JobMonitorSnapshot {
    return {
      activeCount: this.active.size,
      completedCount: this.history.filter((j) => j.status === 'completed').length,
      failedCount: this.failures.length,
      recentJobs: this.listRecentJobs(25),
      recentFailures: this.listFailures(25),
    };
  }

  reset(): void {
    this.active.clear();
    this.history = [];
    this.failures = [];
  }

  private pushHistory(record: JobRecord): void {
    this.history.unshift(record);
    if (this.history.length > MAX_HISTORY) {
      this.history.length = MAX_HISTORY;
    }
  }

  private pushFailure(record: JobRecord): void {
    this.failures.unshift(record);
    if (this.failures.length > MAX_FAILURES) {
      this.failures.length = MAX_FAILURES;
    }
  }
}

let instance: JobMonitor | null = null;

export function getJobMonitor(): JobMonitor {
  if (!instance) {
    instance = new JobMonitor();
  }
  return instance;
}

export function resetJobMonitor(): void {
  if (instance) {
    instance.reset();
  }
  instance = null;
}
