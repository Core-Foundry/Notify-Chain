/**
 * Tests for the canonical webhook response classifier (issue #643).
 *
 * Covers representative HTTP status codes for each category, plus the error
 * classifier used for network / timeout failures.
 */

import { describe, it, expect } from '@jest/globals';
import {
  classifyWebhookError,
  classifyWebhookStatus,
  isRetryableStatus,
} from './webhook-response-classifier';

describe('classifyWebhookStatus', () => {
  it.each([200, 201, 202, 204, 299])('classifies HTTP %i as success', (status) => {
    expect(classifyWebhookStatus(status)).toBe('success');
  });

  it.each([429, 500, 501, 502, 503, 504, 507])('classifies HTTP %i as retryable', (status) => {
    expect(classifyWebhookStatus(status)).toBe('retryable');
  });

  it.each([100, 301, 302, 400, 401, 403, 404, 408, 418, 422])(
    'classifies HTTP %i as permanent',
    (status) => {
      expect(classifyWebhookStatus(status)).toBe('permanent');
    },
  );
});

describe('classifyWebhookError', () => {
  it('treats network errors as retryable', () => {
    expect(classifyWebhookError(new Error('ECONNREFUSED'))).toBe('retryable');
  });

  it('treats request timeouts (AbortError) as retryable', () => {
    const abort = new Error('The operation was aborted');
    abort.name = 'AbortError';
    expect(classifyWebhookError(abort)).toBe('retryable');
  });

  it('treats an absent error as permanent', () => {
    expect(classifyWebhookError(undefined)).toBe('permanent');
    expect(classifyWebhookError(null)).toBe('permanent');
  });
});

describe('isRetryableStatus', () => {
  it('mirrors classifyWebhookStatus for representative codes', () => {
    expect(isRetryableStatus(429)).toBe(true);
    expect(isRetryableStatus(503)).toBe(true);
    expect(isRetryableStatus(200)).toBe(false);
    expect(isRetryableStatus(404)).toBe(false);
  });
});
