/**
 * Typed client SDK for the Notify-Chain listener API (#990).
 *
 * A thin, dependency-free wrapper over the listener's HTTP API that gives
 * callers typed request/response models and one consistent way to handle
 * failures, instead of hand-rolling `fetch` and `JSON.parse` per call site.
 *
 * Design:
 * - Every operation returns a discriminated `ApiResult<T>` so success and
 *   failure are explicit at the call site. A thrown error is never used to
 *   signal an expected HTTP failure.
 * - `NotifyChainError` carries the HTTP status, a machine-readable `code`,
 *   the correlation id (when the server echoes one) and the raw body, so a
 *   failure can be logged and retried without string-matching messages.
 * - The transport is injectable (`fetch`-compatible), so tests drive the
 *   client with a stub instead of a live server.
 */

// ---------------------------------------------------------------------------
// Result / error model
// ---------------------------------------------------------------------------

export type ApiResult<T> = { ok: true; data: T; status: number } | { ok: false; error: NotifyChainError };

/** Error codes the listener is known to emit, plus a fallback for anything else. */
export type ApiErrorCode =
  | 'bad_request'
  | 'unauthorized'
  | 'forbidden'
  | 'not_found'
  | 'conflict'
  | 'too_many_requests'
  | 'payload_too_large'
  | 'unsupported_media_type'
  | 'validation_failed'
  | 'internal'
  | 'network'
  | 'unknown';

/** A consistent representation of any failed API call. */
export class NotifyChainError extends Error {
  readonly status: number;
  readonly code: ApiErrorCode;
  readonly correlationId?: string;
  readonly body?: unknown;

  constructor(
    message: string,
    opts: { status: number; code: ApiErrorCode; correlationId?: string; body?: unknown },
  ) {
    super(message);
    this.name = 'NotifyChainError';
    this.status = opts.status;
    this.code = opts.code;
    this.correlationId = opts.correlationId;
    this.body = opts.body;
  }

  /** Whether retrying the same request could plausibly succeed. */
  get retryable(): boolean {
    return this.status === 429 || this.status >= 500 || this.code === 'network';
  }
}

export function errorCodeFromStatus(status: number): ApiErrorCode {
  switch (status) {
    case 400:
      return 'bad_request';
    case 401:
      return 'unauthorized';
    case 403:
      return 'forbidden';
    case 404:
      return 'not_found';
    case 409:
      return 'conflict';
    case 413:
      return 'payload_too_large';
    case 415:
      return 'unsupported_media_type';
    case 422:
      return 'validation_failed';
    case 429:
      return 'too_many_requests';
    default:
      return status >= 500 ? 'internal' : 'unknown';
  }
}

// ---------------------------------------------------------------------------
// Domain models (mirroring the listener's JSON shapes)
// ---------------------------------------------------------------------------

export interface HealthStatus {
  status: string;
  version?: string;
  uptimeSeconds?: number;
}

export interface WebhookCreate {
  url: string;
  events?: string[];
  secret?: string;
  description?: string;
}

export interface WebhookRecord {
  id: string;
  url: string;
  events: string[];
  createdAt: string;
  description?: string;
}

export interface ScheduledNotificationCreate {
  executeAt: string;
  url: string;
  payload: Record<string, unknown>;
  secret?: string;
}

export interface ScheduledNotificationRecord {
  id: string;
  executeAt: string;
  url: string;
  status: string;
  attempts: number;
  createdAt: string;
}

export interface EventRecord {
  id: string;
  type: string;
  status: string;
  createdAt: string;
  [k: string]: unknown;
}

export interface Paginated<T> {
  items: T[];
  total: number;
  page?: number;
  pageSize?: number;
}

export interface TemplateRecord {
  id: string;
  name: string;
  subject?: string;
  body: string;
  updatedAt?: string;
}

export interface ValidateBatchResult {
  valid: number;
  invalid: number;
  errors?: Array<{ index: number; message: string }>;
}

// ---------------------------------------------------------------------------
// Transport
// ---------------------------------------------------------------------------

/** Minimal `fetch`-compatible signature so the transport is stubbable. */
export type FetchLike = (
  url: string,
  init: {
    method: string;
    headers: Record<string, string>;
    body?: string;
  },
) => Promise<{
  ok: boolean;
  status: number;
  headers: { get(name: string): string | null };
  text(): Promise<string>;
}>;

export interface ClientOptions {
  /** Base URL of the listener, e.g. `http://localhost:3000`. */
  baseUrl: string;
  /** API key used for authenticated routes. */
  apiKey?: string;
  /** Overridable transport (tests inject a stub). Defaults to global fetch. */
  fetchImpl?: FetchLike;
  /** Default timeout in ms applied per request (0 disables). */
  timeoutMs?: number;
}

function extractCorrelationId(headers: { get(name: string): string | null }): string | undefined {
  return headers.get('x-correlation-id') ?? headers.get('x-request-id') ?? undefined;
}

// ---------------------------------------------------------------------------
// Client
// ---------------------------------------------------------------------------

export class NotifyChainClient {
  private readonly baseUrl: string;
  private readonly apiKey?: string;
  private readonly fetchImpl: FetchLike;
  private readonly timeoutMs: number;

