export interface NotificationTemplate {
  id: string;
  name: string;
  type: string;
  subject?: string;
  body: string;
  variables?: string[];
  metadata?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface CreateNotificationTemplateInput {
  id: string;
  name: string;
  type: string;
  subject?: string;
  body: string;
  variables?: string[];
  metadata?: Record<string, unknown>;
}

export interface UpdateNotificationTemplateInput {
  name?: string;
  type?: string;
  subject?: string;
  body?: string;
  variables?: string[];
  metadata?: Record<string, unknown>;
}
