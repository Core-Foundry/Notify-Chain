/**
 * Per-Client Usage Accounting Service (#989)
 *
 * Tracks API consumption by client identity while ensuring stored identifiers
 * NEVER expose credential secrets or sensitive auth material.
 *
 * - Distinguishes between scoped API credentials, legacy keys, IP clients, and anonymous access.
 * - Records endpoint, method, status code, response time, and timestamp.
 * - Provides rich, testable aggregation across clients and time windows.
 */

import crypto from 'crypto';
import type http from 'http';
import { getDatabase } from '../database/database';
import logger from '../utils/logger';

export type ClientType = 'CREDENTIAL' | 'LEGACY_KEY' | 'IP' | 'ANONYMOUS';

export interface ClientIdentity {
  /** Safe identifier that never exposes raw secret material */
  clientId: string;
  clientType: ClientType;
  clientName?: string;
}

export interface UsageRecordInput {
  clientId: string;
  clientType: ClientType;
  clientName?: string;
  endpoint: string;
  method: string;
  statusCode: number;
  responseTimeMs?: number;
  timestamp?: string;
}

export interface ClientUsageRecord extends UsageRecordInput {
  id?: number;
  timestamp: string;
}

export interface ClientUsageSummary {
  clientId: string;
  clientName?: string;
  clientType: ClientType;
  totalRequests: number;
  successfulRequests: number;   // 2xx
  clientErrorRequests: number;  // 4xx
  serverErrorRequests: number;  // 5xx
  totalResponseTimeMs: number;
  averageResponseTimeMs: number;
  endpoints: Record<string, number>;
  methods: Record<string, number>;
  firstSeen: string;
  lastSeen: string;
}

export interface UsageSummaryQueryOptions {
  clientId?: string;
  since?: string | Date;
  until?: string | Date;
  limit?: number;
}

/**
 * Safely hashes a sensitive string to a short hex fingerprint.
 */
function sha256Fingerprint(value: string): string {
  return crypto.createHash('sha256').update(value, 'utf8').digest('hex').slice(0, 16);
}

/**
 * Safely derives a client identity from HTTP headers and request properties.
 * Guarantee: Raw API keys and authorization secrets are NEVER returned as or in clientId.
 */
export function identifyClientSafely(req: http.IncomingMessage, credentialName?: string): ClientIdentity {
  const apiKeyHeader = req.headers['x-api-key'];
  const rawKey = Array.isArray(apiKeyHeader) ? apiKeyHeader[0] : apiKeyHeader;

  if (typeof rawKey === 'string' && rawKey.trim().length > 0) {
    const trimmed = rawKey.trim();
    // Scoped credential format: nck_<16-char-id>_<32-char-secret>
    if (trimmed.startsWith('nck_')) {
      const parts = trimmed.split('_');
      if (parts.length >= 2 && parts[1]) {
        return {
          clientId: `credential:${parts[1]}`,
          clientType: 'CREDENTIAL',
          clientName: credentialName,
        };
      }
    }
    // Legacy static key or arbitrary token: store safe SHA-256 fingerprint
    return {
      clientId: `legacy:${sha256Fingerprint(trimmed)}`,
      clientType: 'LEGACY_KEY',
      clientName: credentialName,
    };
  }

  const authHeader = req.headers['authorization'];
  const rawAuth = Array.isArray(authHeader) ? authHeader[0] : authHeader;
  if (typeof rawAuth === 'string' && rawAuth.toLowerCase().startsWith('bearer ')) {
    const token = rawAuth.slice(7).trim();
    if (token) {
      return {
        clientId: `token:${sha256Fingerprint(token)}`,
        clientType: 'LEGACY_KEY',
        clientName: credentialName,
      };
    }
  }

  // Fallback to client IP
  const xForwardedFor = req.headers['x-forwarded-for'];
  const forwarded = Array.isArray(xForwardedFor) ? xForwardedFor[0] : xForwardedFor;
  const clientIp = (forwarded ? forwarded.split(',')[0].trim() : null) || req.socket?.remoteAddress;

  if (clientIp && clientIp !== '127.0.0.1' && clientIp !== '::1') {
    return {
      clientId: `ip:${sha256Fingerprint(clientIp)}`,
      clientType: 'IP',
    };
  }

  return {
    clientId: 'anonymous',
    clientType: 'ANONYMOUS',
  };
}

/**
 * Client Usage Accounting Service
 */
export class ClientUsageAccountingService {
  private inMemoryRecords: ClientUsageRecord[] = [];
  private useDatabase: boolean;

  constructor(options: { useDatabase?: boolean } = {}) {
    this.useDatabase = options.useDatabase ?? true;
    if (this.useDatabase) {
      this.initSchema();
    }
  }

