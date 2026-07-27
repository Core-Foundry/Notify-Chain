import { describe, it, expect, jest } from '@jest/globals';
import { sendError, ApiError } from './api-error';
import type http from 'http';

function makeMockResponse() {
  const headers: Record<string, string> = {};
  let statusCode = 0;
  let body = '';

  const res = {
    writeHead: jest.fn((status: number, hdrs?: Record<string, string>) => {
      statusCode = status;
      if (hdrs) Object.assign(headers, hdrs);
    }),
    end: jest.fn((data: string) => {
      body = data;
    }),
    _statusCode: () => statusCode,
    _body: () => body,
    _headers: () => headers,
  } as unknown as http.ServerResponse & {
    _statusCode: () => number;
    _body: () => string;
    _headers: () => Record<string, string>;
  };

  return res;
}

describe('sendError', () => {
  it('writes the given status code', () => {
    const res = makeMockResponse();
    sendError(res, 404, 'Not found');
    expect(res._statusCode()).toBe(404);
  });

  it('sets Content-Type to application/json', () => {
    const res = makeMockResponse();
    sendError(res, 400, 'Bad request');
    expect(res._headers()['Content-Type']).toBe('application/json');
  });

  it('serialises the message into { error } shape', () => {
    const res = makeMockResponse();
    sendError(res, 400, 'Missing required field');
    expect(JSON.parse(res._body())).toEqual({ error: 'Missing required field' });
  });

  it('handles 500 internal server error', () => {
    const res = makeMockResponse();
    sendError(res, 500, 'Internal server error');
    expect(res._statusCode()).toBe(500);
    expect(JSON.parse(res._body())).toEqual({ error: 'Internal server error' });
  });

  it('handles 503 service unavailable', () => {
    const res = makeMockResponse();
    sendError(res, 503, 'Scheduler not enabled');
    expect(res._statusCode()).toBe(503);
    expect(JSON.parse(res._body())).toEqual({ error: 'Scheduler not enabled' });
  });

  it('handles 401 unauthorized', () => {
    const res = makeMockResponse();
    sendError(res, 401, 'Missing signature header');
    expect(res._statusCode()).toBe(401);
    expect(JSON.parse(res._body())).toEqual({ error: 'Missing signature header' });
  });

  it('produces valid JSON for messages containing special characters', () => {
    const res = makeMockResponse();
    sendError(res, 400, 'Field "name" must be a string');
    expect(() => JSON.parse(res._body())).not.toThrow();
    expect(JSON.parse(res._body()).error).toBe('Field "name" must be a string');
  });
});

describe('ApiError', () => {
  it('stores the status code', () => {
    const err = new ApiError(422, 'Unprocessable entity');
    expect(err.statusCode).toBe(422);
  });

  it('stores the message', () => {
    const err = new ApiError(404, 'Template not found');
    expect(err.message).toBe('Template not found');
  });

  it('is an instance of Error', () => {
    const err = new ApiError(500, 'boom');
    expect(err).toBeInstanceOf(Error);
  });

  it('has name ApiError', () => {
    const err = new ApiError(400, 'bad');
    expect(err.name).toBe('ApiError');
  });

  it('can be used in a catch block to call sendError', () => {
    const res = makeMockResponse();
    const err = new ApiError(409, 'Duplicate key');
    sendError(res, err.statusCode, err.message);
    expect(res._statusCode()).toBe(409);
    expect(JSON.parse(res._body())).toEqual({ error: 'Duplicate key' });
  });
});
