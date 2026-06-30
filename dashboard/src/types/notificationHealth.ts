export interface ScheduleStatsResponse {
  pending: number;
  processing: number;
  completed: number;
  failed: number;
  overdue: number;
}

export interface HealthServiceStatus {
  status: 'ok' | 'error' | 'not_configured';
  latencyMs?: number;
  detail?: string;
}

export interface HealthResponse {
  status: 'ok' | 'degraded' | 'error';
  timestamp: string;
  services: {
    stellarRpc: HealthServiceStatus;
    discord: HealthServiceStatus;
    eventRegistry: { status: 'ok' | 'error' | 'not_configured'; eventCount: number };
  };
}

export interface NotificationAnalyticsSnapshot {
  totalRecorded: number;
  windowStart: number;
  windowEnd: number;
  overall: {
    total: number;
    success: number;
    failure: number;
    retry: number;
    skipped: number;
    successRate: number;
    averageDurationMs: number;
  };
  byType: Array<{
    notificationType: string;
    total: number;
    success: number;
    failure: number;
    successRate: number;
  }>;
  byContract: Array<{
    contractAddress: string;
    total: number;
    success: number;
    failure: number;
    successRate: number;
  }>;
  hourlyBuckets: Array<{
    bucketStart: number;
    total: number;
    success: number;
    failure: number;
    retry: number;
    skipped: number;
    averageDurationMs: number;
  }>;
  errorBreakdown: Record<string, number>;
}

export interface NotificationHealthData {
  scheduleStats: ScheduleStatsResponse | null;
  health: HealthResponse | null;
  analytics: NotificationAnalyticsSnapshot | null;
}
