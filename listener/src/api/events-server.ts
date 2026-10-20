import http from 'http';
import * as StellarSDK from '@stellar/stellar-sdk';
export { getAppVersion } from '../utils/app-version';
import { APP_VERSION } from '../utils/app-version';
import { eventRegistry } from '../store/event-registry';
import { preferenceStore } from '../store/preference-store';
import { PreferencesUpdateInput } from '../types/preferences';
import { NotificationAPI } from '../services/notification-api';
import { NotificationType } from '../types/scheduled-notification';
import {
  formatInTimezone,
  InvalidTimezoneError,
  parseExecuteAtWithTimezone,
} from '../utils/timezone';
import logger from '../utils/logger';
import { generateRequestId, resolveCorrelationId } from '../utils/request-id';
import { TemplateService } from '../services/template-service';
import { handleTemplateRoutes } from './template-routes';
import { sendOk, sendErr, sendJson, ErrorCode } from '../utils/response';
import { normalizePaginationParams } from '../utils/pagination';
import { handleApiError, ApiError } from './error-handler';
import { applyRequestIdMiddleware } from '../middleware/request-id';
import { TemplateService } from '../services/template-service';
import { handleTemplateRoutes } from './template-routes';
import { sendOk, sendErr, sendJson, ErrorCode } from '../utils/response';
import { validateContentType, getMimeType } from '../middleware/content-type';
import { NotificationHistoryService } from '../services/notification-history';
import { SearchSuggestionService } from '../services/search-suggestion';
import { NotificationSearchService } from '../services/notification-search-service';
import { collectRawBody, verifyWebhookRequest } from '../services/webhook-verifier';
import {
  IdempotencyKeyService,
  IdempotencyKeyReuseError,
} from '../services/idempotency-key-service';
import { WebhookReplayCache } from '../services/webhook-replay-cache';
import { IdempotencyKeyService, IdempotencyKeyReuseError } from '../services/idempotency-key-service';
import { WebhookSecret, RateLimitConfig, ContractConfig } from '../types';
import { RateLimiter } from './rate-limiter';
import {
  normaliseApiPath,
  applyVersionHeaders,
  buildVersionCatalog,
} from './api-version-registry';
import { getDatabase } from '../database/database';
import {
  getNotificationAnalyticsAggregator,
  NotificationAnalyticsAggregator,
} from '../services/notification-analytics-aggregator';
import { NotificationTemplateService } from '../services/notification-template-service';
import {
  TemplateNotFoundError,
  TemplateValidationError,
} from '../services/notification-template-repository';
import { TemplateRenderError } from '../services/notification-template-service';
import {
  parseTemplateUpdateBody,
  resolveRequestActor,
  serializeAuditRecord,
  serializeTemplate,
} from './template-api';
import { CreateNotificationTemplateInput } from '../types/notification-template';
import { BatchValidationService } from '../services/batch-validation-service';
import { handleArchiveRequest } from './archive-api';
import { handleDeliveryMetricsRequest } from './delivery-metrics-api';
import { ArchiveStore } from '../services/archive-store';
import { ArchiveService } from '../services/archive-service';
import { NotificationMetricsStore } from '../services/notification-metrics-store';
import { NotificationHealthMonitor } from '../services/notification-health-monitor';
import { getJobMonitor } from '../services/job-monitor';
import { NotificationImportService } from '../services/notification-import-service';
import { ResponseTimeMiddleware } from '../middleware/response-time';
import { addSecurityHeaders } from '../middleware/security-headers';
import { DEFAULT_MAX_BODY_BYTES, enforceBodyLimit } from '../middleware/body-limit';
import {
  DEFAULT_MAX_COMPRESSED_BYTES,
  DEFAULT_MAX_DECOMPRESSED_BYTES,
  applyDecompressionLimit,
} from '../middleware/decompression-limit';
import { sanitizeUrl } from '../utils/logger';
import { sanitizeCredentials } from '../utils/credential-sanitizer';
import { DiscordNotificationProvider } from '../services/providers/discord-provider';
import { WebhookNotificationProvider } from '../services/providers/webhook-provider';
import { ProviderHealthResult } from '../types/provider-capabilities';

export interface EventsServerOptions {
  port: number;
  corsOrigin?: string;
  isProduction?: boolean;
  stellarRpcUrl: string;
  stellarNetwork?: string;
  stellarNetworkPassphrase?: string;
  contractAddresses?: ContractConfig[];
  discordWebhookUrl?: string;
  webhookSecrets?: WebhookSecret[];
  apiKeys?: Array<{ key: string; name?: string }>;
  notificationAPI?: NotificationAPI | null;
  /** Idempotency-Key replay protection for mutating endpoints (webhooks, schedule). */
  idempotencyService?: IdempotencyKeyService | null;
  templateService?: NotificationTemplateService | null;
  /** Scheduler-scoped template service, used to render templates for scheduled notifications. */
  schedulerTemplateService?: TemplateService | null;
  rateLimit?: RateLimitConfig;
  /**
   * Optional override for the analytics aggregator. Tests use this to inject
   * a controlled instance and reset state between cases. When omitted, the
   * process-wide default aggregator is used.
   */
  analyticsAggregator?: NotificationAnalyticsAggregator | null;
  /** Archive store for retrieval endpoints (optional). */
  archiveStore?: ArchiveStore | null;
  /** Archive service for the admin /run endpoint (optional). */
  archiveService?: ArchiveService | null;
  /** Persisted metrics snapshots for historical analytics (optional). */
  metricsStore?: NotificationMetricsStore | null;
  /** Maximum age of signed requests in seconds (default: 300 = 5 minutes). */
  signatureExpirationSeconds?: number;
  /**
   * Require `X-Webhook-Timestamp` on inbound webhooks (default: true).
   * Without it a captured request is signed over the bare body and remains
   * valid forever. Set to false only for legacy senders that cannot be changed.
   */
  requireWebhookTimestamp?: boolean;
  /**
   * Maximum number of recently accepted webhook signatures retained by the
   * replay cache (default: 10000).
   */
  webhookReplayCacheMaxEntries?: number;
  /** Optional health monitor — exposes its last report at GET /api/notifications/health. */
  healthMonitor?: NotificationHealthMonitor | null;
  /** Receipt repository for the notification delivery status endpoint. */
  deliveryReceiptRepository?: DeliveryReceiptRepository | null;
  /**
   * Requests slower than this threshold (ms) are logged at WARN level (#491).
   * Defaults to 1 000 ms.
   */
  slowRequestThresholdMs?: number;
  /**
   * Override the ResponseTimeMiddleware instance — primarily for testing.
   * When omitted a new instance is created using `slowRequestThresholdMs`.
   */
  responseTimeMiddleware?: ResponseTimeMiddleware | null;
  /**
   * Largest request body accepted, in bytes. Oversized requests get a 413 and
   * are never parsed. Defaults to {@link DEFAULT_MAX_BODY_BYTES}.
   */
  maxBodyBytes?: number;
  /**
   * Largest *compressed* request body accepted when a `Content-Encoding` is
   * present, in bytes (issue #999). Defaults to
   * {@link DEFAULT_MAX_COMPRESSED_BYTES}.
   */
  maxCompressedBytes?: number;
  /**
   * Largest *decompressed* request body accepted when a `Content-Encoding` is
   * present, in bytes (issue #999). Bounds decompression bombs. Defaults to
   * {@link DEFAULT_MAX_DECOMPRESSED_BYTES}.
   */
  maxDecompressedBytes?: number;
  /** Optional DataExportService override for administrative exports (#850). */
  dataExportService?: DataExportService | null;
}

type ServiceStatus = 'ok' | 'error' | 'not_configured';

interface ServiceHealth {
  status: ServiceStatus;
  latencyMs?: number;
  detail?: string;
}

interface HealthResponse {
  status: 'ok' | 'degraded' | 'error';
  /** Semver string sourced from listener/package.json, e.g. "1.0.0". */
  version: string;
  timestamp: string;
  uptimeSeconds: number;
  network: string;
  services: {
    stellarRpc: ServiceHealth;
    discord: ServiceHealth;
    database: ServiceHealth;
    eventRegistry: { status: ServiceStatus; eventCount: number };
  };
}

const HEALTH_TIMEOUT_MS = 5000;
const NETWORK_TIP_CACHE_TTL_MS = 2000;

type IndexingStatus = 'synced' | 'syncing' | 'degraded';

interface IndexingHealthResponse {
  status: IndexingStatus;
  timestamp: string;
  indexedLedger: number | null;
  networkTipLedger: number | null;
  ledgerLag: number | null;
  /**
   * Time since the last event was ingested into the in-memory registry.
   * This serves as a lightweight proxy for ingestion latency / pipeline stalls.
   */
  processingDelayMs: number | null;
  lastIngestedAt: string | null;
  detail?: string;
}

let cachedNetworkTip: { fetchedAt: number; ledger: number | null; errorDetail?: string } | null =
  null;

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) => {
      const t = setTimeout(() => reject(new Error('Health check timed out')), ms);
      if (t && typeof (t as any).unref === 'function') (t as any).unref();
    }),
  ]);
}

export async function checkStellarRpc(rpcUrl: string): Promise<ServiceHealth> {
  const start = Date.now();
  try {
    const server = new StellarSDK.rpc.Server(rpcUrl);
    await withTimeout(server.getHealth(), HEALTH_TIMEOUT_MS);
    return { status: 'ok', latencyMs: Date.now() - start };
  } catch (err) {
    return {
      status: 'error',
      latencyMs: Date.now() - start,
      detail: err instanceof Error ? err.message : String(err),
    };
  }
}

export async function checkDiscord(webhookUrl: string): Promise<ServiceHealth> {
  const start = Date.now();
  try {
    const response = await withTimeout(fetch(webhookUrl, { method: 'GET' }), HEALTH_TIMEOUT_MS);
    if (response.ok) {
      return { status: 'ok', latencyMs: Date.now() - start };
    }
    return {
      status: 'error',
      latencyMs: Date.now() - start,
      detail: `HTTP ${response.status}`,
    };
  } catch (err) {
    return {
      status: 'error',
      latencyMs: Date.now() - start,
      detail: err instanceof Error ? err.message : String(err),
    };
  }
}

export async function checkDatabase(): Promise<ServiceHealth> {
  const start = Date.now();
  try {
    const db = getDatabase();
    if (!db.isConnected()) {
      return {
        status: 'error',
        latencyMs: Date.now() - start,
        detail: 'Database not initialized',
      };
    }
    await withTimeout(db.get('SELECT 1 AS ok'), HEALTH_TIMEOUT_MS);
    return { status: 'ok', latencyMs: Date.now() - start };
  } catch (err) {
    return {
      status: 'error',
      latencyMs: Date.now() - start,
      detail: err instanceof Error ? err.message : String(err),
    };
  }
}

