# Design Document

## Overview

This design adds notification type metadata to emitted events, allowing off-chain consumers to selectively filter and subscribe to specific notification categories.

## Architecture

### Event Structure Enhancement

```typescript
// Old Event (still valid)
interface NotificationEvent {
  id: string;
  contractAddress: string;
  ledger: number;
  type: string;
  topic: string[];
  value?: StellarSDK.xdr.ScVal;
  txHash: string;
}

// New Event (with notification type)
interface NotificationEventWithType extends NotificationEvent {
  notificationType: NotificationType;
  timestamp: number;
}

enum NotificationType {
  CREATION = "Creation",
  DELIVERY = "Delivery",
  ACKNOWLEDGMENT = "Acknowledgment",
  EXPIRATION = "Expiration",
  PAUSE = "Pause",
  UNPAUSE = "Unpause"
}
```

### Integration Points

1. **Event Registry** - Store notification type metadata
2. **Event Subscriber** - Set type before processing
3. **Discord Service** - Include type in notifications
4. **Event Utils** - Helper functions for type management

### Implementation Strategy

1. Add NotificationType enum
2. Extend EventResponse type with notificationType field
3. Update event processing to set type
4. Update listeners to parse and filter by type
5. Ensure backward compatibility

## Backward Compatibility

- New field is additive only (no breaking changes)
- Old listeners will ignore notificationType field
- New listeners can work with or without the field
- Event structure validation remains flexible

## Filtering Examples

```typescript
// Filter for creation events only
if (event.notificationType === NotificationType.CREATION) {
  handleCreation(event);
}

// Filter for delivery and acknowledgment
if ([NotificationType.DELIVERY, NotificationType.ACKNOWLEDGMENT].includes(event.notificationType)) {
  handleDeliveryOrAcknowledgment(event);
}

// Filter out expiration events
if (event.notificationType !== NotificationType.EXPIRATION) {
  processEvent(event);
}
```

## Data Model Updates

```typescript
interface EventRegistry {
  eventId: string;
  contractAddress: string;
  eventName: string;
  ledger: number;
  type: string;
  topic: string[];
  value?: StellarSDK.xdr.ScVal;
  txHash: string;
  notificationType: NotificationType;  // NEW
  timestamp: number;                    // NEW
}
```