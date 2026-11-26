/**
 * Integration layer for event routing with event processing.
 * 
 * Connects the EventRoutingService to the event subscriber to ensure
 * events are routed to the correct destinations based on configuration.
 */

import { DisplayEvent } from '../types/display-event';
import { EventRoutingService, getEventRoutingService } from './event-routing-service';
import { getProviderRegistry } from './provider-registry';
import logger from '../utils/logger';

export interface EventRoutingIntegrationConfig {
  enableRouting: boolean; // Master flag to enable/disable routing
  routingService?: EventRoutingService;
  logRoutingDecisions?: boolean;
}

/**
 * Integration service that applies routing rules to events.
 */
export class EventRoutingIntegration {
  private routingService: EventRoutingService;
  private enableRouting: boolean;
  private logRoutingDecisions: boolean;

  constructor(config: EventRoutingIntegrationConfig = { enableRouting: false }) {
    this.enableRouting = config.enableRouting;
    this.logRoutingDecisions = config.logRoutingDecisions ?? false;
    this.routingService = config.routingService ?? getEventRoutingService();
  }

  /**
   * Determine which destinations should receive this event.
   * 
   * Returns the destinations based on routing configuration, or an empty array
   * if routing is disabled or no destinations are configured.
   */
  async getDestinationsForEvent(
    event: DisplayEvent,
    contractAddress: string,
  ): Promise<string[]> {
    if (!this.enableRouting) {
      if (this.logRoutingDecisions) {
        logger.debug('EventRoutingIntegration: routing disabled', {
          eventId: event.eventId,
          contractAddress,
        });
      }
      return [];
    }

    try {
      const result = await this.routingService.resolveDestinations(
        contractAddress,
        event.type,
      );

      if (this.logRoutingDecisions) {
        logger.info('EventRoutingIntegration: routing decision', {
          eventId: event.eventId,
          eventType: event.type,
          contractAddress,
          destinations: result.destinations,
          source: result.source,
          appliedRuleId: result.appliedRuleId,
        });
      }

      return result.destinations;
    } catch (error) {
      logger.error('EventRoutingIntegration: failed to resolve destinations', {
        eventId: event.eventId,
        eventType: event.type,
        contractAddress,
        error,
      });

      return [];
    }
  }

  /**
   * Filter a list of candidate destinations to only those that are currently available.
   * Useful when you want to validate destinations before attempting delivery.
   */
  async filterAvailableDestinations(destinations: string[]): Promise<string[]> {
    const registry = getProviderRegistry();
    const available: string[] = [];

    for (const dest of destinations) {
      if (registry.has(dest)) {
        available.push(dest);
      } else {
        logger.warn('EventRoutingIntegration: destination provider unavailable', {
          destination: dest,
        });
      }
    }

    return available;
  }

  /**
   * Check if a destination is available.
   */
  isDestinationAvailable(destination: string): boolean {
    return getProviderRegistry().has(destination);
  }

  /**
   * Get the routing configuration for a contract (for introspection).
   */
  getConfiguration(contractAddress: string) {
    return this.routingService.getRoutingConfiguration(contractAddress);
  }

  /**
   * Get all routing rules for a contract (for introspection).
   */
  getRoutingRules(contractAddress: string) {
    return this.routingService.getRoutingRules(contractAddress);
  }

  /**
   * Enable routing.
   */
  enableRoutingFeature(): void {
    this.enableRouting = true;
    logger.info('EventRoutingIntegration: routing enabled');
  }

  /**
   * Disable routing.
   */
  disableRoutingFeature(): void {
    this.enableRouting = false;
    logger.info('EventRoutingIntegration: routing disabled');
  }

  /**
   * Check if routing is enabled.
   */
  isRoutingEnabled(): boolean {
    return this.enableRouting;
  }
}

/**
 * Module-level singleton instance.
 */
let _instance: EventRoutingIntegration | null = null;

export function getEventRoutingIntegration(): EventRoutingIntegration {
  if (!_instance) {
    _instance = new EventRoutingIntegration();
  }
  return _instance;
}

export function setEventRoutingIntegration(instance: EventRoutingIntegration): void {
  _instance = instance;
}

export function resetEventRoutingIntegration(): void {
  _instance = null;
}
