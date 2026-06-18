import logger from '../utils/logger';

const DEFAULT_MAX_SIZE = 10000;

export function generateFingerprint(eventId: string, contractAddress: string): string {
  return `${contractAddress}:${eventId}`;
}

export class NotificationDeduplicator {
  private readonly seen: Set<string>;
  private readonly maxSize: number;

  constructor(maxSize = DEFAULT_MAX_SIZE) {
    this.seen = new Set();
    this.maxSize = maxSize;
  }

  isDuplicate(fingerprint: string): boolean {
    return this.seen.has(fingerprint);
  }

  markSent(fingerprint: string): void {
    if (this.seen.size >= this.maxSize) {
      const oldest = this.seen.values().next().value as string;
      this.seen.delete(oldest);
      logger.warn('Notification deduplicator cache full, evicted oldest entry', {
        evicted: oldest,
        cacheSize: this.maxSize,
      });
    }
    this.seen.add(fingerprint);
  }

  size(): number {
    return this.seen.size;
  }
}