async function getContractPauseStatus(
  contractAddress: string,
  stellarRpcUrl: string,
): Promise<{ paused: boolean; error?: string }> {
  try {
    const server = new StellarSDK.rpc.Server(stellarRpcUrl);
    const contract = new StellarSDK.Contract(contractAddress);

    // Create a dummy account for simulation (we don't need to actually sign anything)
    const dummyKeypair = StellarSDK.Keypair.random();
    const sourceAccount = await server.getAccount(dummyKeypair.publicKey()).catch(() => {
      // If the dummy account doesn't exist, we can still simulate
      return new StellarSDK.Account(dummyKeypair.publicKey(), '0');
    });

    const tx = new StellarSDK.TransactionBuilder(sourceAccount, {
      fee: StellarSDK.BASE_FEE,
      networkPassphrase: 'Test SDF Network ; September 2015', // We just need this for simulation
    })
      .addOperation(contract.call('get_paused_status'))
      .setTimeout(30)
      .build();

    const simulation = await server.simulateTransaction(tx);

    // Check if simulation was successful by looking for error property
    if ('error' in simulation && simulation.error) {
      const errorMsg =
        typeof simulation.error === 'object' && 'message' in simulation.error
          ? (simulation.error as any).message
          : 'Failed to simulate contract call';
      return {
        paused: false,
        error: errorMsg,
      };
    }

    // At this point, simulation is successful and has a result property
    const simResult = (simulation as any).result;
    const value = StellarSDK.scValToNative(simResult.retval);
    return { paused: !!value };
  } catch (err) {
    return {
      paused: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

async function buildStatusResponse(options: EventsServerOptions): Promise<{
  contracts: Array<{
    address: string;
    paused: boolean;
    error?: string;
  }>;
  timestamp: string;
}> {
  const contractStatuses = await Promise.all(
    (options.contractAddresses ?? []).map(async (contractConfig) => {
      const status = await getContractPauseStatus(contractConfig.address, options.stellarRpcUrl);
      return {
        address: contractConfig.address,
        ...status,
      };
    }),
  );

  return {
    timestamp: new Date().toISOString(),
    contracts: contractStatuses,
  };
}

async function fetchNetworkTipLedger(rpcUrl: string): Promise<{
  ledger: number | null;
  errorDetail?: string;
}> {
  if (cachedNetworkTip && Date.now() - cachedNetworkTip.fetchedAt < NETWORK_TIP_CACHE_TTL_MS) {
    return { ledger: cachedNetworkTip.ledger, errorDetail: cachedNetworkTip.errorDetail };
  }

  const start = Date.now();
  try {
    const server = new StellarSDK.rpc.Server(rpcUrl);

    // `getLatestLedger` is the most direct source of the current ledger/tip for Soroban RPC.
    // We keep extraction defensive to avoid hard-coupling to the SDK response shape.
    const latest: any = await withTimeout<any>(
      (server as any).getLatestLedger(),
      HEALTH_TIMEOUT_MS,
    );
    const ledger =
      typeof latest?.sequence === 'number'
        ? latest.sequence
        : typeof latest?.ledger === 'number'
          ? latest.ledger
          : typeof latest?.latestLedger === 'number'
            ? latest.latestLedger
            : null;

    cachedNetworkTip = { fetchedAt: Date.now(), ledger };
    return { ledger };
  } catch (err) {
    const errorDetail = err instanceof Error ? err.message : String(err);
    cachedNetworkTip = { fetchedAt: Date.now(), ledger: null, errorDetail };
    logger.warn('Failed to fetch network tip ledger', {
      rpcUrl,
      durationMs: Date.now() - start,
      errorDetail,
    });
    return { ledger: null, errorDetail };
  }
}

function deriveIndexingStatus(args: {
  indexedLedger: number | null;
  networkTipLedger: number | null;
  processingDelayMs: number | null;
}): { status: IndexingStatus; detail?: string } {
  const { indexedLedger, networkTipLedger, processingDelayMs } = args;

  if (networkTipLedger === null) {
    return { status: 'degraded', detail: 'Unable to resolve network tip ledger.' };
  }

  if (indexedLedger === null) {
    return { status: 'syncing', detail: 'No events ingested yet.' };
  }

  const ledgerLag = Math.max(0, networkTipLedger - indexedLedger);
  const delay = processingDelayMs ?? Number.POSITIVE_INFINITY;

  if (ledgerLag === 0 && delay <= 60_000) {
    return { status: 'synced' };
  }

  if (ledgerLag <= 5 && delay <= 5 * 60_000) {
    return { status: 'syncing', detail: `Behind by ${ledgerLag} ledger(s).` };
  }

  return {
    status: 'degraded',
    detail: `Behind by ${ledgerLag} ledger(s) and last ingestion was ${Math.round(
      delay / 1000,
    )}s ago.`,
  };
}

async function buildHealthResponse(options: EventsServerOptions): Promise<HealthResponse> {
  const [stellarRpc, discord, database] = await Promise.all([
    checkStellarRpc(options.stellarRpcUrl),
    options.discordWebhookUrl
      ? checkDiscord(options.discordWebhookUrl)
      : Promise.resolve<ServiceHealth>({ status: 'not_configured' }),
    checkDatabase(),
  ]);

  const eventRegistryHealth = {
    status: 'ok' as ServiceStatus,
    eventCount: eventRegistry.count(),
  };

  let overallStatus: HealthResponse['status'];
  if (stellarRpc.status === 'error' || database.status === 'error') {
    overallStatus = 'error';
  } else if (discord.status === 'error') {
    overallStatus = 'degraded';
  } else {
    overallStatus = 'ok';
  }

  return {
    status: overallStatus,
    version: APP_VERSION,
    timestamp: new Date().toISOString(),
    uptimeSeconds: process.uptime(),
    network: options.stellarNetwork ?? 'unknown',
    services: {
      stellarRpc,
      discord,
      database,
      eventRegistry: eventRegistryHealth,
    },
  };
}

function isRateLimitExempt(pathname: string): boolean {
  return pathname === '/health' || pathname === '/api/rate-limit/metrics';
}

export function createEventsServer(options: EventsServerOptions): http.Server {
  const corsOrigin = options.corsOrigin ?? 'http://localhost:5173';
  const historyService = new NotificationHistoryService();
  const suggestionService = new SearchSuggestionService();
  const notificationSearchService = new NotificationSearchService();
  const rateLimiter = options.rateLimit ? new RateLimiter(options.rateLimit) : undefined;
  // Replay protection (#853): remembers every signature we accepted inside the
  // freshness window so a captured request cannot be resubmitted. Kept
  // independent of the optional client-supplied `Idempotency-Key` header,
  // which an attacker replaying a request would simply omit.
  const webhookReplayCache = new WebhookReplayCache({
    maxEntries: options.webhookReplayCacheMaxEntries ?? 10_000,
  });
  // Response-time tracking (#491)
  const responseTime =
    options.responseTimeMiddleware !== undefined && options.responseTimeMiddleware !== null
      ? options.responseTimeMiddleware
      : new ResponseTimeMiddleware({ slowRequestThresholdMs: options.slowRequestThresholdMs });

  const server = http.createServer(async (req, res) => {
    addSecurityHeaders(res, {
      isProduction: options.isProduction ?? process.env.NODE_ENV === 'production',
    });

    // Request-ID middleware (#686): assigns (or validates+reuses) a requestId
    // and resolves a correlationId for every request, stamping both onto the
    // response headers. See listener/src/middleware/request-id.ts.
    const { requestId, correlationId } = applyRequestIdMiddleware(req, res);
    const startTime = Date.now();

    // Start response-time tracking for this request (#491)
    responseTime.start(res);

    // Request body size limit.
    //
    // Screened here, before routing, so an oversized payload is answered and
    // the socket destroyed before any route handler attaches its own `data`
    // listener and starts accumulating the body in memory.
    const maxBodyBytes = options.maxBodyBytes ?? DEFAULT_MAX_BODY_BYTES;
    const bodyLimit = enforceBodyLimit(req, res, {
      maxBytes: maxBodyBytes,
      onRejected: (reason, observedBytes) => {
        logger.warn('Request body exceeded size limit', {
          requestId,
          correlationId,
          method: req.method,
          url: sanitizeUrl(req.url ?? '/'),
          reason,
          observedBytes,
          maxBytes: maxBodyBytes,
        });
      },
    });
    if (!bodyLimit.allowed) {
      return;
    }

    // Compressed request body limits (#999).
    //
    // The body-size guard above bounds the bytes on the wire, but a
    // `Content-Encoding: gzip` body inflates in memory, so a small upload can
    // still exhaust the heap. This screens both the compressed and the inflated
    // size before any route handler reads the body, and refuses encodings we
    // cannot inflate. On success the decoded body is replayed to the handlers.
    const decompression = await applyDecompressionLimit(req, res, {
      maxCompressedBytes: options.maxCompressedBytes ?? DEFAULT_MAX_COMPRESSED_BYTES,
      maxDecompressedBytes: options.maxDecompressedBytes ?? DEFAULT_MAX_DECOMPRESSED_BYTES,
      onRejected: (reason, detail) => {
        logger.warn('Compressed request body rejected', {
          requestId,
          correlationId,
          method: req.method,
          url: sanitizeUrl(req.url ?? '/'),
          reason,
          ...detail,
        });
      },
    });
    if (decompression.rejected) {
      return;
    }

    res.setHeader('Access-Control-Allow-Origin', corsOrigin);
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader(
      'Access-Control-Allow-Headers',
      'Content-Type, X-API-Key, Authorization, X-Correlation-Id, X-Request-Id',
   );
    res.setHeader(
      'Access-Control-Expose-Headers',
      'X-Request-Id, X-Correlation-Id, X-Response-Time',
    );

    const url = new URL(req.url ?? '/', 'http://localhost');
    const pathname = url.pathname;

    // ── API Route Versioning (#386, #984) ──────────────────────────────────
    // Normalise /api/vN/* → /api/* using the central version registry so that
    // every route handler operates on the canonical path form.  The registry
    // also applies X-API-Version, Deprecation, Sunset, and Link headers
    // automatically based on the ROUTE_CATALOG lifecycle status.
    {
      const { normalisedPath } = normaliseApiPath(url.pathname);
      url.pathname = normalisedPath;
    }
    applyVersionHeaders(req.method ?? 'GET', url.pathname, res);

    // Standardize response Content-Type for all API responses (#647)
    if (req.method !== 'OPTIONS') {
      res.setHeader('Content-Type', 'application/json');
    }
    /**
     * Enforces X-API-Key auth for protected endpoints. Sends a 401 and returns
     * false when the request is not authenticated.
     */
    const requireApiKey = (): boolean => {
      const auth = authenticateApiKey(req, options.apiKeys);
      if (auth.authenticated) return true;
      logger.warn('API key authentication failed', {
        requestId,
        correlationId,
        method: req.method,
        path: url.pathname,
        reason: auth.reason,
      });
      res.setHeader('WWW-Authenticate', 'ApiKey header="X-API-Key"');
      sendErr(res, 401, API_KEY_AUTH_MESSAGES[auth.reason], ErrorCode.UNAUTHORIZED);
      return false;
    };

    // The rate-limit metrics endpoint is an observability route and must stay
    // reachable even after a client exhausts its quota — otherwise callers
    // can't read the very metrics that explain why they are being throttled.
    const isRateLimitExempt =
      req.method === 'GET' && (pathname === '/api/rate-limit/metrics' || pathname === '/health');

    if (rateLimiter && !isRateLimitExempt) {
      const allowed = await rateLimiter.handle(req, res as any);
      if (!allowed) return;
    }

    if (req.method === 'OPTIONS') {
      res.removeHeader('Content-Type');
import crypto from 'crypto';
import http from 'http';
import { DEFAULT_MAX_BODY_BYTES, enforceBodyLimit } from '../middleware/body-limit';
import { validateContentType } from '../middleware/content-type';
import { runWithRequestCorrelation } from '../middleware/correlation';
import { eventRegistry } from '../store/event-registry';
import { preferenceStore } from '../store/preference-store';
import { getDatabase } from '../database/database';
import logger from '../utils/logger';
import { sendJson, sendOk, sendErr, ErrorCode } from '../utils/response';
import { NotificationAnalyticsAggregator } from '../services/notification-analytics-aggregator';
import { applyVersionHeaders, normaliseApiPath } from './api-version-registry';

export interface EventsServerOptions {
  port?: number;
  isProduction?: boolean;
  stellarRpcUrl?: string;
  stellarNetwork?: string;
  stellarNetworkPassphrase?: string;
  contractAddresses?: Array<{ address: string; events?: string[]; userId?: string; paused?: boolean }>;
  discordWebhookUrl?: string;
  webhookSecrets?: Array<{ id: string; secret: string }>;
  analyticsAggregator?: NotificationAnalyticsAggregator;
  metricsStore?: { getHistory?: (limit?: number, since?: string) => Promise<unknown[]> };
  notificationAPI?: unknown;
  api?: { maxBodyBytes?: number };
}

export interface HealthServiceStatus {
  status: 'ok' | 'error' | 'degraded' | 'not_configured';
  detail?: string;
  latencyMs?: number;
  [key: string]: unknown;
}

export type HealthStatus = 'ok' | 'degraded' | 'error';

const DEFAULT_BODY_LIMIT = DEFAULT_MAX_BODY_BYTES;
const MAX_EVENT_LIMIT = 100;
const MAX_BATCH_SIZE = 500;

function normalizeContractEntry(contract: string | { address: string; events?: string[]; userId?: string; paused?: boolean }): { address: string } {
  if (typeof contract === 'string') {
    return { address: contract };
  }
  return { address: contract.address };
}

function parseQueryInt(raw: string | undefined, fallback: number, max: number): number {
  const parsed = Number.parseInt(raw ?? '', 10);
  if (!Number.isFinite(parsed)) return fallback;
  if (parsed < 1) return 1;
  return Math.min(parsed, max);
}

function isSuccessStatus(status: string | undefined): boolean {
  return status === 'ok';
}

export async function checkDatabase(): Promise<HealthServiceStatus> {
  const started = Date.now();
  try {
    const db = getDatabase();
    if (typeof (db as any).isConnected === 'function' && !(db as any).isConnected()) {
      return { status: 'error', detail: 'Database not initialized', latencyMs: Date.now() - started };
    }
    if (typeof (db as any).get === 'function') {
      await (db as any).get('SELECT 1');
    }
    return { status: 'ok', latencyMs: Date.now() - started };
  } catch (error) {
    return {
      status: 'error',
      detail: error instanceof Error ? error.message : 'Database unavailable',
      latencyMs: Date.now() - started,
    };
  }
}

export async function checkStellarRpc(rpcUrl: string): Promise<HealthServiceStatus> {
  const started = Date.now();
  try {
    const StellarSDK = await import('@stellar/stellar-sdk');
    const server = new (StellarSDK.rpc as any).Server(rpcUrl);
    const health = await server.getHealth();
    const status = health?.status === 'healthy' || health?.status === 'ok' ? 'ok' : 'error';
    return { status, latencyMs: Date.now() - started, detail: status === 'ok' ? undefined : String(health?.status ?? 'unhealthy') };
  } catch (error) {
    return {
      status: 'error',
      detail: error instanceof Error ? error.message : 'RPC unavailable',
      latencyMs: Date.now() - started,
    };
  }
}

export async function checkDiscord(webhookUrl?: string): Promise<HealthServiceStatus> {
  if (!webhookUrl) {
    return { status: 'not_configured' };
  }

  const started = Date.now();
  try {
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'healthcheck' }),
    });

    if (!response.ok) {
      return {
        status: 'error',
        detail: `HTTP ${response.status}`,
        latencyMs: Date.now() - started,
      };
    }

    return { status: 'ok', latencyMs: Date.now() - started };
  } catch (error) {
    return {
      status: 'error',
      detail: error instanceof Error ? error.message : 'Discord webhook unavailable',
      latencyMs: Date.now() - started,
    };
  }
}

function sendAccessibleHeaders(res: http.ServerResponse, isProduction: boolean = false): void {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Webhook-Signature, X-Webhook-Key-Id, X-Webhook-Timestamp, X-Correlation-Id, X-Request-Id');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  if (isProduction) {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000');
  }
}

async function readJsonBody(req: http.IncomingMessage): Promise<unknown> {
  return await new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8');
      if (!raw.trim()) {
        resolve(undefined);
        return;
      }
      try {
        resolve(JSON.parse(raw));
      } catch {
        reject(new Error('Invalid JSON'));
      }
    });
    req.on('error', reject);
  });
}

