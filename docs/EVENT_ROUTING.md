# Event-to-Destination Routing

## Overview

The Event Routing system allows organizations to configure which notification destinations should receive specific types of blockchain events. Instead of all events going to the same destinations, you can create granular routing rules that map event types to specific notification channels (Discord, Email, Webhook, etc.).

## Problem Statement

Different event types may require delivery to different notification destinations. For example:
- **Transfer events** → Email + Webhook (for compliance records)
- **Approval events** → Discord (for quick team notifications)
- **Error events** → SMS + Discord (urgent alerts)

Without routing configuration, all events go to default destinations, creating unnecessary noise and missing context-specific delivery patterns.

## Architecture

### Core Components

1. **EventRoutingService** - Core service managing routing configuration and resolution
2. **EventRoutingRepository** - Database persistence layer
3. **EventRoutingIntegration** - Integration with event processing pipeline
4. **Types** - TypeScript interfaces and types for routing configuration

### Data Model

```
EventRoutingConfiguration (per contract)
├── contractAddress: string
├── defaultDestinations: string[]
├── enableMissingDestinationFallback: boolean
└── rules: EventRoutingRule[]
    ├── eventType: string
    ├── destinations: string[]
    ├── enabled: boolean
    └── priority: number
```

## Usage

### 1. Creating a Routing Configuration

```typescript
import { EventRoutingService } from './services/event-routing-service';

const routingService = new EventRoutingService();

// Create base configuration for a contract
const config = await routingService.createRoutingConfiguration({
  contractAddress: 'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAB6A',
  defaultDestinations: ['discord'], // Fallback destinations
  enableMissingDestinationFallback: true, // Route to defaults if specific dest unavailable
});
```

### 2. Adding Routing Rules

```typescript
// Route TransferEvent to email and webhook
await routingService.addRoutingRule('CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAB6A', {
  eventType: 'TransferEvent',
  destinations: ['email', 'webhook'],
  priority: 10, // Higher priority = used first when multiple rules match
  enabled: true,
});

// Route ApprovalEvent to Discord only
await routingService.addRoutingRule('CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAB6A', {
  eventType: 'ApprovalEvent',
  destinations: ['discord'],
  priority: 5,
});
```

### 3. Resolving Destinations for Events

```typescript
// When processing an event, resolve where it should be sent
const result = await routingService.resolveDestinations(
  contractAddress,
  'TransferEvent'
);

console.log(result.destinations); // ['email', 'webhook']
console.log(result.source);       // 'specific' or 'default'
console.log(result.appliedRuleId); // Which rule was applied
```

### 4. Integration with Event Processing

```typescript
import { EventRoutingIntegration } from './services/event-routing-integration';

const integration = new EventRoutingIntegration({
  enableRouting: true, // Master enable/disable flag
  logRoutingDecisions: true, // Log routing decisions for debugging
});

// In your event subscriber
const destinations = await integration.getDestinationsForEvent(event, contractAddress);

// Send notification to each destination
for (const destination of destinations) {
  await notificationProvider.deliver(destination, event);
}
```

## Routing Resolution Logic

When determining where to send an event:

1. **Look for specific rule** matching the event type
2. **If rule found and enabled:**
   - Validate destinations are available
   - If all valid, use those destinations
   - If some invalid and fallback enabled, use default destinations
   - If some invalid and fallback disabled, return empty (skip event)
3. **If no rule found:**
   - Use default destinations for the contract

### Priority Handling

When multiple rules match the same event type:
1. Sort by `priority` (descending) - higher number = higher priority
2. Use destinations from highest priority rule

## Validation

### Destination Validation

All destinations are validated to exist in the registered provider registry:

```typescript
// This will throw if 'unknown-provider' is not registered
await routingService.addRoutingRule(contractAddress, {
  eventType: 'Event',
  destinations: ['unknown-provider'], // Error: invalid provider
});

// Valid destinations can be checked
const result = await routingService.validateDestination({
  destination: 'discord',
  contractAddress,
});

console.log(result.isValid); // true
```

