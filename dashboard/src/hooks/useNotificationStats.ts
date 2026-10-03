import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { fetchScheduleStats, fetchAnalytics } from '../services/notificationHealthApi';
import type {
  ScheduleStatsResponse,
  NotificationAnalyticsSnapshot,
} from '../types/notificationHealth';

const POLL_INTERVAL_MS = 30_000;

export interface NotificationStats {
  delivered: number;
  pending: number;
  failed: number;
  /** Processing + overdue counts bundled for a secondary "in-flight" indicator */
  inFlight: number;
  successRate: number | null;
}

export interface UseNotificationStatsResult {
  stats: NotificationStats | null;
  isLoading: boolean;
  error: string | null;
  isMockData: boolean;
  lastRefreshedAt: number | null;
  refresh: () => void;
}

function deriveStats(
  schedule: ScheduleStatsResponse,
  analytics: NotificationAnalyticsSnapshot | null,
): NotificationStats {
  return {
    delivered: analytics?.overall.success ?? schedule.completed,
    pending: schedule.pending,
    failed: analytics?.overall.failure ?? schedule.failed,
    inFlight: schedule.processing + schedule.overdue,
    successRate: analytics ? analytics.overall.successRate : null,
  };
}

function mockStats(): NotificationStats {
  return {
    delivered: 1284,
    pending: 37,
    failed: 12,
    inFlight: 5,
    successRate: 0.99,
  };
}

export function useNotificationStats(healthUrl: string): UseNotificationStatsResult {
  const [stats, setStats] = useState<NotificationStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isMockData, setIsMockData] = useState(false);
  const [lastRefreshedAt, setLastRefreshedAt] = useState<number | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const load = useCallback(async () => {
    if (!mountedRef.current) return;
    setIsLoading(true);
    setError(null);

    try {
      const [scheduleResult, analyticsResult] = await Promise.allSettled([
        fetchScheduleStats(healthUrl),
        fetchAnalytics(healthUrl),
      ]);

      if (!mountedRef.current) return;

      if (scheduleResult.status === 'rejected') {
        // Without schedule stats we can't derive the core numbers — fall back to mock
        throw scheduleResult.reason;
      }

      const analytics =
        analyticsResult.status === 'fulfilled' ? analyticsResult.value : null;

      setStats(deriveStats(scheduleResult.value, analytics));
      setIsMockData(false);
      setLastRefreshedAt(Date.now());
    } catch {
      if (!mountedRef.current) return;
      setStats(mockStats());
      setIsMockData(true);
      setError('Health API unavailable — showing demo data.');
      setLastRefreshedAt(Date.now());
    } finally {
      if (mountedRef.current) setIsLoading(false);
    }
  }, [healthUrl]);

  useEffect(() => {
    load();
    const id = setInterval(load, POLL_INTERVAL_MS);
    return () => clearInterval(id);
  }, [load]);

  return useMemo(
    () => ({ stats, isLoading, error, isMockData, lastRefreshedAt, refresh: load }),
    [stats, isLoading, error, isMockData, lastRefreshedAt, load],
  );
}
