import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import {
  EventRoutingIntegration,
  getEventRoutingIntegration,
  setEventRoutingIntegration,
  resetEventRoutingIntegration,
} from './event-routing-integration';
import { EventRoutingService } from './event-routing-service';
import { ProviderRegistry } from './provider-registry';
import { setProviderRegistry } from './provider-registry';
import { DisplayEvent } from '../types/display-event';
import { NotificationProvider, DeliveryResult } from '../types/provider-capabilities';

// Mock provider
class MockProvider implements NotificationProvider {
  constructor(public id: string = 'mock-provider') {}

  readonly metadata = {
    id: this.id,
    name: `Mock ${this.id}`,
    capabilities: [],
  };

  hasCapability(): boolean {
    return true;
  }

  async deliver(): Promise<DeliveryResult> {
    return { success: true, degradedCapabilities: [] };
  }
}

describe('EventRoutingIntegration', () => {
  let integration: EventRoutingIntegration;
  let routingService: EventRoutingService;
  let mockRegistry: ProviderRegistry;

  beforeEach(() => {
    // Setup mock registry with providers
    mockRegistry = new ProviderRegistry();
    mockRegistry.register(new MockProvider('discord'));
    mockRegistry.register(new MockProvider('email'));
    mockRegistry.register(new MockProvider('webhook'));
    setProviderRegistry(mockRegistry);

    // Setup routing service
    routingService = new EventRoutingService();

    // Create integration with routing enabled
    integration = new EventRoutingIntegration({
      enableRouting: true,
      routingService,
    });
  });

  afterEach(() => {
    resetEventRoutingIntegration();
  });

  describe('getDestinationsForEvent', () => {
    let mockEvent: DisplayEvent;

    beforeEach(async () => {
      mockEvent = {
        eventId: 'event-123',
        contractAddress: 'C123456789',
        eventName: 'TransferEvent',
        ledger: 12345,
        type: 'TransferEvent',
        topic: [],
        value: 'test',
        receivedAt: Date.now(),
      };

      // Create routing configuration
      await routingService.createRoutingConfiguration({
        contractAddress: 'C123456789',
        defaultDestinations: ['discord'],
      });
    });

    it('should return destinations for a routed event', async () => {
      await routingService.addRoutingRule('C123456789', {
        eventType: 'TransferEvent',
        destinations: ['email', 'webhook'],
      });

      const destinations = await integration.getDestinationsForEvent(
        mockEvent,
        'C123456789',
      );

      expect(destinations).toEqual(['email', 'webhook']);
    });

    it('should return default destinations when no specific rule matches', async () => {
      const destinations = await integration.getDestinationsForEvent(
        mockEvent,
        'C123456789',
      );

      expect(destinations).toEqual(['discord']);
    });

    it('should return empty array when routing is disabled', async () => {
      integration.disableRoutingFeature();

      await routingService.addRoutingRule('C123456789', {
        eventType: 'TransferEvent',
        destinations: ['email'],
      });

      const destinations = await integration.getDestinationsForEvent(
        mockEvent,
        'C123456789',
      );

      expect(destinations).toEqual([]);
    });

    it('should return empty array when no configuration exists', async () => {
      const destinations = await integration.getDestinationsForEvent(
        mockEvent,
        'UNKNOWN_CONTRACT',
      );

      expect(destinations).toEqual([]);
    });

    it('should handle routing errors gracefully', async () => {
      // Create a corrupted routing config by using a bad contract address
      const destinations = await integration.getDestinationsForEvent(
        mockEvent,
        'BAD_ADDRESS',
      );

      expect(destinations).toEqual([]);
    });
  });

  describe('filterAvailableDestinations', () => {
    it('should filter to only available destinations', async () => {
      const destinations = ['discord', 'unknown', 'email', 'missing'];
      const available = await integration.filterAvailableDestinations(destinations);

      expect(available).toContain('discord');
      expect(available).toContain('email');
      expect(available).not.toContain('unknown');
      expect(available).not.toContain('missing');
    });

    it('should return empty array when all destinations are unavailable', async () => {
      const destinations = ['unknown1', 'unknown2'];
      const available = await integration.filterAvailableDestinations(destinations);

      expect(available).toEqual([]);
    });

    it('should handle empty destination list', async () => {
      const available = await integration.filterAvailableDestinations([]);

      expect(available).toEqual([]);
    });
  });

  describe('isDestinationAvailable', () => {
    it('should return true for available destination', () => {
      expect(integration.isDestinationAvailable('discord')).toBe(true);
      expect(integration.isDestinationAvailable('email')).toBe(true);
    });

    it('should return false for unavailable destination', () => {
      expect(integration.isDestinationAvailable('unknown')).toBe(false);
    });
  });

  describe('routing feature toggle', () => {
    beforeEach(() => {
      integration = new EventRoutingIntegration({
        enableRouting: false,
      });
    });

    it('should start disabled', () => {
      expect(integration.isRoutingEnabled()).toBe(false);
    });

    it('should enable routing', () => {
      integration.enableRoutingFeature();
      expect(integration.isRoutingEnabled()).toBe(true);
    });

    it('should disable routing', () => {
      integration.enableRoutingFeature();
      expect(integration.isRoutingEnabled()).toBe(true);

      integration.disableRoutingFeature();
      expect(integration.isRoutingEnabled()).toBe(false);
    });
  });

  describe('getConfiguration and getRoutingRules', () => {
    beforeEach(async () => {
      await routingService.createRoutingConfiguration({
        contractAddress: 'C123456789',
        defaultDestinations: ['discord'],
      });
    });

    it('should return configuration', () => {
      const config = integration.getConfiguration('C123456789');

      expect(config).toBeDefined();
      expect(config?.contractAddress).toBe('C123456789');
      expect(config?.defaultDestinations).toContain('discord');
    });

    it('should return routing rules', async () => {
      await routingService.addRoutingRule('C123456789', {
        eventType: 'TransferEvent',
        destinations: ['email'],
      });

      const rules = integration.getRoutingRules('C123456789');

      expect(rules).toHaveLength(1);
      expect(rules[0].eventType).toBe('TransferEvent');
    });

    it('should return null configuration for unknown contract', () => {
      const config = integration.getConfiguration('UNKNOWN');

      expect(config).toBeNull();
    });

    it('should return empty rules for unknown contract', () => {
      const rules = integration.getRoutingRules('UNKNOWN');

      expect(rules).toEqual([]);
    });
  });

  describe('singleton pattern', () => {
    it('should return same instance', () => {
      const instance1 = getEventRoutingIntegration();
      const instance2 = getEventRoutingIntegration();

      expect(instance1).toBe(instance2);
    });

    it('should allow replacing instance', () => {
      const newInstance = new EventRoutingIntegration();
      setEventRoutingIntegration(newInstance);

      expect(getEventRoutingIntegration()).toBe(newInstance);
    });

    it('should reset to null', () => {
      const before = getEventRoutingIntegration();
      resetEventRoutingIntegration();
      const after = getEventRoutingIntegration();

      expect(before).not.toBe(after);
    });
  });

  describe('integration with disabled routing', () => {
    beforeEach(async () => {
      integration = new EventRoutingIntegration({
        enableRouting: false,
        routingService,
      });

      const mockEvent: DisplayEvent = {
        eventId: 'event-123',
        contractAddress: 'C123456789',
        eventName: 'TestEvent',
        ledger: 12345,
        type: 'TestEvent',
        topic: [],
        value: 'test',
        receivedAt: Date.now(),
      };

      await routingService.createRoutingConfiguration({
        contractAddress: 'C123456789',
        defaultDestinations: ['discord'],
      });

      await routingService.addRoutingRule('C123456789', {
        eventType: 'TestEvent',
        destinations: ['email'],
      });
    });

    it('should return empty destinations when disabled', async () => {
      const mockEvent: DisplayEvent = {
        eventId: 'event-123',
        contractAddress: 'C123456789',
        eventName: 'TestEvent',
        ledger: 12345,
        type: 'TestEvent',
        topic: [],
        value: 'test',
        receivedAt: Date.now(),
      };

      const destinations = await integration.getDestinationsForEvent(
        mockEvent,
        'C123456789',
      );

      expect(destinations).toEqual([]);
    });
  });
});
