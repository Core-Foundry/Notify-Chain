/**
 * Manual mock for node-cache.
 * Used by Jest (via moduleNameMapper) when the real package is not installed.
 */

class NodeCache {
  private store: Map<string, any> = new Map();
  private listeners: Map<string, ((...args: any[]) => void)[]> = new Map();

  constructor(_options?: Record<string, any>) {}

  get<T>(key: string): T | undefined {
    return this.store.get(key) as T | undefined;
  }

  set(key: string, value: any, _ttl?: number): boolean {
    this.store.set(key, value);
    return true;
  }

  del(key: string | string[]): number {
    const keys = Array.isArray(key) ? key : [key];
    let count = 0;
    for (const k of keys) {
      if (this.store.delete(k)) count++;
    }
    return count;
  }

  has(key: string): boolean {
    return this.store.has(key);
  }

  flushAll(): void {
    this.store.clear();
  }

  getStats() {
    return { hits: 0, misses: 0, keys: this.store.size, ksize: 0, vsize: 0 };
  }

  on(event: string, callback: (...args: any[]) => void): this {
    const existing = this.listeners.get(event) ?? [];
    this.listeners.set(event, [...existing, callback]);
    return this;
  }
}

export default NodeCache;
