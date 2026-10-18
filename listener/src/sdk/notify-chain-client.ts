/**
 * NotifyChain Listener API — Typed Client SDK (#990)
 *
 * A lightweight TypeScript client that wraps common API operations and
 * exposes typed request and response models.  HTTP failures are
 * represented consistently through a single `NotifyChainApiError` class.
 *
 * @example
 * ```ts
 * import { NotifyChainClient } from './sdk/notify-chain-client';
 *
 * const client = new NotifyChainClient({
 *   baseUrl: 'http://localhost:8787',
 *   apiKey: 'nc_live_your_key_here',
 * });
 *
 * // Fetch events
 * const events = await client.getEvents({ limit: 50 });
 *
 * // Schedule a notification
 * await client.scheduleNotification({
 *   type: 'discord',
 *   payload: { message: 'Hello!' },
 * });
 * ```
 */

import type { ApiScope } from '../types/api-credential';

// ─── Response Types ──────────────────────────────────────────────────────────

export interface ApiSuccessResponse<T> {
  success: true;
  data: T;
  count?: number;
}

export interface ApiErrorResponse {
  success: false;
  error: {
    code: string;
    message: string;
    details?: unknown[];
  };
}

export type ApiResponse<T> = ApiSuccessResponse<T> | ApiErrorResponse;

export interface PaginatedResponse<T> {
  events: T[];
  pagination: {
    page: number;
    limit: number;
    totalPages: number;
    total: number;
    hasMore: boolean;
  };
}

// ─── Event Types ──────────────────────────────────────────────────────────────

export interface ChainEvent {
  id: string;
  contract: string;
  type: string;
  ledger: number;
  txHash: string;
  data: Record<string, unknown>;
  timestamp: string;
}

export interface GetEventsParams {
  limit?: number;
  cursor?: string;
  contractAddress?: string;
  eventType?: string;
  fromLedger?: number;
  toLedger?: number;
}

// ─── Notification Types ───────────────────────────────────────────────────────

export interface ScheduleNotificationRequest {
  type: string;
  payload: Record<string, unknown>;
  targetRecipient?: string;
  contractAddress?: string;
  eventId?: string;
  executeAt?: string;
  priority?: 'high' | 'medium' | 'low';
  maxRetries?: number;
  metadata?: Record<string, unknown>;
}

export interface ScheduledNotification {
  id: number;
  type: string;
  status: string;
  payload: Record<string, unknown>;
  createdAt: string;
  executeAt: string;
  attempts: number;
  maxRetries: number;
}

export interface CancelNotificationRequest {
  reason?: string;
}

// ─── Analytics / Stats Types ──────────────────────────────────────────────────

export interface AnalyticsSnapshot {
  totalRecorded: number;
  byType: Record<string, number>;
  byContract: Record<string, number>;
  hourly: Array<{ hour: string; count: number }>;
}

export interface ScheduleStats {
  total: number;
  pending: number;
  completed: number;
  failed: number;
  expired: number;
}

export interface ExecutionMetrics {
  totalExecuted: number;
  successRate: number;
  averageLatencyMs: number;
}

export interface RetryDistribution {
  totalRetries: number;
  distribution: Array<{ retries: number; count: number }>;
}

export interface QueueMetrics {
  pendingCount: number;
  processingCount: number;
  deadLetterCount: number;
}

export interface PendingJob {
  id: number;
  type: string;
  executeAt: string;
  priority: string;
  retryCount: number;
}

// ─── Usage Accounting Types (#989) ───────────────────────────────────────────

export interface ClientUsageSummary {
  clientId: string;
  clientName?: string;
  clientType: 'CREDENTIAL' | 'LEGACY_KEY' | 'IP' | 'ANONYMOUS';
  totalRequests: number;
  successfulRequests: number;
  clientErrorRequests: number;
  serverErrorRequests: number;
  totalResponseTimeMs: number;
  averageResponseTimeMs: number;
  endpoints: Record<string, number>;
  methods: Record<string, number>;
  firstSeen: string;
  lastSeen: string;
}

