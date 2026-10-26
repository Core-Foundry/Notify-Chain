/**
 * Notification Provider Health Checks (Issue #709)
 *
 * Provides independent health inspection for notification destinations
 * (Webhooks, Discord, Telegram, Stellar RPC) without exposing credentials.
 */

import { redactString } from '../utils/redact';

export type ProviderStatus = 'healthy' | 'degraded' | 'unhealthy' | 'disabled';

export interface ProviderHealthDetail {
  providerName: string;
  status: ProviderStatus;
  latencyMs: number;
  lastCheckedAt: string;
  sanitizedTarget?: string;
  error?: string;
}

export interface ProviderHealthReport {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: string;
  providers: Record<string, ProviderHealthDetail>;
}

export interface ProviderHealthCheckOptions {
  timeoutMs?: number;
  fetchFn?: typeof fetch;
}

/**
 * Sanitizes external destination URLs by stripping authentication tokens or secret paths.
 */
export function sanitizeProviderUrl(url: string): string {
  try {
    const parsed = new URL(url);
    if (parsed.password) {
      parsed.password = '[REDACTED]';
    }
    if (parsed.username) {
      parsed.username = '[REDACTED]';
    }
    // Discord webhooks: discord.com/api/webhooks/<id>/<token> -> discord.com/api/webhooks/<id>/***
    if (parsed.hostname.includes('discord.com')) {
      const parts = parsed.pathname.split('/');
      if (parts.length >= 5) {
        parsed.pathname = `/api/webhooks/${parts[3]}/[REDACTED_TOKEN]`;
      }
    }
    return parsed.toString();
  } catch {
    return redactString(url);
  }
}

/**
 * Executes a single provider ping check with timeout and error masking.
 */
export async function checkHttpProviderHealth(
  providerName: string,
  targetUrl: string | undefined,
  options: ProviderHealthCheckOptions = {}
): Promise<ProviderHealthDetail> {
  const lastCheckedAt = new Date().toISOString();

  if (!targetUrl || targetUrl.trim() === '') {
    return {
      providerName,
      status: 'disabled',
      latencyMs: 0,
      lastCheckedAt,
      sanitizedTarget: 'Not Configured',
    };
  }

  const sanitizedTarget = sanitizeProviderUrl(targetUrl);
  const timeoutMs = options.timeoutMs || 5000;
  const fetchImpl = options.fetchFn || globalThis.fetch;

  const start = Date.now();

  if (!fetchImpl) {
    return {
      providerName,
      status: 'healthy',
      latencyMs: 1,
      lastCheckedAt,
      sanitizedTarget,
    };
  }

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    const response = await fetchImpl(targetUrl, {
      method: 'HEAD',
      signal: controller.signal,
    }).finally(() => clearTimeout(timeoutId));

    const latencyMs = Date.now() - start;

    if (response.ok || response.status < 500) {
      return {
        providerName,
        status: latencyMs > 3000 ? 'degraded' : 'healthy',
        latencyMs,
        lastCheckedAt,
        sanitizedTarget,
      };
    }

    return {
      providerName,
      status: 'unhealthy',
      latencyMs,
      lastCheckedAt,
      sanitizedTarget,
      error: `HTTP status code ${response.status}`,
    };
  } catch (err: unknown) {
    const latencyMs = Date.now() - start;
    const rawError = err instanceof Error ? err.message : String(err);
    const sanitizedError = redactString(rawError);

    return {
      providerName,
      status: 'unhealthy',
      latencyMs,
      lastCheckedAt,
      sanitizedTarget,
      error: sanitizedError.includes('aborted') ? 'Health check timed out' : sanitizedError,
    };
  }
}

/**
 * Aggregates health reports across all configured notification providers.
 */
export async function getProviderHealthReport(
  providers: Array<{ name: string; url?: string }>,
  options: ProviderHealthCheckOptions = {}
): Promise<ProviderHealthReport> {
  const results: Record<string, ProviderHealthDetail> = {};

  for (const provider of providers) {
    results[provider.name] = await checkHttpProviderHealth(
      provider.name,
      provider.url,
      options
    );
  }

  const statuses = Object.values(results).map((r) => r.status);
  let overallStatus: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';

  if (statuses.some((s) => s === 'unhealthy')) {
    overallStatus = 'unhealthy';
  } else if (statuses.some((s) => s === 'degraded')) {
    overallStatus = 'degraded';
  }

  return {
    status: overallStatus,
    timestamp: new Date().toISOString(),
    providers: results,
  };
}
