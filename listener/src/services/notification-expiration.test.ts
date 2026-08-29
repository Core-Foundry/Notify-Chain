import * as StellarSDK from '@stellar/stellar-sdk';
import { NotificationExpirationService } from './notification-expiration';
import { ExpirationConfig } from '../types';
import logger from '../utils/logger';

jest.mock('../utils/logger', () => ({
  __esModule: true,
  default: {
    warn: jest.fn(),
    info: jest.fn(),
    error: jest.fn(),
  },
}));

const mockLogger = logger as jest.Mocked<typeof logger>;

describe('NotificationExpirationService', () => {
  const DEFAULT_EXPIRATION_MS = 24 * 60 * 60 * 1000; // 24 hours
  const NOW = Date.now();

  let service: NotificationExpirationService;
  let config: ExpirationConfig;

  beforeEach(() => {
    jest.clearAllMocks();
    config = {
      defaultExpirationMs: DEFAULT_EXPIRATION_MS,
      enabled: true,
    };
    service = new NotificationExpirationService(config);
  });

  describe('isExpired()', () => {
    it('should return false for recently received events', () => {
      const event: StellarSDK.rpc.Api.EventResponse = {
        id: 'event-1',
        type: 'contract',
        ledger: 100,
        ledgerClosedAt: new Date().toISOString(),
        contractId: 'test-contract',
        contractSequenceNumber: '1',
        txHash: 'hash',
        txIndex: 0,
        eventIndex: 0,
        topic: ['topic'],
        value: { type: 'i128', b64: 'value' },
        inSuccessfulContractInvocation: true,
        createdAt: new Date().toISOString(),
        receivedAt: NOW,
      };

      const result = service.isExpired(event);
      expect(result).toBe(false);
    });

    it('should return true for expired events', () => {
      const expiredTime = NOW - (DEFAULT_EXPIRATION_MS + 1000); // 1 second past expiration
      const event: StellarSDK.rpc.Api.EventResponse = {
        id: 'event-expired',
        type: 'contract',
        ledger: 100,
        ledgerClosedAt: new Date().toISOString(),
        contractId: 'test-contract',
        contractSequenceNumber: '1',
        txHash: 'hash',
        txIndex: 0,
        eventIndex: 0,
        topic: ['topic'],
        value: { type: 'i128', b64: 'value' },
        inSuccessfulContractInvocation: true,
        createdAt: new Date().toISOString(),
        receivedAt: expiredTime,
      };

      const result = service.isExpired(event);
      expect(result).toBe(true);
    });

    it('should return false for events at exact expiration boundary', () => {
      const boundaryTime = NOW - DEFAULT_EXPIRATION_MS;
      const event: StellarSDK.rpc.Api.EventResponse = {
        id: 'event-boundary',
        type: 'contract',
        ledger: 100,
        ledgerClosedAt: new Date().toISOString(),
        contractId: 'test-contract',
        contractSequenceNumber: '1',
        txHash: 'hash',
        txIndex: 0,
        eventIndex: 0,
        topic: ['topic'],
        value: { type: 'i128', b64: 'value' },
        inSuccessfulContractInvocation: true,
        createdAt: new Date().toISOString(),
        receivedAt: boundaryTime,
      };

      const result = service.isExpired(event);
      // At exact boundary, should not be expired (> not >=)
      expect(result).toBe(false);
    });

    it('should return false when expiration is disabled', () => {
      const disabledConfig: ExpirationConfig = {
        defaultExpirationMs: DEFAULT_EXPIRATION_MS,
        enabled: false,
      };
      const disabledService = new NotificationExpirationService(disabledConfig);

      const expiredTime = NOW - (DEFAULT_EXPIRATION_MS + 1000);
      const event: StellarSDK.rpc.Api.EventResponse = {
        id: 'event-old',
        type: 'contract',
        ledger: 100,
        ledgerClosedAt: new Date().toISOString(),
        contractId: 'test-contract',
        contractSequenceNumber: '1',
        txHash: 'hash',
        txIndex: 0,
        eventIndex: 0,
        topic: ['topic'],
        value: { type: 'i128', b64: 'value' },
        inSuccessfulContractInvocation: true,
        createdAt: new Date().toISOString(),
        receivedAt: expiredTime,
      };

      const result = disabledService.isExpired(event);
      expect(result).toBe(false);
    });
  });

  describe('shouldProcess()', () => {
    it('should return true for valid (non-expired) events', () => {
      const event: StellarSDK.rpc.Api.EventResponse = {
        id: 'event-valid',
        type: 'contract',
        ledger: 100,
        ledgerClosedAt: new Date().toISOString(),
        contractId: 'test-contract',
        contractSequenceNumber: '1',
        txHash: 'hash',
        txIndex: 0,
        eventIndex: 0,
        topic: ['topic'],
        value: { type: 'i128', b64: 'value' },
        inSuccessfulContractInvocation: true,
        createdAt: new Date().toISOString(),
        receivedAt: NOW,
      };

      const result = service.shouldProcess(event);
      expect(result).toBe(true);
      expect(mockLogger.warn).not.toHaveBeenCalled();
    });

    it('should return false for expired events', () => {
      const expiredTime = NOW - (DEFAULT_EXPIRATION_MS + 1000);
      const event: StellarSDK.rpc.Api.EventResponse = {
        id: 'event-old',
        type: 'contract',
        ledger: 100,
        ledgerClosedAt: new Date().toISOString(),
        contractId: 'test-contract',
        contractSequenceNumber: '1',
        txHash: 'hash',
        txIndex: 0,
        eventIndex: 0,
        topic: ['topic'],
        value: { type: 'i128', b64: 'value' },
        inSuccessfulContractInvocation: true,
        createdAt: new Date().toISOString(),
        receivedAt: expiredTime,
      };

      const result = service.shouldProcess(event);
      expect(result).toBe(false);
      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Event skipped due to expiration',
        expect.objectContaining({
          eventId: 'event-old',
        })
      );
    });

    it('should return true when expiration is disabled', () => {
      const disabledConfig: ExpirationConfig = {
        defaultExpirationMs: DEFAULT_EXPIRATION_MS,
        enabled: false,
      };
      const disabledService = new NotificationExpirationService(disabledConfig);

      const expiredTime = NOW - (DEFAULT_EXPIRATION_MS + 1000);
      const event: StellarSDK.rpc.Api.EventResponse = {
        id: 'event-old',
        type: 'contract',
        ledger: 100,
        ledgerClosedAt: new Date().toISOString(),
        contractId: 'test-contract',
        contractSequenceNumber: '1',
        txHash: 'hash',
        txIndex: 0,
        eventIndex: 0,
        topic: ['topic'],
        value: { type: 'i128', b64: 'value' },
        inSuccessfulContractInvocation: true,
        createdAt: new Date().toISOString(),
        receivedAt: expiredTime,
      };

      const result = disabledService.shouldProcess(event);
      expect(result).toBe(true);
    });

    it('should include eventType in log when provided', () => {
      const expiredTime = NOW - (DEFAULT_EXPIRATION_MS + 1000);
      const event: StellarSDK.rpc.Api.EventResponse = {
        id: 'event-typed',
        type: 'contract',
        ledger: 100,
        ledgerClosedAt: new Date().toISOString(),
        contractId: 'test-contract',
        contractSequenceNumber: '1',
        txHash: 'hash',
        txIndex: 0,
        eventIndex: 0,
        topic: ['topic'],
        value: { type: 'i128', b64: 'value' },
        inSuccessfulContractInvocation: true,
        createdAt: new Date().toISOString(),
        receivedAt: expiredTime,
      };

      service.shouldProcess(event, 'notification_scheduled');
      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Event skipped due to expiration',
        expect.objectContaining({
          eventType: 'notification_scheduled',
        })
      );
    });
  });

  describe('getExpirationTime()', () => {
    it('should return default expiration time when no event type provided', () => {
      const result = service.getExpirationTime();
      expect(result).toBe(DEFAULT_EXPIRATION_MS);
    });

    it('should return default expiration when event type has no override', () => {
      const result = service.getExpirationTime('unknown_event');
      expect(result).toBe(DEFAULT_EXPIRATION_MS);
    });

    it('should return per-event-type expiration when available', () => {
      const perEventConfig: ExpirationConfig = {
        defaultExpirationMs: DEFAULT_EXPIRATION_MS,
        perEventTypeExpiration: {
          'notification_scheduled': 60 * 60 * 1000, // 1 hour
          'notification_revoked': 5 * 60 * 1000, // 5 minutes
        },
        enabled: true,
      };
      const serviceWithPerType = new NotificationExpirationService(perEventConfig);

      expect(serviceWithPerType.getExpirationTime('notification_scheduled')).toBe(
        60 * 60 * 1000
      );
      expect(serviceWithPerType.getExpirationTime('notification_revoked')).toBe(
        5 * 60 * 1000
      );
    });

    it('should fall back to default when event type not in per-type map', () => {
      const perEventConfig: ExpirationConfig = {
        defaultExpirationMs: DEFAULT_EXPIRATION_MS,
        perEventTypeExpiration: {
          'notification_scheduled': 60 * 60 * 1000,
        },
        enabled: true,
      };
      const serviceWithPerType = new NotificationExpirationService(perEventConfig);

      const result = serviceWithPerType.getExpirationTime('unknown_type');
      expect(result).toBe(DEFAULT_EXPIRATION_MS);
    });

    it('should handle empty per-event-type map', () => {
      const perEventConfig: ExpirationConfig = {
        defaultExpirationMs: DEFAULT_EXPIRATION_MS,
        perEventTypeExpiration: {},
        enabled: true,
      };
      const serviceWithPerType = new NotificationExpirationService(perEventConfig);

      const result = serviceWithPerType.getExpirationTime('any_type');
      expect(result).toBe(DEFAULT_EXPIRATION_MS);
    });

    it('should handle undefined per-event-type map', () => {
      const perEventConfig: ExpirationConfig = {
        defaultExpirationMs: DEFAULT_EXPIRATION_MS,
        enabled: true,
      };
      const serviceWithPerType = new NotificationExpirationService(perEventConfig);

      const result = serviceWithPerType.getExpirationTime('any_type');
      expect(result).toBe(DEFAULT_EXPIRATION_MS);
    });
  });

  describe('Configuration management', () => {
    it('should get current config', () => {
      const result = service.getConfig();
      expect(result).toEqual(config);
      expect(result.defaultExpirationMs).toBe(DEFAULT_EXPIRATION_MS);
      expect(result.enabled).toBe(true);
    });

    it('should update config at runtime', () => {
      const newConfig: ExpirationConfig = {
        defaultExpirationMs: 60 * 60 * 1000, // 1 hour
        enabled: false,
      };

      service.setConfig(newConfig);
      const result = service.getConfig();
      expect(result).toEqual(newConfig);
      expect(result.defaultExpirationMs).toBe(60 * 60 * 1000);
      expect(result.enabled).toBe(false);
    });

    it('should apply new config to expiration checks', () => {
      const expiredTime = NOW - (DEFAULT_EXPIRATION_MS + 1000);
      const event: StellarSDK.rpc.Api.EventResponse = {
        id: 'event-reconfig',
        type: 'contract',
        ledger: 100,
        ledgerClosedAt: new Date().toISOString(),
        contractId: 'test-contract',
        contractSequenceNumber: '1',
        txHash: 'hash',
        txIndex: 0,
        eventIndex: 0,
        topic: ['topic'],
        value: { type: 'i128', b64: 'value' },
        inSuccessfulContractInvocation: true,
        createdAt: new Date().toISOString(),
        receivedAt: expiredTime,
      };

      // Should be expired with initial config
      expect(service.shouldProcess(event)).toBe(false);

      // Disable expiration
      service.setConfig({
        defaultExpirationMs: DEFAULT_EXPIRATION_MS,
        enabled: false,
      });

      // Should now process
      expect(service.shouldProcess(event)).toBe(true);
    });
  });

  describe('edge cases', () => {
    it('should handle very long expiration times', () => {
      const veryLongConfig: ExpirationConfig = {
        defaultExpirationMs: 365 * 24 * 60 * 60 * 1000, // 1 year
        enabled: true,
      };
      const longService = new NotificationExpirationService(veryLongConfig);

      const event: StellarSDK.rpc.Api.EventResponse = {
        id: 'event-long',
        type: 'contract',
        ledger: 100,
        ledgerClosedAt: new Date().toISOString(),
        contractId: 'test-contract',
        contractSequenceNumber: '1',
        txHash: 'hash',
        txIndex: 0,
        eventIndex: 0,
        topic: ['topic'],
        value: { type: 'i128', b64: 'value' },
        inSuccessfulContractInvocation: true,
        createdAt: new Date().toISOString(),
        receivedAt: NOW - (24 * 60 * 60 * 1000), // 1 day old
      };

      const result = longService.shouldProcess(event);
      expect(result).toBe(true);
    });

    it('should handle very short expiration times', () => {
      const shortConfig: ExpirationConfig = {
        defaultExpirationMs: 1000, // 1 second
        enabled: true,
      };
      const shortService = new NotificationExpirationService(shortConfig);

      const event: StellarSDK.rpc.Api.EventResponse = {
        id: 'event-short',
        type: 'contract',
        ledger: 100,
        ledgerClosedAt: new Date().toISOString(),
        contractId: 'test-contract',
        contractSequenceNumber: '1',
        txHash: 'hash',
        txIndex: 0,
        eventIndex: 0,
        topic: ['topic'],
        value: { type: 'i128', b64: 'value' },
        inSuccessfulContractInvocation: true,
        createdAt: new Date().toISOString(),
        receivedAt: NOW - 2000, // 2 seconds old
      };

      const result = shortService.shouldProcess(event);
      expect(result).toBe(false);
    });

    it('should handle zero expiration time (instant expiration)', () => {
      const zeroConfig: ExpirationConfig = {
        defaultExpirationMs: 0,
        enabled: true,
      };
      const zeroService = new NotificationExpirationService(zeroConfig);

      const recentEvent: StellarSDK.rpc.Api.EventResponse = {
        id: 'event-zero',
        type: 'contract',
        ledger: 100,
        ledgerClosedAt: new Date().toISOString(),
        contractId: 'test-contract',
        contractSequenceNumber: '1',
        txHash: 'hash',
        txIndex: 0,
        eventIndex: 0,
        topic: ['topic'],
        value: { type: 'i128', b64: 'value' },
        inSuccessfulContractInvocation: true,
        createdAt: new Date().toISOString(),
        receivedAt: NOW,
      };

      // Even recent events should be expired with zero expiration
      const result = zeroService.shouldProcess(recentEvent);
      expect(result).toBe(false);
    });
  });

  describe('default expiration behavior (Requirement 2.1)', () => {
    it('should use default 24-hour expiration when no per-type config', () => {
      const defaultConfig: ExpirationConfig = {
        defaultExpirationMs: DEFAULT_EXPIRATION_MS,
        enabled: true,
      };
      const defaultService = new NotificationExpirationService(defaultConfig);

      const expiredTime = NOW - (DEFAULT_EXPIRATION_MS + 1000);
      const event: StellarSDK.rpc.Api.EventResponse = {
        id: 'event-default',
        type: 'contract',
        ledger: 100,
        ledgerClosedAt: new Date().toISOString(),
        contractId: 'test-contract',
        contractSequenceNumber: '1',
        txHash: 'hash',
        txIndex: 0,
        eventIndex: 0,
        topic: ['topic'],
        value: { type: 'i128', b64: 'value' },
        inSuccessfulContractInvocation: true,
        createdAt: new Date().toISOString(),
        receivedAt: expiredTime,
      };

      expect(defaultService.shouldProcess(event)).toBe(false);
    });
  });

  describe('per-event-type expiration (Requirement 2.3)', () => {
    it('should apply per-event-type expiration correctly', () => {
      const perTypeConfig: ExpirationConfig = {
        defaultExpirationMs: DEFAULT_EXPIRATION_MS,
        perEventTypeExpiration: {
          'fast_event': 5 * 60 * 1000, // 5 minutes
          'slow_event': 7 * 24 * 60 * 60 * 1000, // 7 days
        },
        enabled: true,
      };
      const perTypeService = new NotificationExpirationService(perTypeConfig);

      const eventTime = NOW - (10 * 60 * 1000); // 10 minutes ago

      // Fast event should be expired (only 5 min TTL)
      const fastEvent: StellarSDK.rpc.Api.EventResponse = {
        id: 'fast-event',
        type: 'contract',
        ledger: 100,
        ledgerClosedAt: new Date().toISOString(),
        contractId: 'test-contract',
        contractSequenceNumber: '1',
        txHash: 'hash',
        txIndex: 0,
        eventIndex: 0,
        topic: ['topic'],
        value: { type: 'i128', b64: 'value' },
        inSuccessfulContractInvocation: true,
        createdAt: new Date().toISOString(),
        receivedAt: eventTime,
      };

      // Slow event should not be expired (7 day TTL)
      const slowEvent: StellarSDK.rpc.Api.EventResponse = {
        id: 'slow-event',
        type: 'contract',
        ledger: 100,
        ledgerClosedAt: new Date().toISOString(),
        contractId: 'test-contract',
        contractSequenceNumber: '1',
        txHash: 'hash',
        txIndex: 0,
        eventIndex: 0,
        topic: ['topic'],
        value: { type: 'i128', b64: 'value' },
        inSuccessfulContractInvocation: true,
        createdAt: new Date().toISOString(),
        receivedAt: eventTime,
      };

      expect(perTypeService.shouldProcess(fastEvent, 'fast_event')).toBe(false);
      expect(perTypeService.shouldProcess(slowEvent, 'slow_event')).toBe(true);
    });
  });

  describe('disabling expiration (Requirement 4.2)', () => {
    it('should allow disabling expiration via configuration', () => {
      const disabledConfig: ExpirationConfig = {
        defaultExpirationMs: DEFAULT_EXPIRATION_MS,
        enabled: false,
      };
      const disabledService = new NotificationExpirationService(disabledConfig);

      const veryOldTime = NOW - (365 * 24 * 60 * 60 * 1000); // 1 year ago
      const event: StellarSDK.rpc.Api.EventResponse = {
        id: 'ancient-event',
        type: 'contract',
        ledger: 100,
        ledgerClosedAt: new Date().toISOString(),
        contractId: 'test-contract',
        contractSequenceNumber: '1',
        txHash: 'hash',
        txIndex: 0,
        eventIndex: 0,
        topic: ['topic'],
        value: { type: 'i128', b64: 'value' },
        inSuccessfulContractInvocation: true,
        createdAt: new Date().toISOString(),
        receivedAt: veryOldTime,
      };

      // Should process even though event is extremely old
      const result = disabledService.shouldProcess(event);
      expect(result).toBe(true);
    });
  });
});