export interface UsageQueryParams {
  clientId?: string;
  since?: string;
  until?: string;
  limit?: number;
}

// ─── Template Types ──────────────────────────────────────────────────────────

export interface NotificationTemplate {
  id: string;
  name: string;
  type: string;
  body: string;
  channel?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateTemplateInput {
  id: string;
  name: string;
  type: string;
  body: string;
  channel?: string;
}

export interface UpdateTemplateInput {
  name?: string;
  body?: string;
  channel?: string;
}

// ─── Credential Types ─────────────────────────────────────────────────────────

export interface CreatedCredential {
  id: string;
  name: string;
  scopes: ApiScope[];
  keyPrefix: string;
  apiKey: string;
  createdAt: string;
}

export interface CreateCredentialInput {
  name: string;
  scopes: ApiScope[];
}

// ─── Health Types ─────────────────────────────────────────────────────────────

export interface HealthResponse {
  status: 'ok' | 'degraded' | 'error';
  version: string;
  timestamp: string;
  uptimeSeconds: number;
  network: string;
  services: Record<string, { status: string; latencyMs?: number; detail?: string }>;
}

// ─── Error Handling ────────────────────────────────────────────────────────────

export interface NotifyChainApiErrorOptions {
  status: number;
  code: string;
  message: string;
  details?: unknown[];
  requestId?: string;
}

export class NotifyChainApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: unknown[];
  readonly requestId?: string;

  constructor(opts: NotifyChainApiErrorOptions) {
    super(opts.message);
    this.name = 'NotifyChainApiError';
    this.status = opts.status;
    this.code = opts.code;
    this.details = opts.details;
    this.requestId = opts.requestId;
  }

  /** True for 4xx client errors */
  isClientError(): boolean {
    return this.status >= 400 && this.status < 500;
  }

  /** True for 5xx server errors */
  isServerError(): boolean {
    return this.status >= 500;
  }

  /** True for auth failures (401 / 403) */
  isAuthError(): boolean {
    return this.status === 401 || this.status === 403;
  }

  /** True for rate-limit (429) */
  isRateLimited(): boolean {
    return this.status === 429;
  }
}

// ─── Client Configuration ──────────────────────────────────────────────────────

export interface NotifyChainClientOptions {
  /** Base URL of the listener API, e.g. `http://localhost:8787` */
  baseUrl: string;
  /** API key sent as `X-API-Key` */
  apiKey?: string;
  /** Default request timeout in ms (default: 30 000) */
  timeoutMs?: number;
  /** Custom fetch implementation (defaults to global fetch) */
  fetchImpl?: typeof fetch;
  /** Extra headers applied to every request */
  defaultHeaders?: Record<string, string>;
}

// ─── Client Implementation ────────────────────────────────────────────────────

export class NotifyChainClient {
  private readonly baseUrl: string;
  private readonly apiKey?: string;
  private readonly timeoutMs: number;
  private readonly fetchFn: typeof fetch;
  private readonly defaultHeaders: Record<string, string>;

  constructor(options: NotifyChainClientOptions) {
    if (!options.baseUrl) {
      throw new Error('NotifyChainClient: baseUrl is required');
    }
    this.baseUrl = options.baseUrl.replace(/\/$/, '');
    this.apiKey = options.apiKey;
    this.timeoutMs = options.timeoutMs ?? 30_000;
    this.fetchFn = options.fetchImpl ?? fetch;
    this.defaultHeaders = {
      'Content-Type': 'application/json',
      ...options.defaultHeaders,
    };
  }

  // ── Core HTTP helper ──────────────────────────────────────────────────────