  private initSchema(): void {
    try {
      const db = getDatabase();
      db.exec(`
        CREATE TABLE IF NOT EXISTS client_usage_records (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          client_id TEXT NOT NULL,
          client_name TEXT,
          client_type VARCHAR(20) NOT NULL,
          endpoint TEXT NOT NULL,
          method VARCHAR(10) NOT NULL,
          status_code INTEGER NOT NULL,
          response_time_ms INTEGER DEFAULT 0,
          timestamp DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
        );
        CREATE INDEX IF NOT EXISTS idx_client_usage_client_id ON client_usage_records(client_id);
        CREATE INDEX IF NOT EXISTS idx_client_usage_timestamp ON client_usage_records(timestamp);
        CREATE INDEX IF NOT EXISTS idx_client_usage_client_timestamp ON client_usage_records(client_id, timestamp);
      `);
    } catch (err) {
      // In tests without SQLite database, fall back smoothly to in-memory
      logger.debug('ClientUsageAccounting: falling back to in-memory tracking', { error: String(err) });
      this.useDatabase = false;
    }
  }

  /**
   * Records an API call under the given client identity.
   */
  public recordUsage(record: UsageRecordInput): void {
    const timestamp = record.timestamp || new Date().toISOString();
    const entry: ClientUsageRecord = {
      ...record,
      timestamp,
      responseTimeMs: record.responseTimeMs ?? 0,
    };

    // Always keep in memory for instant query / testing
    this.inMemoryRecords.push(entry);

    if (this.useDatabase) {
      try {
        const db = getDatabase();
        const stmt = db.prepare(`
          INSERT INTO client_usage_records (
            client_id, client_name, client_type, endpoint, method, status_code, response_time_ms, timestamp
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `);
        stmt.run(
          entry.clientId,
          entry.clientName ?? null,
          entry.clientType,
          entry.endpoint,
          entry.method,
          entry.statusCode,
          entry.responseTimeMs,
          entry.timestamp
        );
      } catch (err) {
        logger.warn('Failed to persist client usage record to database', { error: String(err) });
      }
    }
  }

  /**
   * Aggregates usage across records matching optional query filters.
   */
  public getUsageSummary(options: UsageSummaryQueryOptions = {}): ClientUsageSummary[] {
    const sinceDate = options.since ? new Date(options.since) : null;
    const untilDate = options.until ? new Date(options.until) : null;

    const filtered = this.inMemoryRecords.filter((rec) => {
      if (options.clientId && rec.clientId !== options.clientId) return false;
      const recDate = new Date(rec.timestamp);
      if (sinceDate && recDate < sinceDate) return false;
      if (untilDate && recDate > untilDate) return false;
      return true;
    });

    const clientMap = new Map<string, ClientUsageSummary>();

    for (const rec of filtered) {
      let summary = clientMap.get(rec.clientId);
      if (!summary) {
        summary = {
          clientId: rec.clientId,
          clientName: rec.clientName,
          clientType: rec.clientType,
          totalRequests: 0,
          successfulRequests: 0,
          clientErrorRequests: 0,
          serverErrorRequests: 0,
          totalResponseTimeMs: 0,
          averageResponseTimeMs: 0,
          endpoints: {},
          methods: {},
          firstSeen: rec.timestamp,
          lastSeen: rec.timestamp,
        };
        clientMap.set(rec.clientId, summary);
      }

      summary.totalRequests++;
      if (rec.statusCode >= 200 && rec.statusCode < 300) {
        summary.successfulRequests++;
      } else if (rec.statusCode >= 400 && rec.statusCode < 500) {
        summary.clientErrorRequests++;
      } else if (rec.statusCode >= 500) {
        summary.serverErrorRequests++;
      }

      summary.totalResponseTimeMs += rec.responseTimeMs ?? 0;
      summary.averageResponseTimeMs = Math.round(summary.totalResponseTimeMs / summary.totalRequests);

      summary.endpoints[rec.endpoint] = (summary.endpoints[rec.endpoint] || 0) + 1;
      summary.methods[rec.method] = (summary.methods[rec.method] || 0) + 1;

      if (rec.timestamp < summary.firstSeen) summary.firstSeen = rec.timestamp;
      if (rec.timestamp > summary.lastSeen) summary.lastSeen = rec.timestamp;
    }

    const summaries = Array.from(clientMap.values());
    if (options.limit && options.limit > 0) {
      return summaries.slice(0, options.limit);
    }
    return summaries;
  }

  /**
   * Resets in-memory records (useful for test isolation).
   */
  public reset(): void {
    this.inMemoryRecords = [];
  }
}

let globalUsageService: ClientUsageAccountingService | null = null;

export function getClientUsageService(): ClientUsageAccountingService {
  if (!globalUsageService) {
    globalUsageService = new ClientUsageAccountingService();
  }
  return globalUsageService;
}
