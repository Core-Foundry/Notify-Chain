import logger from '../utils/logger';

/**
 * Manages worker lifecycle and graceful shutdown.
 * Tracks active jobs and ensures they complete before shutdown.
 */
export class WorkerManager {
  private activeJobs: Set<string> = new Set();
  private isShuttingDown: boolean = false;
  private shutdownTimeout: NodeJS.Timeout | null = null;
  private readonly MAX_SHUTDOWN_WAIT_MS = 30000; // 30 seconds max wait

  /**
   * Registers the start of a job
   * Returns true if job was registered, false if shutdown is in progress
   */
  startJob(jobId: string): boolean {
    if (this.isShuttingDown) {
      logger.warn('Job rejected - worker is shutting down', { jobId });
      return false;
    }

    this.activeJobs.add(jobId);
    logger.debug('Job started', { jobId, activeJobs: this.activeJobs.size });
    return true;
  }

  /**
   * Marks a job as complete
   */
  completeJob(jobId: string): void {
    this.activeJobs.delete(jobId);
    logger.debug('Job completed', { jobId, activeJobs: this.activeJobs.size });
  }

  /**
   * Returns the number of currently active jobs
   */
  getActiveJobCount(): number {
    return this.activeJobs.size;
  }

  /**
   * Initiates graceful shutdown
   * Prevents new jobs from starting and waits for existing jobs to complete
   */
  async initiateGracefulShutdown(): Promise<void> {
    if (this.isShuttingDown) {
      logger.warn('Graceful shutdown already initiated');
      return;
    }

    this.isShuttingDown = true;
    logger.info('Initiating graceful shutdown', { activeJobs: this.activeJobs.size });

    // Wait for all active jobs to complete
    await this.waitForActiveJobs();

    logger.info('All jobs have completed - shutdown can proceed');
  }

  /**
   * Waits for all active jobs to complete
   * Times out after MAX_SHUTDOWN_WAIT_MS
   */
  private async waitForActiveJobs(): Promise<void> {
    return new Promise((resolve) => {
      // If no active jobs, resolve immediately
      if (this.activeJobs.size === 0) {
        logger.info('No active jobs - proceeding with shutdown');
        resolve();
        return;
      }

      // Set timeout for maximum wait
      this.shutdownTimeout = setTimeout(() => {
        logger.warn(
          'Shutdown timeout exceeded while waiting for jobs',
          { remainingJobs: this.activeJobs.size, jobs: Array.from(this.activeJobs) }
        );
        resolve();
      }, this.MAX_SHUTDOWN_WAIT_MS);

      // Check periodically if all jobs have completed
      const checkInterval = setInterval(() => {
        if (this.activeJobs.size === 0) {
          clearInterval(checkInterval);
          if (this.shutdownTimeout) {
            clearTimeout(this.shutdownTimeout);
            this.shutdownTimeout = null;
          }
          logger.info('All jobs completed during graceful shutdown');
          resolve();
        } else {
          logger.debug('Waiting for jobs to complete', {
            activeJobs: this.activeJobs.size,
            jobs: Array.from(this.activeJobs),
          });
        }
      }, 1000); // Check every second
    });
  }

  /**
   * Check if shutdown is in progress
   */
  isShutdownInProgress(): boolean {
    return this.isShuttingDown;
  }

  /**
   * Force shutdown and clear all job tracking
   */
  forceShutdown(): void {
    if (this.shutdownTimeout) {
      clearTimeout(this.shutdownTimeout);
      this.shutdownTimeout = null;
    }
    this.activeJobs.clear();
    this.isShuttingDown = false;
    logger.info('Worker manager force shutdown completed');
  }
}

// Global worker manager instance
let globalWorkerManager: WorkerManager | null = null;

export function getWorkerManager(): WorkerManager {
  if (!globalWorkerManager) {
    globalWorkerManager = new WorkerManager();
  }
  return globalWorkerManager;
}

export function resetWorkerManager(): void {
  if (globalWorkerManager) {
    globalWorkerManager.forceShutdown();
  }
  globalWorkerManager = null;
}