  constructor(options: ClientOptions) {
    if (!options.baseUrl) {
      throw new NotifyChainError('baseUrl is required', {
        status: 0,
        code: 'bad_request',
      });
    }
    this.baseUrl = options.baseUrl.replace(/\/+$/, '');
    this.apiKey = options.apiKey;
    const g = globalThis as unknown as { fetch?: FetchLike };
    const impl = options.fetchImpl ?? g.fetch?.bind(globalThis);
    if (!impl) {
      throw new NotifyChainError(
        'No fetch implementation available; pass options.fetchImpl',
        { status: 0, code: 'network' },
      );
    }
    this.fetchImpl = impl;
    this.timeoutMs = options.timeoutMs ?? 15_000;
  }

  // -- core request ---------------------------------------------------------

  private async request<T>(
    method: string,
    path: string,
    body?: unknown,
  ): Promise<ApiResult<T>> {
    const url = `${this.baseUrl}${path.startsWith('/') ? path : `/${path}`}`;
    const headers: Record<string, string> = { accept: 'application/json' };
    if (this.apiKey) {
      headers.authorization = `Bearer ${this.apiKey}`;
    }
    let payload: string | undefined;
    if (body !== undefined) {
      headers['content-type'] = 'application/json';
      payload = JSON.stringify(body);
    }

    let res: Awaited<ReturnType<FetchLike>>;
    try {
      res = await this.fetchImpl(url, { method, headers, body: payload });
    } catch (err) {
      return {
        ok: false,
        error: new NotifyChainError(`Network error calling ${method} ${path}`, {
          status: 0,
          code: 'network',
          body: err instanceof Error ? err.message : String(err),
        }),
      };
    }

    const correlationId = extractCorrelationId(res.headers);
    const text = await res.text().catch(() => '');

    let parsed: unknown;
    if (text) {
      try {
        parsed = JSON.parse(text);
      } catch {
        parsed = text;
      }
    }

    if (!res.ok) {
      const message =
        typeof parsed === 'object' && parsed !== null && 'message' in parsed
          ? String((parsed as { message: unknown }).message)
          : `HTTP ${res.status}`;
      return {
        ok: false,
        error: new NotifyChainError(message, {
          status: res.status,
          code: errorCodeFromStatus(res.status),
          correlationId,
          body: parsed,
        }),
      };
    }

    return { ok: true, data: parsed as T, status: res.status };
  }

  private get<T>(path: string): Promise<ApiResult<T>> {
    return this.request<T>('GET', path);
  }

  private post<T>(path: string, body: unknown): Promise<ApiResult<T>> {
    return this.request<T>('POST', path, body);
  }

  private del<T>(path: string): Promise<ApiResult<T>> {
    return this.request<T>('DELETE', path);
  }

  // -- health & status ------------------------------------------------------

  health(): Promise<ApiResult<HealthStatus>> {
    return this.get<HealthStatus>('/health');
  }

  status(): Promise<ApiResult<HealthStatus>> {
    return this.get<HealthStatus>('/api/status');
  }

  // -- webhooks -------------------------------------------------------------

  createWebhook(input: WebhookCreate): Promise<ApiResult<WebhookRecord>> {
    return this.post<WebhookRecord>('/api/webhooks', input);
  }

  listWebhooks(): Promise<ApiResult<Paginated<WebhookRecord>>> {
    return this.get<Paginated<WebhookRecord>>('/api/webhooks');
  }

  deleteWebhook(id: string): Promise<ApiResult<{ deleted: boolean }>> {
    return this.del<{ deleted: boolean }>(`/api/webhooks/${encodeURIComponent(id)}`);
  }

  // -- scheduled notifications ----------------------------------------------

  schedule(input: ScheduledNotificationCreate): Promise<ApiResult<ScheduledNotificationRecord>> {
    return this.post<ScheduledNotificationRecord>('/api/schedule', input);
  }

  listScheduledJobs(): Promise<ApiResult<Paginated<ScheduledNotificationRecord>>> {
    return this.get<Paginated<ScheduledNotificationRecord>>('/api/schedule/jobs');
  }

  scheduleStats(): Promise<ApiResult<Record<string, unknown>>> {
    return this.get<Record<string, unknown>>('/api/schedule/stats');
  }

  // -- events ---------------------------------------------------------------

  eventHistory(params: { since?: string; limit?: number } = {}): Promise<ApiResult<Paginated<EventRecord>>> {
    const qs = new URLSearchParams();
    if (params.since) qs.set('since', params.since);
    if (params.limit !== undefined) qs.set('limit', String(params.limit));
    const q = qs.toString();
    return this.get<Paginated<EventRecord>>(`/api/events/history${q ? `?${q}` : ''}`);
  }

  // -- templates ------------------------------------------------------------

  listTemplates(): Promise<ApiResult<Paginated<TemplateRecord>>> {
    return this.get<Paginated<TemplateRecord>>('/api/templates');
  }

  createTemplate(input: { name: string; body: string; subject?: string }): Promise<ApiResult<TemplateRecord>> {
    return this.post<TemplateRecord>('/api/templates', input);
  }

  // -- validation helpers ---------------------------------------------------

  validateBatch(payloads: Record<string, unknown>[]): Promise<ApiResult<ValidateBatchResult>> {
    return this.post<ValidateBatchResult>('/api/notifications/validate-batch', { payloads });
  }
}