### Available Providers

Providers must be registered in the `ProviderRegistry`:
- `discord` - Discord webhook notifications
- `email` - Email notifications
- `webhook` - Generic HTTP webhooks
- `sms` - SMS notifications (if configured)

## Configuration Examples

### Example 1: Simple Default-Based Routing

```typescript
// All events go to Discord by default
const config = await routingService.createRoutingConfiguration({
  contractAddress: 'CONTRACT_A',
  defaultDestinations: ['discord'],
});

// Resolve any event
const result = await routingService.resolveDestinations('CONTRACT_A', 'AnyEvent');
// Result: { destinations: ['discord'], source: 'default' }
```

### Example 2: Event-Specific Routing

```typescript
// Setup contract with email default
const config = await routingService.createRoutingConfiguration({
  contractAddress: 'CONTRACT_B',
  defaultDestinations: ['email'],
});

// Override specific events
await routingService.addRoutingRule('CONTRACT_B', {
  eventType: 'CriticalEvent',
  destinations: ['discord', 'sms'],
  priority: 10,
});

// Resolution
const critical = await routingService.resolveDestinations('CONTRACT_B', 'CriticalEvent');
// Result: { destinations: ['discord', 'sms'], source: 'specific' }

const other = await routingService.resolveDestinations('CONTRACT_B', 'NormalEvent');
// Result: { destinations: ['email'], source: 'default' }
```

### Example 3: Multiple Rules with Priority

```typescript
await routingService.addRoutingRule(contractAddress, {
  eventType: 'TransferEvent',
  destinations: ['email'],
  priority: 1,
});

await routingService.addRoutingRule(contractAddress, {
  eventType: 'TransferEvent',
  destinations: ['webhook'],
  priority: 10, // Higher priority
});

// Will use webhook (higher priority)
const result = await routingService.resolveDestinations(
  contractAddress,
  'TransferEvent'
);
// Result: { destinations: ['webhook'], source: 'specific' }
```

### Example 4: Graceful Degradation

```typescript
const config = await routingService.createRoutingConfiguration({
  contractAddress: 'CONTRACT_D',
  defaultDestinations: ['discord', 'email'],
  enableMissingDestinationFallback: true, // Enable fallback
});

await routingService.addRoutingRule('CONTRACT_D', {
  eventType: 'Event',
  destinations: ['webhook', 'missing-provider'], // One doesn't exist
});

// After provider is unregistered
const result = await routingService.resolveDestinations('CONTRACT_D', 'Event');
// Result: { destinations: ['discord', 'email'], source: 'default' }
// Falls back because 'webhook' is no longer available
```

## Database Schema

Routing configuration is persisted in three tables:

### `event_routing_configurations`
- `config_id` - Unique identifier
- `contract_address` - Which contract (unique)
- `default_destinations` - JSON array of defaults
- `enable_missing_destination_fallback` - Boolean flag
- `created_at`, `updated_at` - Timestamps

### `event_routing_rules`
- `rule_id` - Unique identifier
- `config_id` - Foreign key to configuration
- `event_type` - The event type being routed
- `destinations` - JSON array of destination names
- `enabled` - Whether rule is active
- `priority` - Rule priority
- `created_at`, `updated_at` - Timestamps

### `event_routing_audit_log`
- Immutable log of all routing configuration changes
- Tracks who made changes and what changed

## API Reference

### EventRoutingService

#### `createRoutingConfiguration(input)`
Creates a new routing configuration for a contract.

**Parameters:**
- `contractAddress: string` - Stellar contract address
- `defaultDestinations: string[]` - Fallback destinations
- `enableMissingDestinationFallback?: boolean` - Default: true

**Returns:** `EventRoutingConfiguration`

**Throws:** If default destinations are invalid

---

#### `addRoutingRule(contractAddress, input)`
Adds a routing rule for a specific event type.

**Parameters:**
- `contractAddress: string` - Contract that the rule applies to
- `eventType: string` - The event type to route
- `destinations: string[]` - Where to send this event type
- `enabled?: boolean` - Default: true
- `priority?: number` - Default: 0

