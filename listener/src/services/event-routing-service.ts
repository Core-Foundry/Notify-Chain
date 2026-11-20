/**
 * Event-to-destination routing service.
 * 
 * Manages configurable routing of events to notification destinations,
 * supporting multiple destinations per event type with persistence and validation.
 */

import {
  EventRoutingRule,
  EventRoutingConfiguration,
  CreateRoutingRuleInput,
  CreateRoutingConfigurationInput,
  RoutingResult,
  DestinationValidationResult,
  ValidateDestinationRequest,
} from '../types/event-routing';
import { getProviderRegistry } from './provider-registry';
import logger from '../utils/logger';

/**
 * Manages event-to-destination routing configuration and resolution.
 */
export class EventRoutingService {
  private routingConfigs = new Map<string, EventRoutingConfiguration>();
  private routingRules = new Map<string, EventRoutingRule>();

  /**
   * Create or update routing configuration for a contract.
   */
  async createRoutingConfiguration(
    input: CreateRoutingConfigurationInput,
  ): Promise<EventRoutingConfiguration> {
    const now = Date.now();
    
    // Validate that destinations can be reached
    await this.validateDestinations(input.defaultDestinations, input.contractAddress);

    const config: EventRoutingConfiguration = {
      id: `routing_${input.contractAddress}_${now}`,
      contractAddress: input.contractAddress,
      defaultDestinations: input.defaultDestinations,
      enableMissingDestinationFallback: input.enableMissingDestinationFallback ?? true,
      metadata: input.metadata,
      createdAt: now,
      updatedAt: now,
    };

    this.routingConfigs.set(input.contractAddress, config);
    
    logger.info('EventRoutingService: routing configuration created', {
      contractAddress: input.contractAddress,
      defaultDestinations: input.defaultDestinations,
      configId: config.id,
    });

    return config;
  }

  /**
   * Get routing configuration for a contract.
   */
  getRoutingConfiguration(contractAddress: string): EventRoutingConfiguration | null {
    return this.routingConfigs.get(contractAddress) || null;
  }

  /**
   * Add a routing rule for a specific event type.
   */
  async addRoutingRule(
    contractAddress: string,
    input: CreateRoutingRuleInput,
  ): Promise<EventRoutingRule> {
    const config = this.getRoutingConfiguration(contractAddress);
    if (!config) {
      throw new Error(
        `No routing configuration found for contract ${contractAddress}. Create one first.`,
      );
    }

    // Validate that destinations can be reached
    await this.validateDestinations(input.destinations, contractAddress);

    const now = Date.now();
    const ruleId = `rule_${contractAddress}_${input.eventType}_${now}`;

    const rule: EventRoutingRule = {
      id: ruleId,
      eventType: input.eventType,
      destinations: input.destinations,
      enabled: input.enabled ?? true,
      priority: input.priority ?? 0,
      metadata: input.metadata,
      createdAt: now,
      updatedAt: now,
    };

    this.routingRules.set(ruleId, rule);
    config.rules.push(rule);
    config.updatedAt = now;

    logger.info('EventRoutingService: routing rule added', {
      contractAddress,
      eventType: input.eventType,
      destinations: input.destinations,
      ruleId,
    });

    return rule;
  }

  /**
   * Update an existing routing rule.
   */
  async updateRoutingRule(
    ruleId: string,
    updates: Partial<CreateRoutingRuleInput>,
  ): Promise<EventRoutingRule> {
    const rule = this.routingRules.get(ruleId);
    if (!rule) {
      throw new Error(`Routing rule not found: ${ruleId}`);
    }

    // Validate new destinations if provided
    if (updates.destinations) {
      // Find the config this rule belongs to
      const config = Array.from(this.routingConfigs.values()).find((cfg) =>
        cfg.rules.some((r) => r.id === ruleId),
      );
      if (config) {
        await this.validateDestinations(updates.destinations, config.contractAddress);
      }
    }

    const now = Date.now();

    if (updates.destinations !== undefined) {
      rule.destinations = updates.destinations;
    }
    if (updates.enabled !== undefined) {
      rule.enabled = updates.enabled;
    }
    if (updates.priority !== undefined) {
      rule.priority = updates.priority;
    }
    if (updates.metadata !== undefined) {
      rule.metadata = updates.metadata;
    }

    rule.updatedAt = now;

    logger.info('EventRoutingService: routing rule updated', {
      ruleId,
      eventType: rule.eventType,
    });

    return rule;
  }

  /**
   * Delete a routing rule.
   */
  deleteRoutingRule(ruleId: string): boolean {
    const rule = this.routingRules.get(ruleId);
    if (!rule) {
      return false;
    }

    // Remove from routing configs
    for (const config of this.routingConfigs.values()) {
      config.rules = config.rules.filter((r) => r.id !== ruleId);
      config.updatedAt = Date.now();
    }

    this.routingRules.delete(ruleId);

    logger.info('EventRoutingService: routing rule deleted', {
      ruleId,
      eventType: rule.eventType,
    });

    return true;
  }