function statusFromServiceMap(services: Record<string, HealthServiceStatus>): HealthStatus {
  const values = Object.values(services);
  if (values.some((svc) => svc.status === 'error')) return 'error';
  if (values.some((svc) => svc.status === 'degraded' || svc.status === 'not_configured')) return 'degraded';
  return 'ok';
}

function signHmac(secret: string, payload: string): string {
  return `sha256=${crypto.createHmac('sha256', secret).update(payload, 'utf8').digest('hex')}`;
}

function verifyWebhookSignature(payload: string, signature: string, secret: string, timestamp?: string): { valid: boolean; code?: string; message?: string } {
  const provided = signature.trim();
  const headerTimestamp = timestamp?.trim();

  if (headerTimestamp) {
    const now = Math.floor(Date.now() / 1000);
    const ts = Number.parseInt(headerTimestamp, 10);
    if (!Number.isFinite(ts)) {
      return { valid: false, code: 'AUTH_INVALID_TIMESTAMP', message: 'Invalid timestamp header' };
    }
    if (Math.abs(now - ts) > 600) {
      return { valid: false, code: 'AUTH_TIMESTAMP_EXPIRED', message: 'Request signature expired' };
    }
    const expected = signHmac(secret, `${headerTimestamp}.${payload}`);
    if (provided !== expected) {
      return { valid: false, code: 'AUTH_INVALID_SIGNATURE', message: 'Invalid signature' };
    }
    return { valid: true };
  }

  const legacyExpected = signHmac(secret, payload);
  if (provided !== legacyExpected) {
    return { valid: false, code: 'AUTH_INVALID_SIGNATURE', message: 'Invalid signature' };
  }
  return { valid: true };
}

function validateBatch(body: unknown): { valid: boolean; processedCount: number; errors: Array<{ code: string; message: string; index?: number }> } {
  const items = Array.isArray(body) ? body : [];
  const errors: Array<{ code: string; message: string; index?: number }> = [];
  const recipients = new Set<string>();

  for (let index = 0; index < items.length; index++) {
    const item = items[index];
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      errors.push({ code: 'INVALID_ITEM', message: `Item at index ${index} is not an object` });
      continue;
    }

    const entry = item as Record<string, unknown>;
    const id = typeof entry.id === 'string' ? entry.id.trim() : '';
    const recipient = typeof entry.recipient === 'string' ? entry.recipient.trim() : '';
    const channel = typeof entry.channel === 'string' ? entry.channel.trim() : '';
    const message = typeof entry.message === 'string' ? entry.message.trim() : '';

    if (!id || !recipient || !channel || !message) {
      errors.push({ code: 'MISSING_FIELD', message: `Missing required fields for item ${index}`, index });
      continue;
    }

    if (recipients.has(recipient)) {
      errors.push({ code: 'DUPLICATE_RECIPIENT', message: `Duplicate recipient: ${recipient}`, index });
      continue;
    }
    recipients.add(recipient);
  }

  return {
    valid: errors.length === 0,
    processedCount: items.length,
    errors,
  };
}