  private async request<T>(
    method: string,
    path: string,
    opts: { body?: unknown; params?: Record<string, string | number | undefined> } = {},
  ): Promise<T> {
    const url = new URL(this.baseUrl + path);
    if (opts.params) {
      for (const [key, value] of Object.entries(opts.params)) {
        if (value !== undefined && value !== null) {
          url.searchParams.set(key, String(value));
        }
      }
    }

    const headers: Record<string, string> = { ...this.defaultHeaders };
    if (this.apiKey) {
      headers['X-API-Key'] = this.apiKey;
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    let res: Response;
    try {
      res = await this.fetchFn(url.toString(), {
        method,
        headers,
        body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
        signal: controller.signal,
      });
    } catch (err) {
      clearTimeout(timeout);
      if (err instanceof Error && err.name === 'AbortError') {
        throw new NotifyChainApiError({
          status: 0,
          code: 'TIMEOUT',
          message: `Request timed out after ${this.timeoutMs}ms`,
        });
      }
      throw new NotifyChainApiError({
        status: 0,
        code: 'NETWORK_ERROR',
        message: err instanceof Error ? err.message : String(err),
      });
    }

    clearTimeout(timeout);

    // Read response body
    const text = await res.text();
    let body: unknown;
    try {
      body = text ? JSON.parse(text) : {};
    } catch {
      body = text;
    }

    if (!res.ok) {
      const errorBody = body as ApiErrorResponse;
      throw new NotifyChainApiError({
        status: res.status,
        code: errorBody?.error?.code ?? `HTTP_${res.status}`,
        message: errorBody?.error?.message ?? res.statusText,
        details: errorBody?.error?.details,
        requestId: res.headers.get('x-request-id') ?? undefined,
      });
    }

    // Extract data from success envelope
    const successBody = body as ApiSuccessResponse<T>;
    if (successBody && successBody.success === true) {
      return successBody.data;
    }

    // Non-envelope responses (e.g. health, raw payloads)
    return body as T;
  }

  // ── Events API ─────────────────────────────────────────────────────────────

  /**
   * Fetch blockchain events with optional filtering and pagination.
   */
  async getEvents(params: GetEventsParams = {}): Promise<PaginatedResponse<ChainEvent>> {
    return this.request<PaginatedResponse<ChainEvent>>('GET', '/api/events', {
      params: {
        limit: params.limit,
        cursor: params.cursor,
        contract: params.contractAddress,
        type: params.eventType,
        fromLedger: params.fromLedger,
        toLedger: params.toLedger,
      },
    });
  }

  /**
   * Fetch events within a specific ledger range.
   */
  async getEventsByLedgerRange(
    fromLedger: number,
    toLedger: number,
    limit?: number,
  ): Promise<PaginatedResponse<ChainEvent>> {
    return this.request('GET', '/api/events/history', {
      params: { fromLedger, toLedger, limit },
    });
  }

  // ── Notification API ──────────────────────────────────────────────────────

  /**
   * Schedule a new notification for delivery.
   */
  async scheduleNotification(
    input: ScheduleNotificationRequest,
  ): Promise<ScheduledNotification> {
    return this.request('POST', '/api/schedule', { body: input });
  }

  /**
   * Cancel a scheduled notification.
   */
  async cancelNotification(
    id: number,
    input: CancelNotificationRequest = {},
  ): Promise<ScheduledNotification> {
    return this.request('POST', `/api/notifications/${id}/cancel`, { body: input });
  }

  /**
   * Get details of a specific scheduled notification.
   */
  async getNotification(id: number): Promise<ScheduledNotification> {
    return this.request('GET', `/api/schedule/${id}`);
  }

  /**
   * Import notifications in bulk from JSON or CSV.
   */
  async importNotifications(
    records: ScheduleNotificationRequest[],
  ): Promise<{ imported: number; failed: number }> {
    return this.request('POST', '/api/notifications/import', { body: records });
  }

  // ── Stats / Analytics API ──────────────────────────────────────────────────

  /**
   * Get overall schedule statistics.
   */
  async getScheduleStats(): Promise<ScheduleStats> {
    return this.request('GET', '/api/schedule/stats');
  }

  /**
   * Get execution metrics.
   */
  async getExecutionMetrics(): Promise<ExecutionMetrics> {
    return this.request('GET', '/api/schedule/execution-metrics');
  }

  /**
   * Get retry distribution.
   */
  async getRetryDistribution(): Promise<RetryDistribution> {
    return this.request('GET', '/api/schedule/retry-distribution');
  }

  /**
   * Get retry statistics.
   */
  async getRetryStatistics(): Promise<unknown> {
    return this.request('GET', '/api/schedule/retry-statistics');
  }

  /**
   * Get pending jobs in the queue.
   */
  async getPendingJobs(limit?: number): Promise<{ count: number; jobs: PendingJob[] }> {
    return this.request('GET', '/api/schedule/queue', { params: { limit } });
  }

  /**
   * Get queue operational metrics.
   */
  async getQueueMetrics(): Promise<QueueMetrics> {
    return this.request('GET', '/api/schedule/queue/metrics');
  }

  /**
   * Get background job monitoring snapshot.
   */
  async getJobs(limit?: number): Promise<unknown> {
    return this.request('GET', '/api/schedule/jobs', { params: { limit } });
  }

  /**
   * Get analytics snapshot.
   */
  async getAnalytics(reset = false): Promise<AnalyticsSnapshot> {
    return this.request('GET', '/api/analytics', { params: { reset: reset ? 'true' : undefined } });
  }

  /**
   * Get analytics history.
   */
  async getAnalyticsHistory(limit?: number, since?: string): Promise<unknown> {
    return this.request('GET', '/api/analytics/history', { params: { limit, since } });
  }

  // ── Usage Accounting API (#989) ────────────────────────────────────────────

  /**
   * Get per-client usage summaries.
   */
  async getUsage(params: UsageQueryParams = {}): Promise<ClientUsageSummary[]> {
    return this.request('GET', '/api/usage', {
      params: {
        clientId: params.clientId,
        since: params.since,
        until: params.until,
        limit: params.limit,
      },
    });
  }

  // ── Template API ──────────────────────────────────────────────────────────

  /**
   * List all notification templates.
   */
  async listTemplates(): Promise<NotificationTemplate[]> {
    return this.request('GET', '/api/templates');
  }

  /**
   * Get a single template by ID.
   */
  async getTemplate(id: string): Promise<NotificationTemplate> {
    return this.request('GET', `/api/templates/${encodeURIComponent(id)}`);
  }

  /**
   * Create a new template.
   */
  async createTemplate(input: CreateTemplateInput): Promise<NotificationTemplate> {
    return this.request('POST', '/api/templates', { body: input });
  }

  /**
   * Update an existing template.
   */
  async updateTemplate(id: string, input: UpdateTemplateInput): Promise<NotificationTemplate> {
    return this.request('PUT', `/api/templates/${encodeURIComponent(id)}`, { body: input });
  }

  /**
   * Delete a template.
   */
  async deleteTemplate(id: string): Promise<{ deleted: boolean }> {
    return this.request('DELETE', `/api/templates/${encodeURIComponent(id)}`);
  }

  /**
   * Render a template with the given context variables.
   */
  async renderTemplate(
    id: string,
    context: Record<string, string>,
  ): Promise<unknown> {
    return this.request('POST', `/api/templates/${encodeURIComponent(id)}/render`, {
      body: context,
    });
  }

  // ── Credential API ─────────────────────────────────────────────────────────

  /**
   * Create a new scoped API credential.
   */
  async createCredential(
    input: CreateCredentialInput,
  ): Promise<CreatedCredential> {
    return this.request('POST', '/api/credentials', { body: input });
  }

  /**
   * List all active credentials.
   */
  async listCredentials(): Promise<unknown[]> {
    return this.request('GET', '/api/credentials');
  }

  /**
   * Revoke a credential by ID.
   */
  async revokeCredential(id: string): Promise<{ revoked: boolean }> {
    return this.request('DELETE', `/api/credentials/${encodeURIComponent(id)}`);
  }

  // ── Health API ─────────────────────────────────────────────────────────────

  /**
   * Get service health status.
   */
  async getHealth(): Promise<HealthResponse> {
    return this.request('GET', '/health');
  }

  /**
   * Get API version information.
   */
  async getApiVersion(): Promise<unknown> {
    return this.request('GET', '/api/version');
  }
}
