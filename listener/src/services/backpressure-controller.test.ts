import { BackpressureController } from './backpressure-controller';

describe('BackpressureController', () => {
  let controller: BackpressureController;

  beforeEach(() => {
    controller = new BackpressureController({
      saturationThreshold: 100,
      recoveryThreshold: 50,
      normalThroughputPerSec: 100,
      backpressureThroughputPerSec: 10,
    });
  });

  describe('checkAndApplyBackpressure', () => {
    it('should activate backpressure when queue exceeds saturation threshold', () => {
      const isActive = controller.checkAndApplyBackpressure(101);
      expect(isActive).toBe(true);
      expect(controller.isActive()).toBe(true);
    });

    it('should not activate backpressure when queue is below saturation threshold', () => {
      const isActive = controller.checkAndApplyBackpressure(50);
      expect(isActive).toBe(false);
      expect(controller.isActive()).toBe(false);
    });

    it('should deactivate backpressure when queue drops below recovery threshold', () => {
      // First activate
      controller.checkAndApplyBackpressure(101);
      expect(controller.isActive()).toBe(true);

      // Then recover - checkAndApplyBackpressure returns true if state changed
      const stateChanged = controller.checkAndApplyBackpressure(49);
      expect(stateChanged).toBe(true);
      // After recovery, isActive() should be false
      expect(controller.isActive()).toBe(false);
    });

    it('should remain active when queue is between recovery and saturation thresholds', () => {
      // First activate
      controller.checkAndApplyBackpressure(101);
      expect(controller.isActive()).toBe(true);

      // Stay in between
      const isActive = controller.checkAndApplyBackpressure(75);
      expect(isActive).toBe(true);
      expect(controller.isActive()).toBe(true);
    });
  });

  describe('calculateProcessingDelay', () => {
    it('should return 0 delay when backpressure is inactive', () => {
      const delay = controller.calculateProcessingDelay();
      expect(delay).toBe(0);
    });

    it('should return positive delay when backpressure is active', () => {
      controller.checkAndApplyBackpressure(101);
      const delay = controller.calculateProcessingDelay();
      expect(delay).toBeGreaterThan(0);
    });

    it('should achieve target throughput under backpressure', () => {
      controller.checkAndApplyBackpressure(101);
      const delay = controller.calculateProcessingDelay();

      // With 10 events/sec, delay should be ~100ms per event
      // Allow some tolerance for rounding
      expect(delay).toBeGreaterThanOrEqual(90);
      expect(delay).toBeLessThanOrEqual(110);
    });
  });

  describe('recordEventProcessing', () => {
    it('should track event processing timestamps', () => {
      controller.recordEventProcessing();
      controller.recordEventProcessing();
      controller.recordEventProcessing();

      const metrics = controller.getMetrics(0);
      expect(metrics.eventsProcessedInWindow).toBe(3);
    });
  });

  describe('getMetrics', () => {
    it('should return correct metrics', () => {
      controller.checkAndApplyBackpressure(101);
      controller.recordEventProcessing();

      const metrics = controller.getMetrics(101);

      expect(metrics.isActive).toBe(true);
      expect(metrics.queueSize).toBe(101);
      expect(metrics.eventsProcessedInWindow).toBe(1);
      expect(metrics.targetThroughputPerSec).toBe(10);
      expect(metrics.totalBackpressureEvents).toBe(1);
    });

    it('should calculate correct target throughput based on state', () => {
      // Inactive state
      let metrics = controller.getMetrics(50);
      expect(metrics.targetThroughputPerSec).toBe(100);

      // Activate
      controller.checkAndApplyBackpressure(101);
      metrics = controller.getMetrics(101);
      expect(metrics.targetThroughputPerSec).toBe(10);
    });
  });

  describe('reset', () => {
    it('should clear all metrics', () => {
      controller.checkAndApplyBackpressure(101);
      controller.recordEventProcessing();

      controller.reset();

      const metrics = controller.getMetrics(0);
      expect(metrics.isActive).toBe(false);
      expect(metrics.eventsProcessedInWindow).toBe(0);
      expect(metrics.activeSinceMs).toBe(0);
    });
  });
});
