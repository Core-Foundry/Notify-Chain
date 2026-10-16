import http from 'http';
import { EventEmitter } from 'events';
import { handleArchiveRequest } from './archive-api';
import { ArchiveStore } from './../services/archive-store';
import { ArchiveService } from '../services/archive-service';

function makeRequest(method: string, url: string): http.IncomingMessage {
  const req = new EventEmitter() as http.IncomingMessage;
  req.method = method;
  req.url = url;
  return req;
}

function makeResponse(): http.ServerResponse & { statusCode: number; body: any } {
  const res = new EventEmitter() as any;
  res.statusCode = 0;
  res.body = undefined;
  res.writeHead = jest.fn((status: number) => {
    res.statusCode = status;
    return res;
  });
  res.end = jest.fn((data?: string) => {
    res.body = data ? JSON.parse(data) : undefined;
    return res;
  });
  return res;
}

function makeStore(): jest.Mocked<Pick<ArchiveStore, 'query' | 'getById'>> {
  return {
    query: jest.fn().mockResolvedValue({ records: [], total: 0, limit: 20, offset: 0, itemCount: 0, totalPages: 0 }),
    getById: jest.fn().mockResolvedValue(null),
  };
}

describe('archive-api validation', () => {
  let store: ReturnType<typeof makeStore>;

  beforeEach(() => {
    store = makeStore();
  });

  describe('GET /api/archive', () => {
    it('rejects a non-numeric limit', async () => {
      const req = makeRequest('GET', '/api/archive?limit=abc');
      const res = makeResponse();

      const handled = await handleArchiveRequest(req, res, { store: store as unknown as ArchiveStore }, 'req-1');

      expect(handled).toBe(true);
      expect(res.statusCode).toBe(400);
      expect(res.body.details[0].field).toBe('limit');
      expect(store.query).not.toHaveBeenCalled();
    });

    it('rejects a limit above the documented maximum', async () => {
      const req = makeRequest('GET', '/api/archive?limit=101');
      const res = makeResponse();

      await handleArchiveRequest(req, res, { store: store as unknown as ArchiveStore }, 'req-1');

      expect(res.statusCode).toBe(400);
      expect(store.query).not.toHaveBeenCalled();
    });

    it('rejects a negative offset', async () => {
      const req = makeRequest('GET', '/api/archive?offset=-1');
      const res = makeResponse();

      await handleArchiveRequest(req, res, { store: store as unknown as ArchiveStore }, 'req-1');

      expect(res.statusCode).toBe(400);
      expect(store.query).not.toHaveBeenCalled();
    });

    it('rejects an unknown status value', async () => {
      const req = makeRequest('GET', '/api/archive?status=BOGUS');
      const res = makeResponse();

      await handleArchiveRequest(req, res, { store: store as unknown as ArchiveStore }, 'req-1');

      expect(res.statusCode).toBe(400);
      expect(res.body.details[0].field).toBe('status');
      expect(store.query).not.toHaveBeenCalled();
    });

    it('rejects an invalid startDate', async () => {
      const req = makeRequest('GET', '/api/archive?startDate=not-a-date');
      const res = makeResponse();

      await handleArchiveRequest(req, res, { store: store as unknown as ArchiveStore }, 'req-1');

      expect(res.statusCode).toBe(400);
      expect(store.query).not.toHaveBeenCalled();
    });

    it('accepts a request with valid filters', async () => {
      const req = makeRequest('GET', '/api/archive?limit=10&offset=0&status=COMPLETED');
      const res = makeResponse();

      await handleArchiveRequest(req, res, { store: store as unknown as ArchiveStore }, 'req-1');

      expect(res.statusCode).toBe(200);
      expect(store.query).toHaveBeenCalledWith(
        expect.objectContaining({ limit: 10, offset: 0, status: 'COMPLETED' }),
      );
    });

    it('accepts a request with no filters at all', async () => {
      const req = makeRequest('GET', '/api/archive');
      const res = makeResponse();

      await handleArchiveRequest(req, res, { store: store as unknown as ArchiveStore }, 'req-1');

      expect(res.statusCode).toBe(200);
    });
  });

  describe('GET /api/archive/:id', () => {
    it('rejects a non-numeric id', async () => {
      const req = makeRequest('GET', '/api/archive/abc');
      const res = makeResponse();

      const handled = await handleArchiveRequest(req, res, { store: store as unknown as ArchiveStore }, 'req-1');

      expect(handled).toBe(true);
      expect(res.statusCode).toBe(400);
      expect(store.getById).not.toHaveBeenCalled();
    });

    it('rejects a zero or negative id', async () => {
      const req = makeRequest('GET', '/api/archive/0');
      const res = makeResponse();

      await handleArchiveRequest(req, res, { store: store as unknown as ArchiveStore }, 'req-1');

      expect(res.statusCode).toBe(400);
      expect(store.getById).not.toHaveBeenCalled();
    });

    it('accepts a valid positive integer id', async () => {
      const req = makeRequest('GET', '/api/archive/42');
      const res = makeResponse();

      await handleArchiveRequest(req, res, { store: store as unknown as ArchiveStore }, 'req-1');

      expect(store.getById).toHaveBeenCalledWith(42);
      expect(res.statusCode).toBe(404);
    });
  });

  describe('POST /api/archive/run', () => {
    it('returns 503 when the archive service is not configured', async () => {
      const req = makeRequest('POST', '/api/archive/run');
      const res = makeResponse();

      await handleArchiveRequest(req, res, { store: store as unknown as ArchiveStore, service: null }, 'req-1');

      expect(res.statusCode).toBe(503);
    });

    it('runs the archive cycle when the service is configured', async () => {
      const service = { runCycle: jest.fn().mockResolvedValue({ archived: 3 }) } as unknown as ArchiveService;
      const req = makeRequest('POST', '/api/archive/run');
      const res = makeResponse();

      await handleArchiveRequest(req, res, { store: store as unknown as ArchiveStore, service }, 'req-1');

      expect(res.statusCode).toBe(200);
      expect(res.body).toEqual({ archived: 3 });
    });
  });
});
