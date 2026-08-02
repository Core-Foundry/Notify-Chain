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
  const singleMatch = pathname.match(/^\/api\/archive\/(\d+)$/);
  if (req.method === 'GET' && singleMatch) {
    const id = parseInt(singleMatch[1], 10);
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
      const options = {
        limit: url.searchParams.get('limit') ? parseInt(url.searchParams.get('limit')!, 10) : undefined,
        offset: url.searchParams.get('offset') ? parseInt(url.searchParams.get('offset')!, 10) : undefined,
        status: url.searchParams.get('status') ?? undefined,
        contractAddress: url.searchParams.get('contractAddress') ?? undefined,
        startDate: url.searchParams.get('startDate') ?? undefined,
        endDate: url.searchParams.get('endDate') ?? undefined,
      };
      const result = await deps.store.query(options);
      sendOk(res, 200, result);
    } catch (err) {
      logger.error('Failed to query archive', { error: err, requestId });
      sendErr(res, 500, (err as Error).message, ErrorCode.INTERNAL_ERROR);
    }
    return true;
  }

  return false;
}
