import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import {
  EventRoutingService,
  getEventRoutingService,
  setEventRoutingService,
  resetEventRoutingService,
} from './event-routing-service';
import { ProviderRegistry } from './provider-registry';
import { setProviderRegistry } from './provider-registry';
import { NotificationProvider, DeliveryPayload, DeliveryResult } from '../types/provider-capabilities';

// Mock provider for testing
class MockNotificationProvider implements NotificationProvider {
  readonly metadata = {
    id: 'mock-provider',
    name: 'Mock Provider',
    capabilities: [],
  };

  hasCapability(): boolean {
    return true;
  }

  async deliver(): Promise<DeliveryResult> {
    return { success: true, degradedCapabilities: [] };
  }
}

describe('EventRoutingService', () => {
  let service: EventRoutingService;
  let mockRegistry: ProviderRegistry;

  beforeEach(() => {
    // Create mock registry with test providers
    mockRegistry = new ProviderRegistry();
    mockRegistry.register(new MockNotificationProvider());
    
    // Register custom mock providers
    const discordProvider: NotificationProvider = {
      metadata: { id: 'discord', name: 'Discord', capabilities: [] },
      hasCapability: () => true,
      deliver: async () => ({ success: true, degradedCapabilities: [] }),
    };
    
    const emailProvider: NotificationProvider = {
      metadata: { id: 'email', name: 'Email', capabilities: [] },
      hasCapability: () => true,
      deliver: async () => ({ success: true, degradedCapabilities: [] }),
    };
    
    const webhookProvider: NotificationProvider = {
      metadata: { id: 'webhook', name: 'Webhook', capabilities: [] },
      hasCapability: () => true,
      deliver: async () => ({ success: true, degradedCapabilities: [] }),
    };

    mockRegistry.register(discordProvider);
    mockRegistry.register(emailProvider);
    mockRegistry.register(webhookProvider);
    
    setProviderRegistry(mockRegistry);

    service = new EventRoutingService();
  });

  afterEach(() => {
    resetEventRoutingService();
    service.clear();
  });

  describe('createRoutingConfiguration', () => {
    it('should create a routing configuration', async () => {
      const config = await service.createRoutingConfiguration({
        contractAddress: 'C123456789',
        defaultDestinations: ['discord', 'email'],
      });

      expect(config.contractAddress).toBe('C123456789');
      expect(config.defaultDestinations).toEqual(['discord', 'email']);
      expect(config.enableMissingDestinationFallback).toBe(true);
      expect(config.enabled !== undefined).toBe(true);
    });

    it('should throw on invalid destinations', async () => {
      await expect(
        service.createRoutingConfiguration({
          contractAddress: 'C123456789',
          defaultDestinations: ['discord', 'invalid-provider'],
        }),
      ).rejects.toThrow('Invalid destinations');
    });

    it('should support custom metadata', async () => {
      const config = await service.createRoutingConfiguration({
        contractAddress: 'C123456789',
        defaultDestinations: ['discord'],
        metadata: { priority: 'high', owner: 'team-a' },
      });

      expect(config.metadata).toEqual({ priority: 'high', owner: 'team-a' });
    });

    it('should allow disabling fallback behavior', async () => {
      const config = await service.createRoutingConfiguration({
        contractAddress: 'C123456789',
        defaultDestinations: ['discord'],
        enableMissingDestinationFallback: false,
      });

      expect(config.enableMissingDestinationFallback).toBe(false);
    });
  });

  describe('addRoutingRule', () => {
    beforeEach(async () => {
      await service.createRoutingConfiguration({
        contractAddress: 'C123456789',
        defaultDestinations: ['discord'],
      });
    });

    it('should add a routing rule for an event type', async () => {
      const rule = await service.addRoutingRule('C123456789', {
        eventType: 'TransferEvent',
        destinations: ['email', 'webhook'],
      });

      expect(rule.eventType).toBe('TransferEvent');
      expect(rule.destinations).toEqual(['email', 'webhook']);
      expect(rule.enabled).toBe(true);
      expect(rule.priority).toBe(0);
    });

    it('should throw if configuration does not exist', async () => {
      await expect(
        service.addRoutingRule('NONEXISTENT', {
          eventType: 'TransferEvent',
          destinations: ['discord'],
        }),
      ).rejects.toThrow('No routing configuration found');
    });

    it('should support priority ordering', async () => {
      const rule1 = await service.addRoutingRule('C123456789', {
        eventType: 'TransferEvent',
        destinations: ['discord'],
        priority: 1,
      });

      const rule2 = await service.addRoutingRule('C123456789', {
        eventType: 'TransferEvent',
        destinations: ['email'],
        priority: 10,
      });

      expect(rule2.priority).toBeGreaterThan(rule1.priority);
    });

    it('should reject invalid destinations', async () => {
      await expect(
        service.addRoutingRule('C123456789', {
          eventType: 'TransferEvent',
          destinations: ['unknown-provider'],
        }),
      ).rejects.toThrow('Invalid destinations');
    });

    it('should create enabled rules by default', async () => {
      const rule = await service.addRoutingRule('C123456789', {
        eventType: 'TransferEvent',
        destinations: ['discord'],
      });

      expect(rule.enabled).toBe(true);
    });
  });

  describe('updateRoutingRule', () => {
    let ruleId: string;

    beforeEach(async () => {
      await service.createRoutingConfiguration({
        contractAddress: 'C123456789',
        defaultDestinations: ['discord'],
      });

      const rule = await service.addRoutingRule('C123456789', {
        eventType: 'TransferEvent',
        destinations: ['email'],
      });

      ruleId = rule.id;
    });

    it('should update destinations', async () => {
      const updated = await service.updateRoutingRule(ruleId, {
        destinations: ['webhook', 'email'],
      });

      expect(updated.destinations).toEqual(['webhook', 'email']);
    });

    it('should update enabled flag', async () => {
      const updated = await service.updateRoutingRule(ruleId, {
        enabled: false,
      });

      expect(updated.enabled).toBe(false);
    });

    it('should update priority', async () => {
      const updated = await service.updateRoutingRule(ruleId, {
        priority: 5,
      });

      expect(updated.priority).toBe(5);
    });

    it('should throw on nonexistent rule', async () => {
      await expect(
        service.updateRoutingRule('NONEXISTENT', { enabled: false }),
      ).rejects.toThrow('Routing rule not found');
    });

    it('should reject invalid destinations in update', async () => {
      await expect(
        service.updateRoutingRule(ruleId, {
          destinations: ['invalid-provider'],
        }),
      ).rejects.toThrow('Invalid destinations');
    });
  });

  describe('deleteRoutingRule', () => {
    let ruleId: string;

    beforeEach(async () => {
      await service.createRoutingConfiguration({
        contractAddress: 'C123456789',
        defaultDestinations: ['discord'],
      });

      const rule = await service.addRoutingRule('C123456789', {
        eventType: 'TransferEvent',
        destinations: ['email'],
      });

      ruleId = rule.id;
    });

    it('should delete a routing rule', () => {
      const deleted = service.deleteRoutingRule(ruleId);
      expect(deleted).toBe(true);

      const rules = service.getRoutingRules('C123456789');
      expect(rules).toHaveLength(0);
    });

    it('should return false for nonexistent rule', () => {
      const deleted = service.deleteRoutingRule('NONEXISTENT');
      expect(deleted).toBe(false);
    });
  });

  describe('resolveDestinations', () => {
    beforeEach(async () => {
      await service.createRoutingConfiguration({
        contractAddress: 'C123456789',
        defaultDestinations: ['discord'],
      });
    });

    it('should return default destinations when no rule matches', async () => {
      const result = await service.resolveDestinations('C123456789', 'UnknownEvent');

      expect(result.destinations).toEqual(['discord']);
      expect(result.source).toBe('default');
      expect(result.appliedRuleId).toBeUndefined();
    });

    it('should return specific destinations when rule matches', async () => {
      await service.addRoutingRule('C123456789', {
        eventType: 'TransferEvent',
        destinations: ['email', 'webhook'],
      });

      const result = await service.resolveDestinations('C123456789', 'TransferEvent');

      expect(result.destinations).toEqual(['email', 'webhook']);
      expect(result.source).toBe('specific');
      expect(result.appliedRuleId).toBeDefined();
    });

    it('should respect rule priority', async () => {
      await service.addRoutingRule('C123456789', {
        eventType: 'TransferEvent',
        destinations: ['email'],
        priority: 1,
      });

      await service.addRoutingRule('C123456789', {
        eventType: 'TransferEvent',
        destinations: ['webhook'],
        priority: 10,
      });

      const result = await service.resolveDestinations('C123456789', 'TransferEvent');

      expect(result.destinations).toEqual(['webhook']);
    });

    it('should ignore disabled rules', async () => {
      const rule = await service.addRoutingRule('C123456789', {
        eventType: 'TransferEvent',
        destinations: ['email'],
      });

      await service.updateRoutingRule(rule.id, { enabled: false });

      const result = await service.resolveDestinations('C123456789', 'TransferEvent');

      expect(result.destinations).toEqual(['discord']);
      expect(result.source).toBe('default');
    });

    it('should fall back to default when specific destinations unavailable', async () => {
      await service.addRoutingRule('C123456789', {
        eventType: 'TransferEvent',
        destinations: ['email'],
        enabled: true,
      });

      // Unregister email provider
      mockRegistry.unregister('email');

      const result = await service.resolveDestinations('C123456789', 'TransferEvent');

      expect(result.destinations).toEqual(['discord']);
      expect(result.source).toBe('default');
    });

    it('should return empty destinations when fallback disabled and rule destinations invalid', async () => {
      const config = service.getRoutingConfiguration('C123456789')!;
      config.enableMissingDestinationFallback = false;

      await service.addRoutingRule('C123456789', {
        eventType: 'TransferEvent',
        destinations: ['email'],
      });

      // Unregister email provider
      mockRegistry.unregister('email');

      const result = await service.resolveDestinations('C123456789', 'TransferEvent');

      expect(result.destinations).toEqual([]);
      expect(result.source).toBe('specific');
    });

    it('should handle missing configuration gracefully', async () => {
      const result = await service.resolveDestinations('UNKNOWN_CONTRACT', 'SomeEvent');

      expect(result.destinations).toEqual([]);
      expect(result.source).toBe('default');
    });
  });

  describe('getRoutingRules', () => {
    beforeEach(async () => {
      await service.createRoutingConfiguration({
        contractAddress: 'C123456789',
        defaultDestinations: ['discord'],
      });
    });

    it('should return all enabled rules for a contract', async () => {
      await service.addRoutingRule('C123456789', {
        eventType: 'TransferEvent',
        destinations: ['email'],
      });

      await service.addRoutingRule('C123456789', {
        eventType: 'ApprovalEvent',
        destinations: ['webhook'],
      });

      const rules = service.getRoutingRules('C123456789');

      expect(rules).toHaveLength(2);
      expect(rules.map((r) => r.eventType)).toContain('TransferEvent');
      expect(rules.map((r) => r.eventType)).toContain('ApprovalEvent');
    });

    it('should exclude disabled rules', async () => {
      const rule = await service.addRoutingRule('C123456789', {
        eventType: 'TransferEvent',
        destinations: ['email'],
      });

      await service.updateRoutingRule(rule.id, { enabled: false });

      const rules = service.getRoutingRules('C123456789');

      expect(rules).toHaveLength(0);
    });

    it('should return empty array for unknown contract', () => {
      const rules = service.getRoutingRules('UNKNOWN_CONTRACT');

      expect(rules).toEqual([]);
    });
  });

  describe('validateDestination', () => {
    it('should validate available destination', async () => {
      const result = await service.validateDestination({
        destination: 'discord',
        contractAddress: 'C123456789',
      });

      expect(result.isValid).toBe(true);
      expect(result.provider).toBe('discord');
    });

    it('should reject unavailable destination', async () => {
      const result = await service.validateDestination({
        destination: 'unknown-channel',
        contractAddress: 'C123456789',
      });

      expect(result.isValid).toBe(false);
      expect(result.reason).toContain('No provider registered');
    });
  });

  describe('getAllConfigurations', () => {
    it('should return all configurations', async () => {
      await service.createRoutingConfiguration({
        contractAddress: 'C111',
        defaultDestinations: ['discord'],
      });

      await service.createRoutingConfiguration({
        contractAddress: 'C222',
        defaultDestinations: ['email'],
      });

      const configs = service.getAllConfigurations();

      expect(configs).toHaveLength(2);
      expect(configs.map((c) => c.contractAddress)).toContain('C111');
      expect(configs.map((c) => c.contractAddress)).toContain('C222');
    });
  });

  describe('singleton pattern', () => {
    it('should return same instance from getEventRoutingService', () => {
      const service1 = getEventRoutingService();
      const service2 = getEventRoutingService();

      expect(service1).toBe(service2);
    });

    it('should allow replacing the instance', () => {
      const newService = new EventRoutingService();
      setEventRoutingService(newService);

      const retrieved = getEventRoutingService();

      expect(retrieved).toBe(newService);
    });

    it('should reset to null', () => {
      resetEventRoutingService();
      const service1 = getEventRoutingService();
      const service2 = getEventRoutingService();

      expect(service1).toBe(service2);
      expect(service1).toBeDefined();
    });
  });

  describe('edge cases and error handling', () => {
    beforeEach(async () => {
      await service.createRoutingConfiguration({
        contractAddress: 'C123456789',
        defaultDestinations: ['discord'],
      });
    });

    it('should handle empty destination arrays', async () => {
      const result = await service.resolveDestinations('C123456789', 'SomeEvent');

      // Should return default destinations
      expect(result.destinations).toEqual(['discord']);
    });

    it('should handle multiple rules with same event type', async () => {
      const rule1 = await service.addRoutingRule('C123456789', {
        eventType: 'TransferEvent',
        destinations: ['email'],
        priority: 5,
      });

      const rule2 = await service.addRoutingRule('C123456789', {
        eventType: 'TransferEvent',
        destinations: ['webhook'],
        priority: 10,
      });

      const result = await service.resolveDestinations('C123456789', 'TransferEvent');

      // Should use higher priority rule
      expect(result.destinations).toEqual(['webhook']);
      expect(result.appliedRuleId).toBe(rule2.id);
    });

    it('should preserve configuration through updates', async () => {
      const configBefore = service.getRoutingConfiguration('C123456789')!;

      const rule = await service.addRoutingRule('C123456789', {
        eventType: 'TransferEvent',
        destinations: ['email'],
      });

      const configAfter = service.getRoutingConfiguration('C123456789')!;

      expect(configAfter.rules).toHaveLength(1);
      expect(configBefore.id).toBe(configAfter.id);
    });
  });
});
