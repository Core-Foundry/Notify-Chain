import logger from '../utils/logger';

export interface BackpressureConfig {
  /** Queue size threshold that triggers backpressure (default: 1000) */
  saturationThreshold?: number;
  /** Queue size threshold to resume normal processing (default: 500) */
  recoveryThreshold?: number;
  /** Time window for measuring queue growth rate (ms) */
  measurementWindowMs?: number;
  /** Maximum events per second under normal conditions (default: 100) */
  normalThroughputPerSec?: number;
  /** Maximum events per second under backpressure (default: 10) */
  backpressureThroughputPerSec?: number;
}

export interface BackpressureMetrics {
  isActive: boolean;
  queueSize: number;
  eventsProcessedInWindow: number;
  throughputPerSec: number;
  targetThroughputPerSec: number;
  activeSinceMs: number;
  totalBackpressureEvents: number;
}

/**
 * Backpressure controller to protect the system from overload
 * Detects queue saturation and gradually slows incoming processing
 */
export class BackpressureController {
  private readonly saturationThreshold: number;
  private readonly recoveryThreshold: number;
  private readonly measurementWindowMs: number;
  private readonly normalThroughputPerSec: number;
  private readonly backpressureThroughputPerSec: number;

  private isBackpressureActive: boolean = false;
  private backpressureStartTime: number = 0;
  private totalBackpressureEvents: number = 0;

  private processingTimestamps: number[] = [];
  private lastMetricsTime: number = Date.now();

  constructor(config?: BackpressureConfig) {
    this.saturationThreshold = config?.saturationThreshold ?? 1000;
    this.recoveryThreshold = config?.recoveryThreshold ?? 500;
    this.measurementWindowMs = config?.measurementWindowMs ?? 10_000;
    this.normalThroughputPerSec = config?.normalThroughputPerSec ?? 100;
    this.backpressureThroughputPerSec = config?.backpressureThroughputPerSec ?? 10;
  }

  /**
   * Check if the system should apply backpressure based on queue size
   */
  checkAndApplyBackpressure(queueSize: number): boolean {
    const now = Date.now();

    if (!this.isBackpressureActive && queueSize >= this.saturationThreshold) {
      this.activateBackpressure(queueSize);
      return true;
    }

    if (this.isBackpressureActive && queueSize <= this.recoveryThreshold) {
      this.deactivateBackpressure(queueSize);
      return true;
    }

    return this.isBackpressureActive;
  }

  /**
   * Calculate delay for processing based on backpressure state
   * Returns milliseconds to delay the next event processing
   */
  calculateProcessingDelay(): number {
    if (!this.isBackpressureActive) {
      return 0;
    }

    // Calculate target delay to achieve desired throughput
    const targetThroughputPerMs = this.backpressureThroughputPerSec / 1000;
    const delayMs = 1 / targetThroughputPerMs;

    return Math.ceil(delayMs);
  }

  /**
   * Record an event being processed
   */
  recordEventProcessing(): void {
    this.processingTimestamps.push(Date.now());

    // Clean up old timestamps outside measurement window
    const cutoffTime = Date.now() - this.measurementWindowMs;
    this.processingTimestamps = this.processingTimestamps.filter((ts) => ts >= cutoffTime);
  }

  /**
   * Get current metrics
   */
  getMetrics(currentQueueSize: number): BackpressureMetrics {
    const now = Date.now();
    const eventsInWindow = this.processingTimestamps.length;
    const timeElapsedMs = Math.min(now - this.lastMetricsTime, this.measurementWindowMs);
    const throughputPerSec = timeElapsedMs > 0 ? (eventsInWindow / timeElapsedMs) * 1000 : 0;
    const targetThroughput = this.isBackpressureActive
      ? this.backpressureThroughputPerSec
      : this.normalThroughputPerSec;

    return {
      isActive: this.isBackpressureActive,
      queueSize: currentQueueSize,
      eventsProcessedInWindow: eventsInWindow,
      throughputPerSec,
      targetThroughputPerSec: targetThroughput,
      activeSinceMs: this.isBackpressureActive ? now - this.backpressureStartTime : 0,
      totalBackpressureEvents: this.totalBackpressureEvents,
    };
  }

  /**
   * Check if backpressure is currently active
   */
  isActive(): boolean {
    return this.isBackpressureActive;
  }

  /**
   * Reset metrics
   */
  reset(): void {
    this.processingTimestamps = [];
    this.lastMetricsTime = Date.now();
    this.isBackpressureActive = false;
    this.backpressureStartTime = 0;
  }

  private activateBackpressure(queueSize: number): void {
    this.isBackpressureActive = true;
    this.backpressureStartTime = Date.now();
    this.totalBackpressureEvents++;

    logger.warn('Backpressure activated: queue saturation detected', {
      queueSize,
      threshold: this.saturationThreshold,
      targetThroughputPerSec: this.backpressureThroughputPerSec,
    });
  }

  private deactivateBackpressure(queueSize: number): void {
    const duration = Date.now() - this.backpressureStartTime;

    logger.info('Backpressure deactivated: queue recovered', {
      queueSize,
      threshold: this.recoveryThreshold,
      durationMs: duration,
      targetThroughputPerSec: this.normalThroughputPerSec,
    });

    this.isBackpressureActive = false;
    this.backpressureStartTime = 0;
  }
}