**Returns:** `EventRoutingRule`

**Throws:** If contract has no configuration or destinations are invalid

---

#### `resolveDestinations(contractAddress, eventType)`
Determines which destinations should receive an event.

**Parameters:**
- `contractAddress: string`
- `eventType: string`

**Returns:** `RoutingResult`
```typescript
{
  destinations: string[];     // Where to send
  source: 'specific' | 'default'; // Which rule applied
  appliedRuleId?: string;     // If 'specific', which rule
}
```

---

#### `updateRoutingRule(ruleId, updates)`
Updates an existing routing rule.

**Parameters:**
- `ruleId: string`
- `updates: Partial<CreateRoutingRuleInput>`

**Returns:** `EventRoutingRule`

---

#### `deleteRoutingRule(ruleId)`
Deletes a routing rule.

**Parameters:**
- `ruleId: string`

**Returns:** `boolean`

---

#### `getRoutingRules(contractAddress)`
Gets all enabled rules for a contract.

**Parameters:**
- `contractAddress: string`

**Returns:** `EventRoutingRule[]`

---

#### `validateDestination(request)`
Validates that a destination is available.

**Parameters:**
- `destination: string`
- `contractAddress: string`

**Returns:** `DestinationValidationResult`

---

### EventRoutingIntegration

#### `getDestinationsForEvent(event, contractAddress)`
Gets destinations for an event through the integrated routing system.

**Parameters:**
- `event: DisplayEvent`
- `contractAddress: string`

**Returns:** `Promise<string[]>`

---

#### `filterAvailableDestinations(destinations)`
Filters destinations to only those that are currently available.

**Parameters:**
- `destinations: string[]`

**Returns:** `Promise<string[]>`

---

#### `isDestinationAvailable(destination)`
Checks if a destination provider is available.

**Parameters:**
- `destination: string`

**Returns:** `boolean`

---

#### `enableRoutingFeature() / disableRoutingFeature()`
Enable or disable routing.

---

## Testing

Comprehensive test coverage is provided:

- `EventRoutingService.test.ts` - Core service tests
- `EventRoutingIntegration.test.ts` - Integration tests

Run tests:
```bash
npm test -- event-routing-service
npm test -- event-routing-integration
```

## Backward Compatibility

The routing system is:
- **Opt-in** - Disabled by default, no impact on existing systems
- **Non-breaking** - Existing code works unchanged
- **Graceful fallback** - If routing fails, events still process

## Performance Considerations

1. **Configuration Caching** - Routing configs are cached in memory after first load
2. **Provider Registry** - Provider availability is checked at configuration time
3. **Rule Sorting** - Rules sorted by priority at configuration time
4. **Minimal Overhead** - Routing lookup is O(n) where n = rules per event type (typically < 10)

## Troubleshooting

### Events not reaching expected destinations

1. Check if routing is enabled
   ```typescript
   console.log(integration.isRoutingEnabled());
   ```

2. Verify routing configuration
   ```typescript
   const config = routingService.getRoutingConfiguration(contractAddress);
   console.log(config?.defaultDestinations);
   ```

3. Check routing rules
   ```typescript
   const rules = routingService.getRoutingRules(contractAddress);
   console.log(rules);
   ```

4. Validate destinations
   ```typescript
   const result = await routingService.validateDestination({
     destination: 'discord',
     contractAddress,
   });
   console.log(result);
   ```

5. Enable routing logging
   ```typescript
   const integration = new EventRoutingIntegration({
     enableRouting: true,
     logRoutingDecisions: true,
   });
   ```

### Invalid destination error

Ensure the destination provider is registered:
```typescript
const registry = getProviderRegistry();
console.log(registry.listIds()); // List available providers
```

## Future Enhancements

Potential improvements:
- [ ] Regex pattern matching for event types
- [ ] Destination-specific transformations
- [ ] Event property-based routing conditions
- [ ] Rate limiting per destination
- [ ] A/B testing support for destinations
- [ ] ML-based intelligent routing suggestions
