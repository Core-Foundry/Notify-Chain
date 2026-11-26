/**
 * Event-to-destination routing configuration and types.
 * 
 * Allows organizations to map event types to specific notification destinations,
 * supporting multiple destinations per event type with configurable behavior.
 */

/**
 * Destination where an event notification can be routed.
 * Examples: 'discord', 'email', 'webhook', 'telegram', 'sms'
 */
export type NotificationDestination = string;

/**
 * Routing rule for a specific event type.
 * Maps an event type to one or more destinations where notifications should be sent.
 */
export interface EventRoutingRule {
  id: string; // Unique identifier for this rule
  eventType: string; // The type of event (e.g., 'TransferEvent', 'ApprovalEvent')
  destinations: NotificationDestination[]; // Where notifications for this event should be routed
  enabled: boolean; // Whether this rule is active
  priority?: number; // Priority for conflict resolution (higher = more important)
  metadata?: Record<string, unknown>; // Additional configuration data
  createdAt: number; // Timestamp when rule was created
  updatedAt: number; // Timestamp when rule was last modified
}

/**
 * Complete routing configuration for an organization/contract.
 * Contains default behavior and event-specific routing rules.
 */
export interface EventRoutingConfiguration {
  id: string; // Unique identifier for this configuration
  contractAddress: string; // Which contract this configuration applies to
  defaultDestinations: NotificationDestination[]; // Fallback destinations for unmapped events
  rules: EventRoutingRule[]; // Event type to destination mappings
  enableMissingDestinationFallback: boolean; // Route to defaultDestinations if specific dest unavailable
  metadata?: Record<string, unknown>; // Additional configuration
  createdAt: number;
  updatedAt: number;
}

/**
 * Input for creating or updating a routing rule.
 */
export interface CreateRoutingRuleInput {
  eventType: string;
  destinations: NotificationDestination[];
  enabled?: boolean;
  priority?: number;
  metadata?: Record<string, unknown>;
}

/**
 * Input for creating or updating routing configuration.
 */
export interface CreateRoutingConfigurationInput {
  contractAddress: string;
  defaultDestinations: NotificationDestination[];
  enableMissingDestinationFallback?: boolean;
  metadata?: Record<string, unknown>;
}

/**
 * Result of routing resolution for an event.
 */
export interface RoutingResult {
  destinations: NotificationDestination[]; // Destinations where event should be sent
  source: 'specific' | 'default'; // Whether destinations came from specific rule or default
  appliedRuleId?: string; // ID of the specific rule that was applied (if applicable)
}

/**
 * Validation result for destination references.
 */
export interface DestinationValidationResult {
  isValid: boolean;
  destination: NotificationDestination;
  reason?: string; // Why it's invalid (if applicable)
  provider?: string; // Which provider handles this destination type
}

/**
 * Batch routing result for multiple events.
 */
export interface BatchRoutingResult {
  results: Map<string, RoutingResult>; // eventId -> RoutingResult
  failedEvents: Array<{
    eventId: string;
    reason: string;
  }>;
}

/**
 * Request to validate that a destination is configured and available.
 */
export interface ValidateDestinationRequest {
  destination: NotificationDestination;
  contractAddress: string;
}