  /**
   * Get all routing rules for a contract.
   */
  getRoutingRules(contractAddress: string): EventRoutingRule[] {
    const config = this.getRoutingConfiguration(contractAddress);
    if (!config) {
      return [];
    }
    return config.rules.filter((rule) => rule.enabled);
  }

  /**
   * Resolve destinations for an event based on routing configuration.
   * 
   * Resolution logic:
   * 1. Look for a specific rule matching the event type
   * 2. If found and enabled, use those destinations
   * 3. If not found or all destinations invalid, fall back to default destinations
   * 4. If fallback is disabled and specific destinations are invalid, return empty
   */
  async resolveDestinations(
    contractAddress: string,
    eventType: string,
  ): Promise<RoutingResult> {
    const config = this.getRoutingConfiguration(contractAddress);

    if (!config) {
      logger.warn('EventRoutingService: no routing configuration found', {
        contractAddress,
        eventType,
      });
      return {
        destinations: [],
        source: 'default',
      };
    }

    // Find matching rule (prioritize by priority field, then by creation time)
    const matchingRules = config.rules
      .filter((rule) => rule.enabled && rule.eventType === eventType)
      .sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));

    if (matchingRules.length > 0) {
      const rule = matchingRules[0];
      
      // Validate destinations are available
      const validDestinations = await this.filterValidDestinations(
        rule.destinations,
        contractAddress,
      );

      if (validDestinations.length > 0) {
        logger.debug('EventRoutingService: using specific routing rule', {
          contractAddress,
          eventType,
          ruleId: rule.id,
          destinations: validDestinations,
        });

        return {
          destinations: validDestinations,
          source: 'specific',
          appliedRuleId: rule.id,
        };
      }

      // Specific rule found but destinations invalid
      if (!config.enableMissingDestinationFallback) {
        logger.warn('EventRoutingService: specific destinations invalid and fallback disabled', {
          contractAddress,
          eventType,
          ruleId: rule.id,
          requestedDestinations: rule.destinations,
        });

        return {
          destinations: [],
          source: 'specific',
          appliedRuleId: rule.id,
        };
      }
    }

    // Fall back to default destinations
    const validDefaultDestinations = await this.filterValidDestinations(
      config.defaultDestinations,
      contractAddress,
    );

    logger.debug('EventRoutingService: using default destinations', {
      contractAddress,
      eventType,
      destinations: validDefaultDestinations,
    });

    return {
      destinations: validDefaultDestinations,
      source: 'default',
    };
  }

  /**
   * Validate that destinations are configured and can be reached.
   * Throws if any destination is invalid.
   */
  private async validateDestinations(
    destinations: string[],
    contractAddress: string,
  ): Promise<void> {
    const registry = getProviderRegistry();
    const invalidDestinations: string[] = [];

    for (const dest of destinations) {
      if (!registry.has(dest)) {
        invalidDestinations.push(dest);
      }
    }

    if (invalidDestinations.length > 0) {
      const available = registry.listIds();
      throw new Error(
        `Invalid destinations for contract ${contractAddress}: [${invalidDestinations.join(', ')}]. ` +
        `Available providers: [${available.join(', ')}]`,
      );
    }
  }

  /**
   * Filter destinations to only those that are currently valid/available.
   */
  private async filterValidDestinations(
    destinations: string[],
    contractAddress: string,
  ): Promise<string[]> {
    const registry = getProviderRegistry();
    const valid: string[] = [];

    for (const dest of destinations) {
      if (registry.has(dest)) {
        valid.push(dest);
      } else {
        logger.warn('EventRoutingService: destination provider not available', {
          contractAddress,
          destination: dest,
        });
      }
    }

    return valid;
  }

  /**
   * Validate a destination is available.
   */
  async validateDestination(
    request: ValidateDestinationRequest,
  ): Promise<DestinationValidationResult> {
    const registry = getProviderRegistry();

    if (!registry.has(request.destination)) {
      return {
        isValid: false,
        destination: request.destination,
        reason: `No provider registered for destination: ${request.destination}`,
      };
    }

    return {
      isValid: true,
      destination: request.destination,
      provider: request.destination,
    };
  }

  /**
   * Get all routing configurations (for management/debugging).
   */
  getAllConfigurations(): EventRoutingConfiguration[] {
    return Array.from(this.routingConfigs.values());
  }

  /**
   * Clear all routing configuration (primarily for testing).
   */
  clear(): void {
    this.routingConfigs.clear();
    this.routingRules.clear();
  }
}

/**
 * Module-level singleton instance.
 */
let _instance: EventRoutingService | null = null;

export function getEventRoutingService(): EventRoutingService {
  if (!_instance) {
    _instance = new EventRoutingService();
  }
  return _instance;
}

export function setEventRoutingService(instance: EventRoutingService): void {
  _instance = instance;
}

export function resetEventRoutingService(): void {
  _instance = null;
}
