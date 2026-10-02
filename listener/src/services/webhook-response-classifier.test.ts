/**
 * Tests for the shared webhook response classifier (issue #643).
 *
 * Covers representative HTTP status codes for each category plus the
 * error-takes-precedence rule and the retryable predicate.
 */

import { describe, it, expect } from '@jest/globals';
import {
  classifyWebhookResponse,
  isRetryableClassification,
  RETRYABLE_STATUS_CODES,
} from './webhook-response-classifier';

describe('classifyWebhookResponse', () => {
  describe('success (2xx)', () => {
    it.each([200, 201, 202, 204, 299])('classifies HTTP %i as success', (status) => {
      expect(classifyWebhookResponse({ statusCode: status })).toBe('success');
    });
  });

  describe('retryable', () => {
    it.each([500, 501, 502, 503, 504, 599])(
      'classifies server error HTTP %i as retryable',
      (status) => {
        expect(classifyWebhookResponse({ statusCode: status })).toBe('retryable');
      },
    );

    it.each([...RETRYABLE_STATUS_CODES])(
      'classifies transient HTTP %i as retryable',
      (status) => {
        expect(classifyWebhookResponse({ statusCode: status })).toBe('retryable');
      },
    );

    it('classifies a network error (no status) as retryable', () => {
      expect(classifyWebhookResponse({ error: new Error('ECONNRESET') })).toBe('retryable');
    });

    it('classifies a timeout (AbortError) as retryable', () => {
      const error = new Error('The operation was aborted');
      error.name = 'AbortError';
      expect(classifyWebhookResponse({ error })).toBe('retryable');
    });

    it('classifies a non-Error rejection as retryable', () => {
      expect(classifyWebhookResponse({ error: 'string rejection' })).toBe('retryable');
    });
  });

  describe('permanent', () => {
    it.each([400, 401, 403, 404, 405, 409, 410, 418, 422, 451])(
      'classifies client error HTTP %i as permanent',
      (status) => {
        expect(classifyWebhookResponse({ statusCode: status })).toBe('permanent');
      },
    );

    it.each([301, 302, 304])('classifies redirect HTTP %i as permanent', (status) => {
      expect(classifyWebhookResponse({ statusCode: status })).toBe('permanent');
    });

    it('classifies a missing status with no error as permanent', () => {
      expect(classifyWebhookResponse({})).toBe('permanent');
    });
  });

  describe('precedence', () => {
    it('an error takes precedence over any status code', () => {
      expect(
        classifyWebhookResponse({ statusCode: 500, error: new Error('boom') }),
      ).toBe('retryable');
    });
  });

  describe('isRetryableClassification', () => {
    it('is true only for the retryable category', () => {
      expect(isRetryableClassification('retryable')).toBe(true);
      expect(isRetryableClassification('success')).toBe(false);
      expect(isRetryableClassification('permanent')).toBe(false);
    });
  });
});
