/**
 * Archive API route handler.
 *
 * Mounted into events-server.ts and handles:
 *   GET  /api/archive              – paginated list of archived notifications
 *   GET  /api/archive/:id          – single archived record by archive PK
 *   POST /api/archive/run          – trigger an on-demand archive cycle (admin)
 *
 * All endpoints return JSON using the standardised response envelope
 * (Issue #385):  { success: true, data: … }  /  { success: false, error: … }
 */
import http from 'http';
import { ArchiveStore } from '../services/archive-store';
import { ArchiveService } from '../services/archive-service';
import logger from '../utils/logger';
import { NotificationStatus } from '../types/scheduled-notification';
import {
  InputValidator,
  ValidationError,
  isOneOf,
  parseOptionalDateParam,
  parseOptionalIntParam,
  validationErrorBody,
} from '../utils/validation';
import { sendOk, sendErr, ErrorCode } from '../utils/response';

export interface ArchiveApiHandlerDeps {
  store: ArchiveStore;
  service?: ArchiveService | null;
}

/**
 * Try to handle an archive API request.
 * Returns `true` if the request was handled (so the caller can `return`),
 * `false` if it was not an archive route.
 */
export async function handleArchiveRequest(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  deps: ArchiveApiHandlerDeps,
  requestId: string,
): Promise<boolean> {
  const url = new URL(req.url ?? '/', 'http://localhost');
  const { pathname } = url;

  // POST /api/archive/run  – trigger on-demand cycle
  if (req.method === 'POST' && pathname === '/api/archive/run') {
    if (!deps.service) {
      sendErr(res, 503, 'Archive service not enabled', ErrorCode.SERVICE_UNAVAILABLE);
      return true;
    }
    logger.info('Handling POST /api/archive/run', { requestId });
    try {
      const result = await deps.service.runCycle();
      sendOk(res, 200, result);
    } catch (err) {
      logger.error('Archive run failed', { error: err, requestId });
      sendErr(res, 500, (err as Error).message, ErrorCode.INTERNAL_ERROR);
    }
    return true;
  }

  // GET /api/archive/:id
  const singleMatch = pathname.match(/^\/api\/archive\/([^/]+)$/);
  if (req.method === 'GET' && singleMatch) {
    const id = parseInt(singleMatch[1], 10);
    if (!Number.isInteger(id) || id <= 0) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'id must be a positive integer' }));
      return true;
    }
    logger.info('Handling GET /api/archive/:id', { requestId, id });
    try {
      const record = await deps.store.getById(id);
      if (!record) {
        sendErr(res, 404, 'Archived record not found', ErrorCode.NOT_FOUND);
        return true;
      }
      sendOk(res, 200, record);
    } catch (err) {
      logger.error('Failed to fetch archive record', { error: err, requestId, id });
      sendErr(res, 500, (err as Error).message, ErrorCode.INTERNAL_ERROR);
    }
    return true;
  }

  // GET /api/archive
  if (req.method === 'GET' && pathname === '/api/archive') {
    logger.info('Handling GET /api/archive', { requestId });
    try {
      const limit = parseOptionalIntParam(url.searchParams.get('limit'), 'limit', { min: 1, max: 100 });
      const offset = parseOptionalIntParam(url.searchParams.get('offset'), 'offset', { min: 0 });
      const status = url.searchParams.get('status') ?? undefined;
      const startDate = parseOptionalDateParam(url.searchParams.get('startDate'), 'startDate');
      const endDate = parseOptionalDateParam(url.searchParams.get('endDate'), 'endDate');

      const v = new InputValidator();
      if (status !== undefined) {
        v.check(
          isOneOf(status, Object.values(NotificationStatus)),
          'status',
          `must be one of: ${Object.values(NotificationStatus).join(', ')}`,
        );
      }
      v.throwIfInvalid();

      const options = {
        limit,
        offset,
        status,
        contractAddress: url.searchParams.get('contractAddress') ?? undefined,
        startDate,
        endDate,
      };
      const result = await deps.store.query(options);
      sendOk(res, 200, result);
    } catch (err) {
      if (err instanceof ValidationError) {
        logger.warn('Archive query rejected', { requestId, error: err.message });
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(validationErrorBody(err)));
        return true;
      }
      logger.error('Failed to query archive', { error: err, requestId });
      sendErr(res, 500, (err as Error).message, ErrorCode.INTERNAL_ERROR);
    }
    return true;
  }

  return false;
}
