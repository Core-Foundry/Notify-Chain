import type { IncomingMessage, ServerResponse } from 'http';
import type { URL } from 'url';
import { validateContentType } from '../middleware/content-type';
import {
  InvalidLedgerRangeError,
  type LedgerRangeBackfillController,
} from '../services/ledger-range-backfill';
import { ErrorCode, sendErr, sendOk } from '../utils/response';
import logger from '../utils/logger';

export const BACKFILL_ROUTE = '/api/admin/backfill';
export const BACKFILL_STATUS_ROUTE = '/api/admin/backfill/status';

export interface BackfillApiOptions {
  controller: LedgerRangeBackfillController | null;
  apiKeys?: Array<{ key: string; name?: string }>;
  requestId?: string;
}

export function isBackfillRoute(pathname: string): boolean {
  return pathname === BACKFILL_ROUTE || pathname === BACKFILL_STATUS_ROUTE;
}

/**
 * Operator-facing routes for the controlled ledger range backfill (#1165).
 *
 * POST /api/admin/backfill          { "startLedger": 100, "endLedger": 200 }
 * GET  /api/admin/backfill/status   current progress / last result
 *
 * Returns true when the request was handled (including asynchronous responses
 * started by this function), false when the caller should continue routing.
 */
export async function handleBackfillRequest(
  req: IncomingMessage,
  res: ServerResponse,
  url: URL,
  options: BackfillApiOptions,
): Promise<boolean> {
  if (!isBackfillRoute(url.pathname)) return false;

  if (!options.controller) {
    sendErr(res, 503, 'Ledger range backfill is not enabled', ErrorCode.SERVICE_UNAVAILABLE);
    return true;
  }

  if (options.apiKeys && options.apiKeys.length > 0) {
    const header = req.headers['x-api-key'];
    const provided = Array.isArray(header) ? header[0] : header;
    if (!options.apiKeys.some((key) => key.key === provided)) {
      sendErr(res, 401, 'Unauthorized', ErrorCode.UNAUTHORIZED);
      return true;
    }
  }

  if (req.method === 'GET' && url.pathname === BACKFILL_STATUS_ROUTE) {
    sendOk(res, 200, options.controller.getState());
    return true;
  }

  if (req.method === 'POST' && url.pathname === BACKFILL_ROUTE) {
    if (!validateContentType(req, res, ['application/json'])) return true;

    let rawBody = '';
    req.on('data', (chunk) => {
      rawBody += chunk;
    });
    req.on('end', () => {
      void (async () => {
        try {
          let parsed: unknown;
          try {
            parsed = JSON.parse(rawBody);
          } catch {
            sendErr(res, 400, 'Invalid JSON body', ErrorCode.BAD_REQUEST);
            return;
          }

          const body = (parsed ?? {}) as Record<string, unknown>;
          const asLedger = (value: unknown): unknown =>
            typeof value === 'string' && /^\d+$/.test(value.trim()) ? Number(value.trim()) : value;
          const startLedger = asLedger(
            body.startLedger ?? body.fromLedger ?? url.searchParams.get('startLedger'),
          );
          const endLedger = asLedger(
            body.endLedger ?? body.toLedger ?? url.searchParams.get('endLedger'),
          );

          const result = await options.controller!.run(startLedger, endLedger);
          sendOk(res, 200, result);
        } catch (error) {
          if (error instanceof InvalidLedgerRangeError) {
            sendErr(res, 400, error.message, ErrorCode.BAD_REQUEST, error.issues);
            return;
          }
          logger.error('Ledger range backfill failed', {
            requestId: options.requestId,
            error,
          });
          sendErr(
            res,
            500,
            error instanceof Error ? error.message : 'Backfill failed',
            ErrorCode.INTERNAL_ERROR,
          );
        }
      })();
    });
    return true;
  }

  return false;
}
