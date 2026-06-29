export type ActivityType =
  | 'notification_sent'
  | 'notification_failed'
  | 'notification_retried'
  | 'contract_event_received'
  | 'preference_updated'
  | 'template_created'
  | 'template_updated'
  | 'webhook_received';

export interface ActivityEvent {
  id: string;
  type: ActivityType;
  timestamp: number;
  metadata: {
    // Common metadata
    [key: string]: unknown;
    // Notification-specific
    notificationId?: number;
    channel?: string;
    // Contract-specific
    contractAddress?: string;
    eventName?: string;
    // Preference-specific
    userId?: string;
    // Template-specific
    templateId?: string;
    // Webhook-specific
    webhookId?: string;
  };
  message: string;
  read: boolean;
}

export interface ActivityFeedResponse {
  events: ActivityEvent[];
  total: number;
  page: number;
  pageSize: number;
}
