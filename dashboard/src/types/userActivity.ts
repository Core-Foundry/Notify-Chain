export type UserActivityAction =
  | 'subscription_created'
  | 'subscription_updated'
  | 'subscription_cancelled'
  | 'notification_preference_changed'
  | 'notification_muted'
  | 'notification_unmuted'
  | 'template_managed'
  | 'export_requested';

export interface UserActivityEvent {
  id: string;
  action: UserActivityAction;
  timestamp: number;
  summary: string;
  details?: string;
  resourceId?: string;
}

export interface UserActivityTimelineResponse {
  events: UserActivityEvent[];
  total: number;
}
