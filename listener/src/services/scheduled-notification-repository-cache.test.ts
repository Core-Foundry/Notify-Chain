import { Database, getDatabase } from '../database/database';
import { ScheduledNotificationRepository } from './scheduled-notification-repository';
import { NotificationStatsCache, resetStatsCache } from './notification-stats-cache';
import { NotificationType } from '../types/scheduled-notification';

describe('ScheduledNotificationRepository - Cache Integration', () => {
  let db: Database;
  let repository: ScheduledNotificationRepository;
  let statsCache: NotificationStatsCache;

  beforeAll(async () => {
    db = getDatabase(':memory:');
    await db.initialize();
  });

  beforeEach(() => {
    resetStatsCache();
    statsCache = new NotificationStatsCache(30, 10);
    repository = new ScheduledNotificationRepository(db, statsCache);
  });

  afterEach(async () => {
    // Clean up test data
    await db.run('DELETE FROM scheduled_notifications');
    statsCache.flush();
  });

  describe('getStats with caching', () => {
    it('should cache statistics on first call', async () => {
      const stats1 = await repository.getStats();
      const cacheStats = statsCache.getStats();

      expect(cacheStats.misses).toBe(1);
      expect(cacheStats.hits).toBe(0);
      expect(stats1.pending).toBeGreaterThanOrEqual(0);
      expect(stats1.completed).toBeGreaterThanOrEqual(0);
    });

    it('should return cached statistics on subsequent calls', async () => {
      // First call - cache miss
      await repository.getStats();
      
      // Second call - cache hit
      await repository.getStats();
      
      // Third call - cache hit
      await repository.getStats();

      const cacheStats = statsCache.getStats();
      expect(cacheStats.misses).toBe(1);
      expect(cacheStats.hits).toBe(2);
      expect(cacheStats.hitRate).toBeCloseTo(0.667, 2);
    });

    it('should invalidate cache after creating a notification', async () => {
      // First call - populate cache
      const stats1 = await repository.getStats();
      const initialPending = stats1.pending;

      // Create a notification - should invalidate cache
      await repository.create({
        payload: { message: 'test' },
        notificationType: NotificationType.DISCORD,
        targetRecipient: 'https://discord.com/webhook',
        executeAt: new Date(Date.now() + 60000),
      });

      // Cache should be invalidated
      expect(statsCache.has()).toBe(false);

      // Next call should be a cache miss and show the new notification
      const stats2 = await repository.getStats();
      expect(stats2.pending).toBe(initialPending + 1);

      const cacheStats = statsCache.getStats();
      expect(cacheStats.misses).toBe(2); // Original + after invalidation
      expect(cacheStats.hits).toBe(0);
    });

    it('should invalidate cache after marking notification as completed', async () => {
      // Create a notification
      const id = await repository.create({
        payload: { message: 'test' },
        notificationType: NotificationType.DISCORD,
        targetRecipient: 'https://discord.com/webhook',
        executeAt: new Date(Date.now() + 60000),
      });

      // Get stats to populate cache
      const stats1 = await repository.getStats();
      const initialPending = stats1.pending;
      const initialCompleted = stats1.completed;
      expect(statsCache.has()).toBe(true);

      // Mark as completed - should invalidate cache
      await repository.markAsCompleted(id);
      expect(statsCache.has()).toBe(false);

      // Next call should show updated stats
      const stats2 = await repository.getStats();
      expect(stats2.pending).toBe(initialPending - 1);
      expect(stats2.completed).toBe(initialCompleted + 1);
    });

    it('should measure performance improvement from caching', async () => {
      // Create some test data
      for (let i = 0; i < 10; i++) {
        await repository.create({
          payload: { message: `test-${i}` },
          notificationType: NotificationType.DISCORD,
          targetRecipient: 'https://discord.com/webhook',
          executeAt: new Date(Date.now() + 60000),
        });
      }

      // Measure time for uncached call
      const start1 = Date.now();
      await repository.getStats();
      const uncachedTime = Date.now() - start1;

      // Measure time for cached call
      const start2 = Date.now();
      await repository.getStats();
      const cachedTime = Date.now() - start2;

      // Cached call should be significantly faster
      expect(cachedTime).toBeLessThan(uncachedTime);
      
      // Log performance comparison
      console.log('Performance comparison:');
      console.log(`  Uncached call: ${uncachedTime}ms`);
      console.log(`  Cached call: ${cachedTime}ms`);
      console.log(`  Improvement: ${((1 - cachedTime / uncachedTime) * 100).toFixed(1)}%`);
    });

    it('should maintain accurate statistics with multiple operations', async () => {
      // Create 5 notifications
      const ids = [];
      for (let i = 0; i < 5; i++) {
        const id = await repository.create({
          payload: { message: `test-${i}` },
          notificationType: NotificationType.DISCORD,
          targetRecipient: 'https://discord.com/webhook',
          executeAt: new Date(Date.now() + 60000),
        });
        ids.push(id);
      }

      // Check initial stats
      let stats = await repository.getStats();
      const initialPending = stats.pending;
      const initialCompleted = stats.completed;
      expect(stats.pending).toBeGreaterThanOrEqual(5);

      // Complete 3 notifications
      for (let i = 0; i < 3; i++) {
        await repository.markAsCompleted(ids[i]);
      }

      // Check updated stats
      stats = await repository.getStats();
      expect(stats.pending).toBe(initialPending - 3);
      expect(stats.completed).toBe(initialCompleted + 3);
    });
  });

  describe('cache hit rate tracking', () => {
    it('should track high hit rate with frequent polling', async () => {
      // Simulate dashboard polling scenario
      for (let i = 0; i < 10; i++) {
        await repository.getStats();
      }

      const cacheStats = statsCache.getStats();
      expect(cacheStats.misses).toBe(1); // Only first call
      expect(cacheStats.hits).toBe(9); // Remaining 9 calls
      expect(cacheStats.hitRate).toBe(0.9);
    });

    it('should reset hit rate after cache invalidation', async () => {
      // Multiple cached calls
      await repository.getStats();
      await repository.getStats();
      await repository.getStats();

      // Invalidate
      await repository.create({
        payload: { message: 'test' },
        notificationType: NotificationType.DISCORD,
        targetRecipient: 'https://discord.com/webhook',
        executeAt: new Date(Date.now() + 60000),
      });

      // More calls after invalidation
      await repository.getStats();
      await repository.getStats();

      const cacheStats = statsCache.getStats();
      // 1 initial miss + 2 hits + 1 miss after invalidation + 1 hit = 2 misses, 3 hits
      expect(cacheStats.misses).toBe(2);
      expect(cacheStats.hits).toBe(3);
      expect(cacheStats.hitRate).toBe(0.6);
    });
  });
});
