/**
 * NotifyChain Listener API — Typed Client SDK (#990)
 *
 * Public entry point.  Import from here for all SDK types and the client:
 *
 * ```ts
 * import { NotifyChainClient, NotifyChainApiError } from './sdk';
 * ```
 */

export {
  NotifyChainClient,
  NotifyChainApiError,
  type NotifyChainClientOptions,
  type NotifyChainApiErrorOptions,
  // Response types
  type ApiSuccessResponse,
  type ApiErrorResponse,
  type ApiResponse,
  type PaginatedResponse,
  // Event types
  type ChainEvent,
  type GetEventsParams,
  // Notification types
  type ScheduleNotificationRequest,
  type ScheduledNotification,
  type CancelNotificationRequest,
  // Analytics / Stats types
  type AnalyticsSnapshot,
  type ScheduleStats,
  type ExecutionMetrics,
  type RetryDistribution,
  type QueueMetrics,
  type PendingJob,
  // Usage accounting types
  type ClientUsageSummary,
  type UsageQueryParams,
  // Template types
  type NotificationTemplate,
  type CreateTemplateInput,
  type UpdateTemplateInput,
  // Credential types
  type CreatedCredential,
  type CreateCredentialInput,
  // Health types
  type HealthResponse,
} from './notify-chain-client';