export function createEventsServer(options: EventsServerOptions = {}): http.Server {
  const bodyLimitBytes = options.api?.maxBodyBytes ?? DEFAULT_BODY_LIMIT;
  const configContractAddresses = options.contractAddresses ?? [];
  const webhookSecrets = new Map((options.webhookSecrets ?? []).map((entry) => [entry.id, entry.secret]));
  const analyticsAggregator = options.analyticsAggregator ?? new NotificationAnalyticsAggregator();
  const metricsStore = options.metricsStore ?? null;
  const isProduction = options.isProduction ?? process.env.NODE_ENV === 'production';

  const handleRequest = async (req: http.IncomingMessage, res: http.ServerResponse): Promise<void> => {
    const url = new URL(req.url ?? '/', 'http://localhost');
    const { normalisedPath } = normaliseApiPath(url.pathname);
    const pathname = normalisedPath;
    sendAccessibleHeaders(res, isProduction);
    applyVersionHeaders(req.method ?? 'GET', pathname, res);

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    // Template API routes (handled first for priority)
    // Note: route matching is handled inline below for NotificationTemplateService compatibility.
    // url.pathname is already rewritten from /api/v1/* → /api/* above
    if (options.schedulerTemplateService && url.pathname.startsWith('/api/templates')) {
      handleTemplateRoutes(req, res, requestId, options.schedulerTemplateService)
        .then((handled) => {
          if (!handled) {
            sendErr(res, 404, 'Not found', ErrorCode.NOT_FOUND);
          }
        })
        .catch((error) => {
          logger.error('Template route handler error', { error, requestId, correlationId });
          handleApiError(res, error, requestId, correlationId);
        });
      return;
    }

    // GET /health
    if (req.method === 'GET' && url.pathname === '/health') {
      buildHealthResponse(options)
        .then((health) => {
          const httpStatus = health.status === 'error' ? 503 : 200;
          sendJson(res, httpStatus, health);
        })
        .catch((err) => {
          logger.error('Health check failed unexpectedly', {
            error: err,
            requestId,
            correlationId,
          });
          sendErr(res, 500, 'Internal health check failure', ErrorCode.INTERNAL_ERROR);
        });
      return;
    }

    // GET /api/status
    if (req.method === 'GET' && url.pathname === '/api/status') {
      buildStatusResponse(options)
        .then((status) => {
          sendOk(res, 200, status);
        })
        .catch((err) => {
          logger.error('Status check failed unexpectedly', {
            error: err,
            requestId,
            correlationId,
          });
          sendErr(res, 500, 'Internal status check failure', ErrorCode.INTERNAL_ERROR);
        });
      return;
    }

    // GET /api/events/history?fromLedger=<n>&toLedger=<n>
    //
    // Returns events from the in-process registry whose ledger number falls
    // within the requested inclusive range.  Both query parameters are
    // required; the range must be well-formed and must not exceed
    // MAX_LEDGER_RANGE (10 000) ledgers.
    if (req.method === 'GET' && url.pathname === '/api/events/history') {
      const fromParam = url.searchParams.get('fromLedger');
      const toParam = url.searchParams.get('toLedger');

      let range: { startLedger: number; endLedger: number };
      try {
        range = parseLedgerRangeParams(fromParam, toParam);
      } catch (err) {
        if (err instanceof ValidationError) {
          sendErr(res, 400, 'Invalid ledger range', ErrorCode.BAD_REQUEST, validationErrorBody(err));
        } else {
          sendErr(res, 400, 'Invalid ledger range', ErrorCode.BAD_REQUEST);
        }
        return;
      }

      const events = eventRegistry.getEventsByLedgerRange(range.startLedger, range.endLedger);

      logger.info('Handling GET /api/events/history', {
        requestId,
        correlationId,
        startLedger: range.startLedger,
        endLedger: range.endLedger,
        returned: events.length,
      });

      sendOk(res, 200, {
        count: events.length,
        startLedger: range.startLedger,
        endLedger: range.endLedger,
        events,
      });

      logger.info('GET /api/events/history complete', {
        requestId,
        correlationId,
        startLedger: range.startLedger,
        endLedger: range.endLedger,
        returned: events.length,
        durationMs: Date.now() - startTime,
      });
      return;
    }

    // GET /api/version — version catalog and deprecation registry (#984)
    if (req.method === 'GET' && url.pathname === '/api/version') {
      sendOk(res, 200, buildVersionCatalog());
      return;
    }

    // GET /api/events
    if (req.method === 'GET' && url.pathname.startsWith('/api/events')) {
      const limitParam = url.searchParams.get('limit');
      const parsedLimit = limitParam ? parseInt(limitParam, 10) : undefined;
      const paginationParams = normalizePaginationParams(
        parsedLimit !== undefined && !Number.isNaN(parsedLimit) ? parsedLimit : undefined
      );
      const events = eventRegistry.getEvents(paginationParams.limit);

      logger.info('Handling GET /api/events', { requestId, correlationId, limit: paginationParams.limit });

      sendOk(res, 200, { count: eventRegistry.count(), events });

      logger.info('GET /api/events complete', {
        requestId,
        correlationId,
        returned: events.length,
        durationMs: Date.now() - startTime,
      });
      return;
    }

    // GET /api/indexing/health
    if (req.method === 'GET' && url.pathname === '/api/indexing/health') {
      const networkTip = await fetchNetworkTipLedger(options.stellarRpcUrl);
      const ingestion = eventRegistry.getIngestionSnapshot();

      const now = Date.now();
      const processingDelayMs =
        ingestion.lastIngestedAt === null ? null : Math.max(0, now - ingestion.lastIngestedAt);

      const indexedLedger = ingestion.lastIngestedLedger;
      const networkTipLedger = networkTip.ledger;
      const ledgerLag =
        indexedLedger === null || networkTipLedger === null
          ? null
          : Math.max(0, networkTipLedger - indexedLedger);

      const derived = deriveIndexingStatus({ indexedLedger, networkTipLedger, processingDelayMs });

      const response: IndexingHealthResponse = {
        status: derived.status,
        timestamp: new Date().toISOString(),
        indexedLedger,
        networkTipLedger,
        ledgerLag,
        processingDelayMs,
        lastIngestedAt: ingestion.lastIngestedAt
          ? new Date(ingestion.lastIngestedAt).toISOString()
          : null,
        detail: derived.detail ?? networkTip.errorDetail,
      };

      sendOk(res, 200, response);
      return;
    }

    // GET /api/analytics
    if (req.method === 'GET' && url.pathname === '/api/analytics') {
      const aggregator =
        options.analyticsAggregator !== undefined
          ? options.analyticsAggregator
          : getNotificationAnalyticsAggregator();

      if (!aggregator) {
        sendErr(res, 503, 'Analytics aggregator unavailable', ErrorCode.SERVICE_UNAVAILABLE);
        return;
      }

      const snapshot = aggregator.snapshot();
      const reset = url.searchParams.get('reset') === 'true';

      logger.info('Handling GET /api/analytics', {
        requestId,
        correlationId,
        totalRecorded: snapshot.totalRecorded,
        reset,
        durationMs: Date.now() - startTime,
      });

      sendOk(res, 200, snapshot);

      if (reset) {
        aggregator.reset();
        logger.info('Analytics snapshot reset after read', { requestId, correlationId });
      }
      return;
    }

    // GET /api/analytics/history
    if (req.method === 'GET' && url.pathname === '/api/analytics/history') {
      if (!options.metricsStore) {
        sendErr(res, 503, 'Metrics store unavailable', ErrorCode.SERVICE_UNAVAILABLE);
        return;
      }
      const limitParam = url.searchParams.get('limit');
      const sinceParam = url.searchParams.get('since');
      const limit = limitParam ? parseInt(limitParam, 10) : undefined;
      const since = sinceParam ? new Date(sinceParam) : undefined;
      options.metricsStore
        .getHistory(limit, since)
        .then((snapshots) => {
          sendOk(res, 200, { snapshots });
        })
        .catch((error) => {
          logger.error('Failed to fetch metrics history', { error, requestId, correlationId });
          sendErr(res, 500, (error as Error).message, ErrorCode.INTERNAL_ERROR);
        });
      return;
    }

    // GET /api/notifications/health
    if (req.method === 'GET' && url.pathname === '/api/notifications/health') {
      const report = options.healthMonitor?.getLastReport() ?? null;
      if (!report) {
        sendJson(res, 503, { error: 'Health monitor not configured or no report yet' });
        return;
      }
      const httpStatus = report.status === 'unhealthy' ? 503 : 200;
      sendJson(res, httpStatus, report);
      return;
    }

    // GET /api/rate-limit/metrics
    if (req.method === 'GET' && url.pathname === '/api/rate-limit/metrics') {
      if (!rateLimiter) {
        sendJson(res, 200, {
          totalRequests: 0,
          blockedRequests: 0,
          allowedRequests: 0,
          uniqueClients: 0,
          topBlockedClients: [],
          startTime: new Date().toISOString(),
        });
        return;
      }
      sendJson(res, 200, rateLimiter.getMetrics());
      return;
    }

    // POST /api/webhooks
    if (req.method === 'POST' && url.pathname === '/api/webhooks') {
      if (!validateContentType(req, res, ['application/json'])) {
        return;
      }

      const idempotencyKey = IdempotencyKeyService.extractKey(req.headers) ?? undefined;

      const writeAuthFailure = (statusCode: number, message: string, code: string): void => {
        res.writeHead(statusCode, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: { code, message }, code }));
      };

      collectRawBody(req)
        .then(async (rawBody) => {
          const sourceIp =
            (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
            (req.socket?.remoteAddress as string | undefined);

          const secrets = options.webhookSecrets ?? [];
          const maxAgeSeconds = options.signatureExpirationSeconds ?? 300;

          // Use default database for audit log or mock one if not available.
          // Actually since SecurityAuditService requires Database, let's pass a real one.
          const db = getDatabase();
          const { SecurityAuditService } = require('../services/security-audit');
          const auditService = new SecurityAuditService(db);

          const auth = await verifyWebhookRequest({
            headers: req.headers as Record<string, string | string[] | undefined>,
            rawBody,
            secrets,
            sourceIp,
            requestId,
            correlationId,
            maxAgeSeconds,
            requireTimestamp: options.requireWebhookTimestamp !== false,
            replayCache: webhookReplayCache,
            auditService,
          });

          if (!auth.authenticated) {
            logger.warn('Webhook authentication failed', {
              requestId,
              correlationId,
              code: auth.errorCode,
            });
            writeAuthFailure(auth.statusCode, auth.message, auth.errorCode);
            return;
          }

          try {
            const acceptWebhook = async (): Promise<{ status: string; verified: boolean }> => {
              logger.info('Webhook received and signature verified', {
                requestId,
                correlationId,
                keyId: auth.keyId,
                timestampVerified: auth.timestampVerified,
                sourceIp,
                contentLength: rawBody.length,
                idempotencyKey,
              });
              return { status: 'accepted', verified: true };
            };

            if (options.idempotencyService && idempotencyKey) {
              const outcome = await options.idempotencyService.processWithIdempotency(
                idempotencyKey,
                rawBody,
                acceptWebhook,
                { requestId, correlationId },
              );
              const statusCode = outcome.isDuplicate ? 200 : 202;
              res.writeHead(statusCode, {
                'Content-Type': 'application/json',
                'X-Idempotent-Replay': outcome.isDuplicate ? 'true' : 'false',
              });
              res.end(
                JSON.stringify({
                  ...(outcome.result as object),
                  replay: outcome.isDuplicate,
                }),
              );
            } else {
              const result = await acceptWebhook();
              res.writeHead(202, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify(result));
            }
          } catch (err) {
            if (err instanceof IdempotencyKeyReuseError) {
              logger.warn('Webhook rejected: idempotency key reused with different body', {
                requestId,
                correlationId,
                idempotencyKey,
              });
              writeAuthFailure(err.statusCode, err.message, err.code);
              return;
            }
            logger.error('Failed to process webhook', { requestId, correlationId, error: err });
            sendErr(res, 500, 'Internal server error', ErrorCode.INTERNAL_ERROR);
          }
        })
        .catch((err) => {
          logger.error('Failed to read webhook body', {
            requestId,
            correlationId,
            error: err instanceof Error ? err.message : String(err),
          });
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(
            JSON.stringify({ error: 'Failed to read request body', code: 'BODY_READ_FAILED' }),
          );
        });
      return;
    }

    // POST /api/notifications/validate-batch
    if (req.method === 'POST' && url.pathname === '/api/notifications/validate-batch') {
      if (!validateContentType(req, res, ['application/json'])) {
        return;
      }

      let body = '';
      req.on('data', (chunk) => {
        body += chunk.toString();
      });
      req.on('end', () => {
        try {
          const data = JSON.parse(body || 'null');
          const batch = Array.isArray(data) ? data : data?.notifications;
          const validator = new BatchValidationService();
          const result = validator.validate(batch);

          if (!result.valid) {
            sendOk(res, 400, result);
            logger.warn('Batch validation rejected', {
              requestId,
              correlationId,
              errorCount: result.errors.length,
            });
            return;
          }

          sendOk(res, 200, result);
          logger.info('Batch validation passed', {
            requestId,
            correlationId,
            processedCount: result.processedCount,
          });
        } catch (error) {
          logger.error('Failed to validate notification batch', {
            error,
            requestId,
            correlationId,
          });
          sendOk(res, 400, {
            valid: false,
            processedCount: 0,
            errors: [
              { index: -1, code: 'PARSE_ERROR', message: 'Request body must be valid JSON.' },
            ],
          });
        }
      });
      return;
    }

    // POST /api/notifications/import — bulk import from JSON or CSV
    if (req.method === 'POST' && url.pathname === '/api/notifications/import') {
      // Authenticate before revealing anything about service availability.
      if (!requireApiKey()) return;

      if (!options.notificationAPI) {
        sendErr(res, 503, 'Scheduler not enabled', ErrorCode.SERVICE_UNAVAILABLE);
        return;
      }

      if (!validateContentType(req, res, ['application/json', 'text/csv', 'application/csv'])) {
        return;
      }

      const apiKeyHeader = req.headers['x-api-key'];
      if (options.apiKeys && options.apiKeys.length > 0) {
        const provided = Array.isArray(apiKeyHeader) ? apiKeyHeader[0] : apiKeyHeader;
        const allowed = options.apiKeys.some((k) => k.key === provided);
        if (!allowed) {
          sendErr(res, 401, 'Unauthorized', ErrorCode.UNAUTHORIZED);
          return;
        }
      }

      let body = '';
      req.on('data', (chunk) => {
        body += chunk.toString();
      });
      req.on('end', async () => {
        try {
          const contentType = req.headers['content-type'] || '';
          const importer = new NotificationImportService(options.notificationAPI!);
          const summary = await importer.importFromBody(body, contentType, { requestId });
          sendOk(res, 200, summary);
          logger.info('Bulk notification import finished', {
            requestId,
            correlationId,
            imported: summary.imported,
            skipped: summary.skipped,
          });
        } catch (error) {
          logger.error('Failed to import notifications', { error, requestId, correlationId });
          handleApiError(res, error, requestId, correlationId);
        }
      });
      return;
    }

    // GET & POST /api/admin/export (and /api/export) — Data Export Utility (#850)
    if (
      (req.method === 'GET' || req.method === 'POST') &&
      (url.pathname === '/api/admin/export' || url.pathname === '/api/export')
    ) {
      const apiKeyHeader = req.headers['x-api-key'];
      if (options.apiKeys && options.apiKeys.length > 0) {
        const provided = Array.isArray(apiKeyHeader) ? apiKeyHeader[0] : apiKeyHeader;
        const allowed = options.apiKeys.some((k) => k.key === provided);
        if (!allowed) {
          sendErr(res, 401, 'Unauthorized', ErrorCode.UNAUTHORIZED);
          return;
        }
      }

      const processExport = async (rawFilters: Record<string, unknown>) => {
        try {
          const exportService =
            options.dataExportService ?? new DataExportService(getDatabase());

          const validation = validatePayload(rawFilters, Schemas.dataExport);
          if (!validation.valid) {
            sendErr(
              res,
              400,
              `Validation failed: ${validation.issues[0]?.message}`,
              ErrorCode.BAD_REQUEST,
              validation.issues
            );
            return;
          }

          const type = (rawFilters.type as 'notifications' | 'events' | 'all') || 'all';
          const format = (rawFilters.format as 'json' | 'csv') || 'json';
          const includeSensitive =
            rawFilters.includeSensitive === true || rawFilters.includeSensitive === 'true';

          const limit = rawFilters.limit ? Number(rawFilters.limit) : undefined;
          const offset = rawFilters.offset ? Number(rawFilters.offset) : undefined;

          const result = await exportService.exportData({
            type,
            format,
            includeSensitive,
            notificationFilters: {
              status: rawFilters.status as string | undefined,
              notificationType: (rawFilters.channel || rawFilters.notificationType) as string | undefined,
              targetRecipient: (rawFilters.recipient || rawFilters.targetRecipient) as string | undefined,
              contractAddress: (rawFilters.contract || rawFilters.contractAddress) as string | undefined,
              fromDate: (rawFilters.from || rawFilters.fromDate) as string | undefined,
              toDate: (rawFilters.to || rawFilters.toDate) as string | undefined,
              limit,
              offset,
            },
            eventFilters: {
              status: rawFilters.status as string | undefined,
              eventType: rawFilters.eventType as string | undefined,
              contractAddress: (rawFilters.contract || rawFilters.contractAddress) as string | undefined,
              fromDate: (rawFilters.from || rawFilters.fromDate) as string | undefined,
              toDate: (rawFilters.to || rawFilters.toDate) as string | undefined,
              limit,
              offset,
            },
          });

          if (format === 'csv') {
            res.writeHead(200, {
              'Content-Type': 'text/csv',
              'Content-Disposition': 'attachment; filename="notifychain-export.csv"',
            });
            res.end(result.csvContent || '');
            return;
          }

          sendOk(res, 200, result);
        } catch (error) {
          logger.error('Failed to export data', { error, requestId, correlationId });
          handleApiError(res, error, requestId, correlationId);
        }
      };

      if (req.method === 'GET') {
        const queryParams: Record<string, unknown> = {};
        url.searchParams.forEach((val, key) => {
          queryParams[key] = val;
        });
        await processExport(queryParams);
        return;
      } else {
        let body = '';
        req.on('data', (chunk) => { body += chunk.toString(); });
        req.on('end', async () => {
          try {
            const bodyParams = body ? JSON.parse(body) : {};
            await processExport(bodyParams);
          } catch (jsonErr) {
            sendErr(res, 400, 'Malformed JSON payload in request body', ErrorCode.PARSE_ERROR);
          }
        });
        return;
      }
    }

    // POST /api/schedule
    if (req.method === 'POST' && url.pathname === '/api/schedule') {
      if (!options.notificationAPI) {
        sendErr(res, 503, 'Scheduler not enabled', ErrorCode.SERVICE_UNAVAILABLE);
        return;
      }

      if (!validateContentType(req, res, ['application/json'])) {
        return;
      }

      const idempotencyKey = IdempotencyKeyService.extractKey(req.headers) ?? undefined;
      let body = '';
      req.on('data', (chunk) => {
        body += chunk.toString();
      });
      req.on('end', async () => {
        let data: any;
        try {
          data = JSON.parse(body);
        } catch {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(
            JSON.stringify({
              error: 'Request body must be valid JSON.',
              code: ErrorCode.PARSE_ERROR,
            }),
          );
          return;
        }

        try {
          if (!data.executeAt || !data.payload || !data.targetRecipient) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(
              JSON.stringify({
                error: 'Missing required fields: executeAt, payload, targetRecipient',
                code: 'MISSING_FIELDS',
              }),
            );
            return;
          }

          let executeAt: Date;
          let timezone = 'UTC';
          try {
            const parsed = parseExecuteAtWithTimezone(data.executeAt, data.timezone);
            executeAt = parsed.utcDate;
            timezone = parsed.timezone;
          } catch (tzErr) {
            if (tzErr instanceof InvalidTimezoneError) {
              res.writeHead(400, { 'Content-Type': 'application/json' });
              res.end(
                JSON.stringify({ error: tzErr.message, code: 'INVALID_TIMEZONE' }),
              );
              return;
            }
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(
              JSON.stringify({ error: 'executeAt is not a valid date', code: 'INVALID_DATE' }),
            );
            return;
          }

          const schedule = async (): Promise<{
            id: number;
            executeAt: string;
            timezone: string;
            executeAtLocal: string;
          }> => {
            const notificationId = await options.notificationAPI!.scheduleNotification({
              payload: data.payload,
              notificationType: data.notificationType || NotificationType.DISCORD,
              targetRecipient: data.targetRecipient,
              executeAt,
              timezone,
              expiresAt: data.expiresAt,
              maxRetries: data.maxRetries,
              priority: data.priority,
              eventId: data.eventId,
              contractAddress: data.contractAddress,
              metadata: data.metadata,
            });
            logger.info('Notification scheduled via API', {
              requestId,
              correlationId,
              notificationId,
              executeAt: executeAt.toISOString(),
              timezone,
            });
            return {
              id: notificationId,
              executeAt: executeAt.toISOString(),
              timezone,
              executeAtLocal: formatInTimezone(executeAt, timezone),
            };
          };

          if (options.idempotencyService && idempotencyKey) {
            const outcome = await options.idempotencyService.processWithIdempotency(
              idempotencyKey,
              data,
              schedule,
              { requestId, correlationId },
            );
            const statusCode = outcome.isDuplicate ? 200 : 201;
            const result = outcome.result as {
              id: number;
              executeAt: string;
              timezone: string;
              executeAtLocal: string;
            };
            res.writeHead(statusCode, {
              'Content-Type': 'application/json',
              'X-Idempotent-Replay': outcome.isDuplicate ? 'true' : 'false',
            });
            res.end(
              JSON.stringify({
                id: result.id,
                executeAt: result.executeAt,
                timezone: result.timezone,
                executeAtLocal: result.executeAtLocal,
                replay: outcome.isDuplicate,
              }),
            );
            return;
          }

          const scheduled = await schedule();
          res.writeHead(201, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(scheduled));
        } catch (error) {
          if (error instanceof InvalidTimezoneError) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: error.message, code: 'INVALID_TIMEZONE' }));
            return;
          }
          if (error instanceof IdempotencyKeyReuseError) {
            logger.warn('Schedule API rejected request: idempotency key body mismatch', {
              requestId,
              correlationId,
              idempotencyKey,
            });
            res.writeHead(error.statusCode, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: error.message, code: error.code }));
            return;
          }

          const anyError = error as any;
          if (anyError?.name === 'PayloadTooLargeError') {
            logger.warn('Payload too large', {
              error,
              requestId,
              correlationId,
              payloadSizeBytes: anyError.payloadSizeBytes,
              maxSizeBytes: anyError.maxSizeBytes,
            });
            res.writeHead(413, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: anyError.message, code: 'PAYLOAD_TOO_LARGE' }));
            return;
          }

          logger.error('Failed to schedule notification', {
            error: error instanceof Error ? error.message : String(error),
            requestId,
            correlationId,
          });
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: (error as Error).message, code: 'SCHEDULE_FAILED' }));
        }
      });
      return;
    }

    // GET /api/schedule/stats
    if (req.method === 'GET' && url.pathname === '/api/schedule/stats') {
      if (!options.notificationAPI) {
        sendErr(res, 503, 'Scheduler not enabled', ErrorCode.SERVICE_UNAVAILABLE);
        return;
      }

      options.notificationAPI
        .getStatistics()
        .then((stats) => {
          sendOk(res, 200, stats);
        })
        .catch((error) => {
          logger.error('Failed to get scheduler stats', { error, requestId, correlationId });
          sendErr(res, 500, (error as Error).message, ErrorCode.INTERNAL_ERROR);
        });
      return;
    }

    // GET /api/schedule/execution-metrics
    if (req.method === 'GET' && url.pathname === '/api/schedule/execution-metrics') {
      if (!options.notificationAPI) {
        sendErr(res, 503, 'Scheduler not enabled', ErrorCode.SERVICE_UNAVAILABLE);
        return;
      }
      (options.notificationAPI as any)
        .getExecutionMetrics()
        .then((metrics: unknown) => {
          sendOk(res, 200, metrics);
        })
        .catch((error: Error) => {
          logger.error('Failed to get execution metrics', { error, requestId, correlationId });
          sendErr(res, 500, error.message, ErrorCode.INTERNAL_ERROR);
        });
      return;
    }

    // GET /api/schedule/retry-distribution
    if (req.method === 'GET' && url.pathname === '/api/schedule/retry-distribution') {
      if (!options.notificationAPI) {
        sendErr(res, 503, 'Scheduler not enabled', ErrorCode.SERVICE_UNAVAILABLE);
        return;
      }
      (options.notificationAPI as any)
        .getRetryDistribution()
        .then((distribution: unknown) => {
          sendOk(res, 200, distribution);
        })
        .catch((error: Error) => {
          logger.error('Failed to get retry distribution', { error, requestId, correlationId });
          sendErr(res, 500, error.message, ErrorCode.INTERNAL_ERROR);
        });
      return;
    }

    // GET /api/schedule/jobs — background job monitoring snapshot
    if (req.method === 'GET' && url.pathname === '/api/schedule/jobs') {
      const monitor = getJobMonitor();
      const limitParam = url.searchParams.get('limit');
      const limit = limitParam ? Math.min(Math.max(parseInt(limitParam, 10) || 25, 1), 200) : 25;
      sendOk(res, 200, {
        ...monitor.getSnapshot(),
        recentJobs: monitor.listRecentJobs(limit),
        recentFailures: monitor.listFailures(limit),
    const bodyMethods = new Set(['POST', 'PUT', 'PATCH']);
    if (bodyMethods.has((req.method ?? 'GET').toUpperCase())) {
      if (!validateContentType(req, res, ['application/json'])) {
        return;
      }
      const limitCheck = enforceBodyLimit(req, res, {
        maxBytes: bodyLimitBytes,
        onRejected: (reason, observedBytes) => {
          logger.warn('Rejected oversized request body', { reason, observedBytes, path: pathname });
        },
      });
      if (!limitCheck.allowed) {
        return;
      }
    }

    if (pathname === '/health') {
      const services: Record<string, HealthServiceStatus> = {
        stellarRpc: await checkStellarRpc(options.stellarRpcUrl ?? 'http://localhost:8000'),
        discord: await checkDiscord(options.discordWebhookUrl),
        database: await checkDatabase(),
        eventRegistry: { status: eventRegistry.count() > 0 ? 'ok' : 'ok', eventCount: eventRegistry.count() },
      };
      const overall = statusFromServiceMap(services);
      const httpStatus = overall === 'error' ? 503 : 200;
      sendJson(res, httpStatus, {
        status: overall,
        timestamp: new Date().toISOString(),
        uptimeSeconds: Number(((Date.now() - (globalThis as any).__notifyStartTs) / 1000).toFixed(3)) || 0,
        version: process.env.npm_package_version ?? 'unknown',
        services,
      });
      return;
    }

    // GET /api/schedule/jobs/failures — failed job log
    if (req.method === 'GET' && url.pathname === '/api/schedule/jobs/failures') {
      const monitor = getJobMonitor();
      const limitParam = url.searchParams.get('limit');
      const limit = limitParam ? Math.min(Math.max(parseInt(limitParam, 10) || 50, 1), 200) : 50;
      sendOk(res, 200, {
        failures: monitor.listFailures(limit),
        count: monitor.listFailures(limit).length,
    if (pathname === '/api/status') {
      const contracts = (configContractAddresses ?? []).map((contract) => normalizeContractEntry(contract));
      sendOk(res, 200, {
        timestamp: new Date().toISOString(),
        contracts: contracts.map((item) => ({
          address: item.address,
          paused: false,
        })),
      });
      return;
    }

    // GET /api/schedule/retry-statistics
    if (req.method === 'GET' && url.pathname === '/api/schedule/retry-statistics') {
      if (!options.notificationAPI) {
        sendErr(res, 503, 'Scheduler not enabled', ErrorCode.SERVICE_UNAVAILABLE);
        return;
      }

      options.notificationAPI
        .getRetryStatistics()
        .then((stats) => {
          sendOk(res, 200, stats);
        })
        .catch((error) => {
          logger.error('Failed to get retry statistics', { error, requestId, correlationId });
          handleApiError(res, error, requestId, correlationId);
        });
      return;
    }

    // GET /api/schedule/queue — queue visibility: list pending jobs
    // Returns jobs currently waiting in the queue with id, type, enqueued
    // time (createdAt), scheduled delivery time (executeAt), priority, and
    // retryCount.  Accepts an optional ?limit= query param (default 100).
    if (req.method === 'GET' && url.pathname === '/api/schedule/queue') {
      if (!options.notificationAPI) {
        sendErr(res, 503, 'Scheduler not enabled', ErrorCode.SERVICE_UNAVAILABLE);
        return;
      }

      const limitParam = url.searchParams.get('limit');
      const limit = limitParam
        ? Math.max(1, Math.min(500, parseInt(limitParam, 10) || 100))
        : undefined;

      options.notificationAPI
        .getPendingJobs(limit)
        .then((jobs) => {
          logger.info('Handling GET /api/schedule/queue', {
            requestId,
            correlationId,
            count: jobs.length,
            durationMs: Date.now() - startTime,
          });
          sendOk(res, 200, { count: jobs.length, jobs });
        })
        .catch((error) => {
          logger.error('Failed to get pending jobs', { error, requestId, correlationId });
          handleApiError(res, error, requestId, correlationId);
        });
      return;
    }

    // GET /api/schedule/queue/metrics — operational metrics for notification queue activity (#797)
    if (
      req.method === 'GET' &&
      (url.pathname === '/api/schedule/queue/metrics' ||
        url.pathname === '/api/schedule/queue-metrics' ||
        url.pathname === '/api/notifications/queue-metrics')
    ) {
      if (!options.notificationAPI) {
        sendErr(res, 503, 'Scheduler not enabled', ErrorCode.SERVICE_UNAVAILABLE);
        return;
      }

      options.notificationAPI
        .getQueueOperationalMetrics()
        .then((metrics) => {
          logger.info('Handling GET /api/schedule/queue/metrics', {
            requestId,
            correlationId,
            durationMs: Date.now() - startTime,
          });
          sendOk(res, 200, metrics);
        })
        .catch((error) => {
          logger.error('Failed to get queue operational metrics', {
            error,
            requestId,
            correlationId,
          });
          handleApiError(res, error, requestId, correlationId);
        });
      return;
    }

    // GET /api/schedule/:id/audit — schedule change audit trail (#966)
    const scheduleAuditMatch = url.pathname.match(/^\/api\/schedule\/(\d+)\/audit$/);
    if (req.method === 'GET' && scheduleAuditMatch) {
      if (!options.notificationAPI) {
        sendErr(res, 503, 'Scheduler not enabled', ErrorCode.SERVICE_UNAVAILABLE);
        return;
      }

      const id = parseInt(scheduleAuditMatch[1], 10);
      options.notificationAPI
        .getScheduleAuditHistory(id)
        .then((records) => {
          sendOk(res, 200, {
            scheduledNotificationId: id,
            records: records.map((r) => ({
              id: r.id,
              action: r.action,
              actor: r.actor,
              timestamp: r.timestamp.toISOString(),
              fromStatus: r.fromStatus,
              toStatus: r.toStatus,
              details: r.details,
            })),
          });
        })
        .catch((error) => {
          logger.error('Failed to get schedule audit history', {
            error,
            requestId,
            correlationId,
            id,
          });
          sendErr(res, 500, (error as Error).message, ErrorCode.INTERNAL_ERROR);
        });
      return;
    }

    // GET /api/schedule/:id
    if (req.method === 'GET' && url.pathname.startsWith('/api/schedule/')) {
      if (!options.notificationAPI) {
        sendErr(res, 503, 'Scheduler not enabled', ErrorCode.SERVICE_UNAVAILABLE);
        return;
      }

      const id = parseInt(url.pathname.split('/').pop() || '', 10);
      if (isNaN(id)) {
        sendErr(res, 400, 'Invalid notification ID', ErrorCode.BAD_REQUEST);
        return;
      }

      options.notificationAPI
        .getNotification(id)
        .then((notification) => {
          if (!notification) {
            sendErr(res, 404, 'Notification not found', ErrorCode.NOT_FOUND);
            return;
          }
          sendOk(res, 200, notification);
        })
        .catch((error) => {
          logger.error('Failed to get notification', { error, requestId, correlationId, id });
          sendErr(res, 500, (error as Error).message, ErrorCode.INTERNAL_ERROR);
        });
      return;
    }

    // POST /api/schedule/:id/cancel — primary schedule cancellation endpoint (#969)
    // Also supports legacy POST /api/notifications/:id/cancel
    const scheduleCancelMatch = url.pathname.match(
      /^\/api\/(?:schedule|notifications)\/(\d+)\/cancel$/,
    );
    if (req.method === 'POST' && scheduleCancelMatch) {
      if (!options.notificationAPI) {
        sendErr(res, 503, 'Scheduler not enabled', ErrorCode.SERVICE_UNAVAILABLE);
        return;
      }

      const id = parseInt(scheduleCancelMatch[1], 10);
      if (isNaN(id)) {
        sendErr(res, 400, 'Invalid notification ID', ErrorCode.BAD_REQUEST);
        return;
      }

      let body = '';
      req.on('data', (chunk) => {
        body += chunk;
      });
      req.on('end', () => {
        void (async () => {
          try {
            const parsed = body ? (JSON.parse(body) as { reason?: string }) : {};
            const result = await options.notificationAPI!.cancelSchedule(
              id,
              parsed.reason,
              requestId,
            );

            if (result.state === 'not_found') {
              sendErr(res, 404, result.message, ErrorCode.NOT_FOUND);
              return;
            }

            if (result.state === 'already_final') {
              // Completed / failed / processing — do not silently undo.
              sendJson(res, 409, {
                cancelled: false,
                state: result.state,
                status: result.status,
                message: result.message,
                notification: result.notification ?? null,
              });
              return;
            }

            // Fresh cancel and idempotent already_cancelled both return 200.
            sendOk(res, 200, {
              cancelled: result.cancelled,
              state: result.state,
              status: result.status,
              message: result.message,
              notification: result.notification ?? null,
            });
          } catch (error) {
            if (error instanceof SyntaxError) {
              sendErr(res, 400, 'Invalid JSON', ErrorCode.PARSE_ERROR);
              return;
            }
            logger.error('Failed to cancel notification', { error, requestId, correlationId, id });
            sendErr(res, 500, (error as Error).message, ErrorCode.INTERNAL_ERROR);
          }
        })();
      });
      return;
    }

    function isValidApiKey(
      apiKey: string | undefined,
      allowedKeys: Array<{ key: string; name?: string }> | undefined,
    ): boolean {
      if (!allowedKeys || allowedKeys.length === 0) {
        // If no API keys are configured, allow unauthenticated access is allowed (for backward compatibility)
        return true;
      }
      if (!apiKey) {
        return false;
      }
      return allowedKeys.some((k) => k.key === apiKey);
    }

    // Get delivery receipts for a scheduled notification
    const receiptPath = url.pathname.match(/^\/api\/notifications\/(\d+)\/receipts$/);
    if (req.method === 'GET' && receiptPath) {
      const apiKey = req.headers['x-api-key'] as string | undefined;
      if (!isValidApiKey(apiKey, options.apiKeys)) {
        sendErr(res, 401, 'Unauthorized: Invalid or missing API key', ErrorCode.UNAUTHORIZED);
        return;
      }

      if (!options.deliveryReceiptRepository) {
        sendErr(res, 503, 'Delivery receipt storage is not configured', ErrorCode.SERVICE_UNAVAILABLE);
        return;
      }

      const rawStatus = url.searchParams.get('status');
      const statuses: DeliveryReceiptStatus[] = ['delivered', 'failed', 'rejected', 'pending'];
      if (rawStatus && !statuses.includes(rawStatus as DeliveryReceiptStatus)) {
        sendErr(res, 400, 'Invalid delivery receipt status', ErrorCode.BAD_REQUEST);
        return;
      }

      options.deliveryReceiptRepository
        .findByNotificationId(Number(receiptPath[1]), rawStatus as DeliveryReceiptStatus | undefined)
        .then((receipts) => sendOk(res, 200, { receipts }))
        .catch((error) => {
          logger.error('Failed to retrieve delivery receipts', { error, requestId, correlationId });
          sendErr(res, 500, 'Failed to retrieve delivery receipts', ErrorCode.INTERNAL_ERROR);
        });
      return;
    }

    // Get notification delivery history endpoint.
    // Matched on the rewritten pathname so /api/v1/notifications/history is
    // routed (and authenticated) the same as the unversioned path.
    if (req.method === 'GET' && url.pathname === '/api/notifications/history') {
      if (!requireApiKey()) return;
      const limit = url.searchParams.get('limit') ? parseInt(url.searchParams.get('limit')!, 10) : undefined;
      const offset = url.searchParams.get('offset') ? parseInt(url.searchParams.get('offset')!, 10) : undefined;
      const cursor = url.searchParams.get('cursor') || undefined;
      const status = url.searchParams.get('status') as 'SUCCESS' | 'FAILED' | 'RETRY' | null;
      const startDate = url.searchParams.get('startDate');
      const endDate = url.searchParams.get('endDate');

      logger.info('Handling GET /api/notifications/history', {
        requestId,
        correlationId,
        limit,
        offset,
        cursor,
        status,
        startDate,
        endDate,
      });

      historyService
        .getHistory({
          limit,
          offset,
          cursor,
          status: status || undefined,
          startDate: startDate || undefined,
          endDate: endDate || undefined,
        })
        .then((result) => {
          sendJson(res, 200, result);
          logger.info('GET /api/notifications/history complete', {
            requestId,
            correlationId,
            total: result.total,
            durationMs: Date.now() - startTime,
          });
        })
        .catch((error) => {
          logger.error('Failed to retrieve notification history', {
            error,
            requestId,
            correlationId,
          });
          sendErr(res, 500, (error as Error).message, ErrorCode.INTERNAL_ERROR);
        });
      return;
    }

    // GET /api/notifications/search
    if (req.method === 'GET' && url.pathname === '/api/notifications/search') {
      const q = url.searchParams.get('q') ?? undefined;
      const sender = url.searchParams.get('sender') ?? undefined;
      const txHash = url.searchParams.get('txHash') ?? undefined;
      const eventId = url.searchParams.get('eventId') ?? undefined;
      const status = url.searchParams.get('status') ?? undefined;
      const type = url.searchParams.get('type') ?? undefined;
      const startDate = url.searchParams.get('startDate') ?? undefined;
      const endDate = url.searchParams.get('endDate') ?? undefined;
      const limit = url.searchParams.get('limit')
        ? parseInt(url.searchParams.get('limit')!, 10)
        : undefined;
      const offset = url.searchParams.get('offset')
        ? parseInt(url.searchParams.get('offset')!, 10)
        : undefined;
      const rawSortBy = url.searchParams.get('sortBy') ?? undefined;
      const sortBy = rawSortBy === 'oldest' || rawSortBy === 'status' ? rawSortBy : 'newest';

      logger.info('Handling GET /api/notifications/search', {
        requestId,
        correlationId,
        q,
        sender,
        txHash,
        eventId,
        status,
        type,
        startDate,
        endDate,
        limit,
        offset,
        sortBy,
      });

      notificationSearchService
        .search({
          q,
          sender,
          txHash,
          eventId,
          status,
          type,
          startDate,
          endDate,
          limit,
          offset,
          sortBy,
        })
        .then((result) => {
          sendOk(res, 200, result);
          logger.info('GET /api/notifications/search complete', {
            requestId,
            total: result.total,
            durationMs: Date.now() - startTime,
          });
        })
        .catch((error) => {
          logger.error('Failed to search notifications', { error, requestId, correlationId });
          sendErr(res, 500, (error as Error).message, ErrorCode.INTERNAL_ERROR);
        });
      return;
    }

    // GET /api/search/suggestions
    if (req.method === 'GET' && url.pathname === '/api/search/suggestions') {
      const q = url.searchParams.get('q') || '';
      const limit = url.searchParams.get('limit')
        ? parseInt(url.searchParams.get('limit')!, 10)
        : undefined;

      logger.info('Handling GET /api/search/suggestions', { requestId, correlationId, q, limit });

      suggestionService
        .getSuggestions(q, limit)
        .then((result) => {
          sendOk(res, 200, result);
          logger.info('GET /api/search/suggestions complete', {
            requestId,
            correlationId,
            durationMs: Date.now() - startTime,
          });
        })
        .catch((error) => {
          logger.error('Failed to retrieve search suggestions', {
            error,
            requestId,
            correlationId,
          });
          sendErr(res, 500, (error as Error).message, ErrorCode.INTERNAL_ERROR);
        });
      return;
    }

    // GET /api/templates
    if (req.method === 'GET' && url.pathname === '/api/templates') {
      if (!options.templateService) {
        sendErr(res, 503, 'Template service not enabled', ErrorCode.SERVICE_UNAVAILABLE);
        return;
      }

      logger.info('Handling GET /api/templates', { requestId, correlationId });
      (options.templateService as any)
        .listAll()
        .then((templates: any[]) => {
          sendOk(res, 200, templates.map(serializeTemplate));
        })
        .catch((error: Error) => {
          logger.error('Failed to list templates', { error, requestId, correlationId });
          sendErr(res, 500, error.message, ErrorCode.INTERNAL_ERROR);
        });
      return;
    }

    // GET /api/templates/:id/audit
    const templateAuditMatch = url.pathname.match(/^\/api\/templates\/([^/]+)\/audit$/);
    if (req.method === 'GET' && templateAuditMatch) {
      if (!options.templateService) {
        sendErr(res, 503, 'Template service not enabled', ErrorCode.SERVICE_UNAVAILABLE);
        return;
      }

      const templateId = decodeURIComponent(templateAuditMatch[1]);
      logger.info('Handling GET /api/templates/:id/audit', {
        requestId,
        correlationId,
        templateId,
      });

      (options.templateService as any)
        .getAuditHistory(templateId)
        .then(async (records: any[]) => {
          const template = await (options.templateService as any).getById(templateId);
          if (!template && records.length === 0) {
            sendErr(res, 404, 'Template not found', ErrorCode.NOT_FOUND);
            return;
          }
          sendOk(res, 200, { templateId, records: records.map(serializeAuditRecord) });
        })
        .catch((error: Error) => {
          logger.error('Failed to load template audit history', {
            error,
            requestId,
            correlationId,
            templateId,
          });
          sendErr(res, 500, error.message, ErrorCode.INTERNAL_ERROR);
        });
      return;
    }

    // GET /api/templates/:id
    const getTemplateMatch = url.pathname.match(/^\/api\/templates\/([^/]+)$/);
    if (req.method === 'GET' && getTemplateMatch) {
      if (!options.templateService) {
        sendErr(res, 503, 'Template service not enabled', ErrorCode.SERVICE_UNAVAILABLE);
        return;
      }

      const templateId = decodeURIComponent(getTemplateMatch[1]);
      logger.info('Handling GET /api/templates/:id', { requestId, correlationId, templateId });

      (options.templateService as any)
        .getById(templateId)
        .then((template: any) => {
          if (!template) {
            sendErr(res, 404, 'Template not found', ErrorCode.NOT_FOUND);
            return;
          }
          sendOk(res, 200, serializeTemplate(template));
        })
        .catch((error: Error) => {
          logger.error('Failed to load template', { error, requestId, correlationId, templateId });
          sendErr(res, 500, error.message, ErrorCode.INTERNAL_ERROR);
        });
      return;
    }

    // PUT /api/templates/:id
    if (req.method === 'PUT' && getTemplateMatch) {
      if (!options.templateService) {
        sendErr(res, 503, 'Template service not enabled', ErrorCode.SERVICE_UNAVAILABLE);
        return;
      }

      if (!validateContentType(req, res, ['application/json'])) {
        return;
      }

      const templateId = decodeURIComponent(getTemplateMatch[1]);
      const actor = resolveRequestActor(req);
      logger.info('Handling PUT /api/templates/:id', {
        requestId,
        correlationId,
        templateId,
        actor,
      });

      let body = '';
      req.on('data', (chunk) => {
        body += chunk;
      });
      req.on('end', () => {
        void (async () => {
          try {
            const parsed = JSON.parse(body) as unknown;
            const input = parseTemplateUpdateBody(parsed);
            const updated = await (options.templateService as any).update(templateId, input, actor);
            logger.info('PUT /api/templates/:id complete', {
              requestId,
              correlationId,
              templateId,
              actor,
              durationMs: Date.now() - startTime,
            });
            sendOk(res, 200, serializeTemplate(updated));
          } catch (error) {
            if (error instanceof SyntaxError) {
              sendErr(res, 400, 'Invalid JSON', ErrorCode.PARSE_ERROR);
              return;
            }
            if (error instanceof TemplateNotFoundError) {
              sendErr(res, 404, error.message, ErrorCode.NOT_FOUND);
              return;
            }
            if (
              error instanceof TemplateValidationError ||
              (error instanceof Error && error.message.startsWith('Invalid body'))
            ) {
              sendErr(res, 400, (error as Error).message, ErrorCode.BAD_REQUEST);
              return;
            }
            logger.error('Failed to update template', {
              error,
              requestId,
              correlationId,
              templateId,
              actor,
            });
            sendErr(res, 500, (error as Error).message, ErrorCode.INTERNAL_ERROR);
          }
        })();
      });
      return;
    }

    // DELETE /api/templates/:id
    const deleteTemplateMatch = url.pathname.match(/^\/api\/templates\/([^/]+)$/);
    if (req.method === 'DELETE' && deleteTemplateMatch) {
      if (!options.templateService) {
        sendErr(res, 503, 'Template service not enabled', ErrorCode.SERVICE_UNAVAILABLE);
        return;
      }

      const templateId = decodeURIComponent(deleteTemplateMatch[1]);
      logger.info('Handling DELETE /api/templates/:id', { requestId, correlationId, templateId });

      (options.templateService as any)
        .delete(templateId)
        .then(() => {
          sendOk(res, 200, { deleted: true });
        })
        .catch((error: any) => {
          if (error instanceof TemplateNotFoundError) {
            sendErr(res, 404, error.message, ErrorCode.NOT_FOUND);
            return;
          }
          logger.error('Failed to delete template', {
            error,
            requestId,
            correlationId,
            templateId,
          });
          sendErr(res, 500, (error as Error).message, ErrorCode.INTERNAL_ERROR);
        });
      return;
    }

    // POST /api/templates
    if (req.method === 'POST' && url.pathname === '/api/templates') {
      if (!options.templateService) {
        sendErr(res, 503, 'Template service not enabled', ErrorCode.SERVICE_UNAVAILABLE);
        return;
      }

      if (!validateContentType(req, res, ['application/json'])) {
        return;
      }

      logger.info('Handling POST /api/templates', { requestId, correlationId });
      let body = '';
      req.on('data', (chunk) => {
        body += chunk;
      });
      req.on('end', () => {
        void (async () => {
          try {
            const parsed = JSON.parse(body) as CreateNotificationTemplateInput;
            if (!parsed?.id || !parsed?.name || !parsed?.type || !parsed?.body) {
              sendErr(
                res,
                400,
                'Invalid body: id, name, type, and body are required',
                ErrorCode.BAD_REQUEST,
              );
              return;
            }

            const created = await (options.templateService as any).create(parsed);
            sendOk(res, 201, serializeTemplate(created));
          } catch (error) {
            if (error instanceof SyntaxError) {
              sendErr(res, 400, 'Invalid JSON', ErrorCode.PARSE_ERROR);
              return;
            }
            if (error instanceof TemplateValidationError) {
              sendErr(res, 400, error.message, ErrorCode.BAD_REQUEST);
              return;
            }
            logger.error('Failed to create template', { error, requestId, correlationId });
            sendErr(res, 500, (error as Error).message, ErrorCode.INTERNAL_ERROR);
          }
        })();
      });
      return;
    }

    // POST /api/templates/:id/render
    const templateRenderMatch = url.pathname.match(/^\/api\/templates\/([^/]+)\/render$/);
    if (req.method === 'POST' && templateRenderMatch) {
      if (!options.templateService) {
        sendErr(res, 503, 'Template service not enabled', ErrorCode.SERVICE_UNAVAILABLE);
        return;
      }

      if (!validateContentType(req, res, ['application/json'])) {
        return;
      }

      const templateId = decodeURIComponent(templateRenderMatch[1]);
      logger.info('Handling POST /api/templates/:id/render', {
        requestId,
        correlationId,
        templateId,
      });

      let body = '';
      req.on('data', (chunk) => {
        body += chunk;
      });
      req.on('end', () => {
        void (async () => {
          try {
            const parsed = body ? (JSON.parse(body) as Record<string, string>) : {};
            const template = await (options.templateService as any).getById(templateId);
            if (!template) {
              sendErr(res, 404, `Template not found: ${templateId}`, ErrorCode.NOT_FOUND);
              return;
            }
            const rendered = (options.templateService as any).renderTemplate(template, parsed);
            sendOk(res, 200, rendered);
          } catch (error) {
            if (error instanceof SyntaxError) {
              sendErr(res, 400, 'Invalid JSON', ErrorCode.PARSE_ERROR);
              return;
            }
            if (error instanceof TemplateRenderError) {
              sendErr(res, 422, error.message, ErrorCode.UNPROCESSABLE);
              return;
            }
            logger.error('Failed to render template', {
              error,
              requestId,
              correlationId,
              templateId,
            });
            sendErr(res, 500, (error as Error).message, ErrorCode.INTERNAL_ERROR);
          }
        })();
      });
      return;
    }

    // GET /api/preferences/:userId
    const getPrefsMatch = url.pathname.match(/^\/api\/preferences\/([^/]+)$/);
    if (req.method === 'GET' && getPrefsMatch) {
      const userId = decodeURIComponent(getPrefsMatch[1]);
      logger.info('Handling GET /api/preferences/:userId', { requestId, correlationId, userId });
      const prefs = preferenceStore.get(userId);
      sendOk(res, 200, prefs);
      return;
    }

    // PUT /api/preferences/:userId
    const putPrefsMatch = url.pathname.match(/^\/api\/preferences\/([^/]+)$/);
    if (req.method === 'PUT' && putPrefsMatch) {
      if (!validateContentType(req, res, ['application/json'])) {
        return;
      }

      const userId = decodeURIComponent(putPrefsMatch[1]);
      logger.info('Handling PUT /api/preferences/:userId', { requestId, correlationId, userId });
      let body = '';
      req.on('data', (chunk) => {
        body += chunk;
    if (pathname === '/api/events') {
      const limit = parseQueryInt(url.searchParams.get('limit') ?? undefined, 20, MAX_EVENT_LIMIT);
      const items = eventRegistry.getEvents(limit);
      sendOk(res, 200, { count: eventRegistry.count(), events: items });
      return;
    }

    if (pathname === '/api/indexing/health') {
      const snapshot = eventRegistry.getIngestionSnapshot();
      const indexedLedger = snapshot.lastIngestedLedger ?? null;
      const networkTipLedger = snapshot.maxLedgerSeen ?? null;
      const ledgerLag = indexedLedger !== null && networkTipLedger !== null ? Math.max(networkTipLedger - indexedLedger, 0) : null;
      const lastIngestedAt = snapshot.lastIngestedAt !== null ? new Date(snapshot.lastIngestedAt).toISOString() : null;
      const processingDelayMs = snapshot.lastIngestedAt !== null ? Math.max(Date.now() - snapshot.lastIngestedAt, 0) : null;

      let status: 'synced' | 'syncing' | 'degraded' = 'syncing';
      if (indexedLedger !== null && networkTipLedger !== null) {
        status = ledgerLag !== null && ledgerLag <= 5 ? 'synced' : 'degraded';
      } else if (indexedLedger !== null || networkTipLedger !== null) {
        status = 'syncing';
      }

      sendOk(res, 200, {
        status,
        timestamp: new Date().toISOString(),
        indexedLedger,
        networkTipLedger,
        ledgerLag,
        processingDelayMs,
        lastIngestedAt,
      });
      return;
    }

    if (pathname.startsWith('/api/preferences/')) {
      const userId = pathname.split('/api/preferences/')[1]?.split('/')[0];
      if (!userId) {
        sendErr(res, 404, 'Preference user not found', ErrorCode.NOT_FOUND);
        return;
      }

      if (req.method === 'GET') {
        sendOk(res, 200, preferenceStore.get(userId));
        return;
      }

      if (req.method === 'PUT') {
        try {
          const input = (await readJsonBody(req)) as Record<string, unknown>;
          if (!input || typeof input !== 'object' || !('categories' in input) || typeof (input as any).categories !== 'object') {
            sendErr(res, 400, 'Invalid body: expected { categories: { [key]: boolean } }', ErrorCode.BAD_REQUEST, { field: 'categories' });
            return;
          }
          const updated = preferenceStore.update(userId, input as { categories: Record<string, boolean> });
          sendOk(res, 200, updated);
          return;
        } catch (error) {
          sendErr(res, 400, error instanceof Error ? error.message : 'Invalid JSON', ErrorCode.PARSE_ERROR, []);
          return;
        }
      }
    }

    if (pathname === '/api/webhooks' && req.method === 'POST') {
      const payload = await readJsonBody(req).catch(() => undefined);
      const rawBody = typeof payload === 'string' ? payload : JSON.stringify(payload ?? {});
      const keyId = req.headers['x-webhook-key-id'];
      const signature = req.headers['x-webhook-signature'];
      const timestamp = req.headers['x-webhook-timestamp'];

      if (!keyId || Array.isArray(keyId)) {
        sendErr(res, 401, 'Missing key-id header', 'AUTH_MISSING_KEY_ID');
        return;
      }
      if (!signature || Array.isArray(signature)) {
        sendErr(res, 401, 'Missing signature header', 'AUTH_MISSING_SIGNATURE');
        return;
      }
      const secret = webhookSecrets.get(keyId);
      if (!secret) {
        sendErr(res, 401, 'Unknown key-id', 'AUTH_UNKNOWN_KEY_ID');
        return;
      }
      const verification = verifyWebhookSignature(rawBody, signature, secret, Array.isArray(timestamp) ? timestamp[0] : timestamp);
      if (!verification.valid) {
        sendErr(res, 401, verification.message ?? 'Invalid signature', verification.code ?? 'AUTH_INVALID_SIGNATURE');
        return;
      }

      sendOk(res, 202, { status: 'accepted', verified: true });
      return;
    }

    if (pathname === '/api/analytics') {
      const snapshot = analyticsAggregator.snapshot();
      const reset = url.searchParams.get('reset') === 'true';
      if (reset) {
        analyticsAggregator.reset();
      }
      sendOk(res, 200, snapshot);
      return;
    }

    if (pathname === '/api/analytics/history') {
      if (!metricsStore || typeof metricsStore.getHistory !== 'function') {
        sendOk(res, 200, { count: 0, snapshots: [] });
        return;
      }
      const limit = parseQueryInt(url.searchParams.get('limit') ?? undefined, 10, 100);
      const since = url.searchParams.get('since') ?? undefined;
      const snapshots = await metricsStore.getHistory(limit, since);
      sendOk(res, 200, { count: Array.isArray(snapshots) ? snapshots.length : 0, snapshots: Array.isArray(snapshots) ? snapshots : [] });
      return;
    }

    if (pathname === '/api/notifications/validate-batch') {
      try {
        const body = await readJsonBody(req);
        const result = validateBatch(body);
        const payload = {
          success: true,
          data: {
            valid: result.valid,
            processedCount: result.processedCount,
            errors: result.errors,
          },
        };
        sendJson(res, result.valid ? 200 : 200, payload);
        return;
      } catch {
        sendErr(res, 400, 'Failed to read request body', ErrorCode.PARSE_ERROR);
        return;
      }
    }

    sendErr(res, 404, 'Not found', ErrorCode.NOT_FOUND);
  };

  // Per-client usage accounting (#989): record the resolved non-secret client
  // identifier, route, method and status once the response is finished. The
  // recorder is fire-and-forget so it never blocks or fails the request, and
  // only the sanitized client id is passed through — never raw credentials.
  const recordUsage = (req: http.IncomingMessage, res: http.ServerResponse): void => {
    const usageAccounting = options.usageAccounting;
    if (!usageAccounting) return;
    try {
      const clientId = resolveUsageClientId(req);
      const route = resolveUsageRoute(req);
      const status = res.statusCode;
      void Promise.resolve(
        usageAccounting.record({
          clientId,
          method: req.method ?? 'UNKNOWN',
          route,
          status,
        }),
      ).catch((error: unknown) => {
        logger.warn('Usage accounting record failed', { error });
      });
    } catch (error: unknown) {
      logger.warn('Usage accounting record failed', { error });
    }
  };

  const server = http.createServer((req, res) => {
    runWithRequestCorrelation(req, res, (requestContext) => {
      void handleRequest(req, res).catch((error: unknown) => {
        logger.error('Unhandled error in events server request handler', { error, requestId: requestContext.requestId, correlationId: requestContext.correlationId });
        if (!res.headersSent) {
          sendErr(res, 500, 'Internal server error', ErrorCode.INTERNAL_ERROR, undefined, requestContext.correlationId);
        }
      });
    });
  });

  const startupTs = Date.now();
  (globalThis as any).__notifyStartTs ??= startupTs;

  return server;
}

export function startEventsServer(options: EventsServerOptions = {}): http.Server {
  const server = createEventsServer(options);
  server.listen(options.port ?? 0, () => {
    const address = server.address();
    const port = typeof address === 'object' && address !== null && 'port' in address ? address.port : options.port ?? 0;
    logger.info('Events API server listening', { port });
  });
  return server;
}
