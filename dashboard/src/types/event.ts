/**
 * Lifecycle status of a scheduled notification, derived from on-chain events.
 *
 * - `active`   – notification is scheduled and has not yet expired or been revoked.
 * - `expired`  – the notification's TTL elapsed and it was reaped on-chain
 *                (NotificationExpired event received).
 * - `revoked`  – the notification was explicitly revoked before its TTL elapsed
 *                (NotificationRevoked event received).
 *
 * Non-notification events (group lifecycle, admin, financial) carry `undefined`.
 */
export type NotificationStatus = 'active' | 'expired' | 'revoked';

/**
 * The set of event names that represent a notification status transition.
 * Receiving one of these events means the notification identified by
 * `relatedNotificationId` has moved to the corresponding `notificationStatus`.
 */
export const NOTIFICATION_STATUS_EVENTS: Record<string, NotificationStatus> = {
  notification_scheduled: 'active',
  notification_expired: 'expired',
  notification_revoked: 'revoked',
};

export interface BlockchainEvent {
  eventId: string;
  contractAddress: string;
  eventName: string | null;
  ledger: number;
  type: string;
  topic: string[];
  value: string;
  txHash?: string;
  receivedAt: number;
  /**
   * Lifecycle status of this notification. Populated for notification-category
   * events (`notification_scheduled`, `notification_expired`,
   * `notification_revoked`). Undefined for all other event types.
   */
  notificationStatus?: NotificationStatus;
  /**
   * For status-transition events (`notification_expired`, `notification_revoked`),
   * the `eventId` of the originating `notification_scheduled` event whose status
   * this event updates. Used by the cache-invalidation layer to patch the
   * matching cached entry in-place.
   */
  relatedNotificationId?: string;
  /** Whether the user has seen/read this notification. Default: false */
  read?: boolean;
}

export type NotificationStatus = 'all' | 'read' | 'unread';

export interface EventFilters {
  search: string;
  contractAddress: string;
  eventType: string;
  status: NotificationStatus;
  dateFrom: string; // ISO date string "YYYY-MM-DD" or ""
  dateTo: string;   // ISO date string "YYYY-MM-DD" or ""
}
