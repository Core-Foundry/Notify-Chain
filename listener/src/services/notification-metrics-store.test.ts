import * as fs from 'fs';
import * as path from 'path';
import { Database } from '../database/database';
import { NotificationMetricsStore } from './notification-metrics-store';
import { NotificationAnalyticsAggregator } from './notification-analytics-aggregator';
import { NotificationType } from '../types/scheduled-notification';

jest.mock('../utils/logger', () => ({
  __esModule: true,
  default: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

describe('NotificationMetricsStore', () => {
  const dbPath = path.join(__dirname, '../../data/test-metrics-store.db');
  let db: Database;
  let store: NotificationMetricsStore;

  beforeEach(async () => {
    if (fs.existsSync(dbPath)) {
      fs.unlinkSync(dbPath);
    }
    db = new Database(dbPath);
    await db.initialize();
    store = new NotificationMetricsStore(db);
  });

  afterEach(async () => {
    await db.close();
    if (fs.existsSync(dbPath)) {
      fs.unlinkSync(dbPath);
    }
  });

  it('persists and retrieves summarized snapshots', async () => {
    const aggregator = new NotificationAnalyticsAggregator();
    aggregator.record({
      notificationType: NotificationType.DISCORD,
      outcome: 'success',
      durationMs: 120,
      timestamp: Date.now(),
    });

    const snapshot = aggregator.snapshot();
    const id = await store.saveSnapshot(snapshot);

    const history = await store.getHistory();
    expect(history).toHaveLength(1);
    expect(history[0].id).toBe(id);
    expect(history[0].snapshot.overall.success).toBe(1);
  });

  it('purges snapshots older than the retention window', async () => {
    const aggregator = new NotificationAnalyticsAggregator();
    const snapshot = aggregator.snapshot();

    await db.run(
      `INSERT INTO notification_metrics_snapshots (
        captured_at, window_start, window_end, total_recorded, snapshot_json
      ) VALUES (?, ?, ?, ?, ?)`,
      [
        '2020-01-01T00:00:00.000Z',
        snapshot.windowStart,
        snapshot.windowEnd,
        snapshot.totalRecorded,
        JSON.stringify(snapshot),
      ],
    );

    await store.saveSnapshot(snapshot);

    const deleted = await store.purgeOlderThan(30);
    expect(deleted).toBe(1);

    const history = await store.getHistory();
    expect(history).toHaveLength(1);
  });
});
