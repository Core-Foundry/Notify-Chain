export type NotificationHistoryStatus = 'SUCCESS' | 'FAILED' | 'RETRY';

export interface NotificationHistoryRecord {
  id: number;
  scheduledNotificationId: number;
  executionAttempt: number;
  executionTime: string;
  status: NotificationHistoryStatus;
  errorMessage: string | null;
  responseDuration: number | null;
}

export interface NotificationHistoryResponse {
  records: NotificationHistoryRecord[];
  total: number;
  limit: number;
  offset: number;
  itemCount: number;
  totalPages: number;
  nextCursor?: string | null;
}

export interface NotificationHistoryQuery {
  limit?: number;
  offset?: number;
  status?: NotificationHistoryStatus | 'all';
  startDate?: string;
  endDate?: string;
}
