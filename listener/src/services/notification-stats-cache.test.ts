import { NotificationStatsCache, getStatsCache, resetStatsCache, NotificationStats } from './notification-stats-cache';

describe('NotificationStatsCache', () => {
  let cache: NotificationStatsCache;

  beforeEach(() => {
    resetStatsCache();
    cache = new NotificationStatsCache(30, 10);
  });

  afterEach(() => {
    cache.flush();
  });

  describe('get and set', () => {
    it('should return undefined for cache miss', () => {
      const result = cache.get();
      expect(result).toBeUndefined();
    });

    it('should return cached value for cache hit', () => {
      const stats: NotificationStats = {
        pending: 5,
        processing: 2,
        completed: 10,
        failed: 1,
        overdue: 0,
        deadLetterQueue: 1,
      };

      cache.set(stats);
      const result = cache.get();

      expect(result).toEqual(stats);
    });

    it('should track cache hits and misses', () => {
      const stats: NotificationStats = {
        pending: 5,
        processing: 2,
        completed: 10,
        failed: 1,
        overdue: 0,
        deadLetterQueue: 1,
      };

      // First access - miss
      cache.get();
      let cacheStats = cache.getStats();
      expect(cacheStats.hits).toBe(0);
      expect(cacheStats.misses).toBe(1);
      expect(cacheStats.hitRate).toBe(0);

      // Set and second access - hit
      cache.set(stats);
      cache.get();
      cacheStats = cache.getStats();
      expect(cacheStats.hits).toBe(1);
      expect(cacheStats.misses).toBe(1);
      expect(cacheStats.hitRate).toBe(0.5);

      // Third access - hit
      cache.get();
      cacheStats = cache.getStats();
      expect(cacheStats.hits).toBe(2);
      expect(cacheStats.misses).toBe(1);
      expect(cacheStats.hitRate).toBeCloseTo(0.667, 2);
    });

    it('should support custom TTL on set', () => {
      const stats: NotificationStats = {
        pending: 5,
        processing: 2,
        completed: 10,
        failed: 1,
        overdue: 0,
        deadLetterQueue: 1,
      };

      cache.set(stats, 60);
      const result = cache.get();

      expect(result).toEqual(stats);
    });
  });

  describe('getOrLoad', () => {
    it('should load from source on cache miss', async () => {
      const stats: NotificationStats = {
        pending: 5,
        processing: 2,
        completed: 10,
        failed: 1,
        overdue: 0,
        deadLetterQueue: 1,
      };

      const loader = jest.fn().mockResolvedValue(stats);

      const result = await cache.getOrLoad(loader);

      expect(result).toEqual(stats);
      expect(loader).toHaveBeenCalledTimes(1);
    });

    it('should return cached value without calling loader on cache hit', async () => {
      const stats: NotificationStats = {
        pending: 5,
        processing: 2,
        completed: 10,
        failed: 1,
        overdue: 0,
        deadLetterQueue: 1,
      };

      cache.set(stats);

      const loader = jest.fn().mockResolvedValue(stats);
      const result = await cache.getOrLoad(loader);

      expect(result).toEqual(stats);
      expect(loader).not.toHaveBeenCalled();
    });

    it('should cache the loaded value for subsequent calls', async () => {
      const stats: NotificationStats = {
        pending: 5,
        processing: 2,
        completed: 10,
        failed: 1,
        overdue: 0,
        deadLetterQueue: 1,
      };

      const loader = jest.fn().mockResolvedValue(stats);

      // First call - cache miss, calls loader
      await cache.getOrLoad(loader);
      expect(loader).toHaveBeenCalledTimes(1);

      // Second call - cache hit, does not call loader
      await cache.getOrLoad(loader);
      expect(loader).toHaveBeenCalledTimes(1);

      // Third call - cache hit, does not call loader
      await cache.getOrLoad(loader);
      expect(loader).toHaveBeenCalledTimes(1);
    });
  });

  describe('invalidate', () => {
    it('should remove cached value', () => {
      const stats: NotificationStats = {
        pending: 5,
        processing: 2,
        completed: 10,
        failed: 1,
        overdue: 0,
        deadLetterQueue: 1,
      };

      cache.set(stats);
      expect(cache.has()).toBe(true);

      cache.invalidate();
      expect(cache.has()).toBe(false);
      expect(cache.get()).toBeUndefined();
    });

    it('should allow fresh data to be loaded after invalidation', async () => {
      const oldStats: NotificationStats = {
        pending: 5,
        processing: 2,
        completed: 10,
        failed: 1,
        overdue: 0,
        deadLetterQueue: 1,
      };

      const newStats: NotificationStats = {
        pending: 3,
        processing: 1,
        completed: 15,
        failed: 2,
        overdue: 0,
        deadLetterQueue: 2,
      };

      const loader = jest.fn().mockResolvedValueOnce(oldStats).mockResolvedValueOnce(newStats);

      // First load
      const result1 = await cache.getOrLoad(loader);
      expect(result1).toEqual(oldStats);

      // Invalidate
      cache.invalidate();

      // Second load should fetch new data
      const result2 = await cache.getOrLoad(loader);
      expect(result2).toEqual(newStats);
      expect(loader).toHaveBeenCalledTimes(2);
    });
  });

  describe('has', () => {
    it('should return false when cache is empty', () => {
      expect(cache.has()).toBe(false);
    });

    it('should return true when cache contains value', () => {
      const stats: NotificationStats = {
        pending: 5,
        processing: 2,
        completed: 10,
        failed: 1,
        overdue: 0,
        deadLetterQueue: 1,
      };

      cache.set(stats);
      expect(cache.has()).toBe(true);
    });

    it('should return false after invalidation', () => {
      const stats: NotificationStats = {
        pending: 5,
        processing: 2,
        completed: 10,
        failed: 1,
        overdue: 0,
        deadLetterQueue: 1,
      };

      cache.set(stats);
      cache.invalidate();
      expect(cache.has()).toBe(false);
    });
  });

  describe('resetStats', () => {
    it('should reset hit and miss counters', () => {
      const stats: NotificationStats = {
        pending: 5,
        processing: 2,
        completed: 10,
        failed: 1,
        overdue: 0,
        deadLetterQueue: 1,
      };

      cache.set(stats);
      cache.get(); // hit
      cache.invalidate();
      cache.get(); // miss

      let cacheStats = cache.getStats();
      expect(cacheStats.hits).toBe(1);
      expect(cacheStats.misses).toBe(1);

      cache.resetStats();

      cacheStats = cache.getStats();
      expect(cacheStats.hits).toBe(0);
      expect(cacheStats.misses).toBe(0);
      expect(cacheStats.hitRate).toBe(0);
    });
  });

  describe('flush', () => {
    it('should remove all cached entries', () => {
      const stats: NotificationStats = {
        pending: 5,
        processing: 2,
        completed: 10,
        failed: 1,
        overdue: 0,
        deadLetterQueue: 1,
      };

      cache.set(stats);
      expect(cache.has()).toBe(true);

      cache.flush();
      expect(cache.has()).toBe(false);
    });
  });

  describe('TTL expiration', () => {
    it('should expire cached entries after TTL', async () => {
      const shortTtlCache = new NotificationStatsCache(1, 1); // 1 second TTL

      const stats: NotificationStats = {
        pending: 5,
        processing: 2,
        completed: 10,
        failed: 1,
        overdue: 0,
        deadLetterQueue: 1,
      };

      shortTtlCache.set(stats);
      expect(shortTtlCache.has()).toBe(true);

      // Wait for expiration (1.5 seconds to be safe)
      await new Promise((resolve) => setTimeout(resolve, 1500));

      expect(shortTtlCache.has()).toBe(false);
      expect(shortTtlCache.get()).toBeUndefined();

      shortTtlCache.flush();
    });
  });

  describe('singleton pattern', () => {
    afterEach(() => {
      resetStatsCache();
    });

    it('should return the same instance on multiple calls', () => {
      const instance1 = getStatsCache();
      const instance2 = getStatsCache();

      expect(instance1).toBe(instance2);
    });

    it('should use custom TTL on first call only', () => {
      const instance1 = getStatsCache(60);
      const instance2 = getStatsCache(120); // This should be ignored

      expect(instance1).toBe(instance2);
    });

    it('should reset singleton instance', () => {
      const instance1 = getStatsCache();
      resetStatsCache();
      const instance2 = getStatsCache();

      expect(instance1).not.toBe(instance2);
    });
  });

  describe('cache performance', () => {
    it('should provide accurate hit rate calculation', () => {
      const stats: NotificationStats = {
        pending: 5,
        processing: 2,
        completed: 10,
        failed: 1,
        overdue: 0,
        deadLetterQueue: 1,
      };

      cache.set(stats);

      // 5 hits
      for (let i = 0; i < 5; i++) {
        cache.get();
      }

      cache.invalidate();

      // 3 misses
      for (let i = 0; i < 3; i++) {
        cache.get();
      }

      const cacheStats = cache.getStats();
      expect(cacheStats.hits).toBe(5);
      expect(cacheStats.misses).toBe(3);
      expect(cacheStats.hitRate).toBeCloseTo(0.625, 3); // 5/8 = 0.625
    });
  });
});
