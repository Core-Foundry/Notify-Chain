# Design Document

## Overview

This design implements notification expiration for the Notify-Chain listener. Notifications will store an expiration timestamp and the processing pipeline will check and skip expired notifications.

## Architecture

### Components

1. **NotificationExpirationService** - Core service for checking expiration
2. **ExpirationConfig** - Configuration for expiration settings
3. **Event Registry Update** - Store expiration with events

### Data Model

```
NotificationExpiration {
  createdAt: number (timestamp)
  expiresAt: number (timestamp)
}

EventStore extends with expiration {
  ...existing fields
  expiresAt?: number (optional - if not set, uses default)
}
```

## Implementation Details

### 1. Expiration Service

```typescript
interface ExpirationConfig {
  defaultExpirationMs: number;  // Default 24 hours
  perEventTypeExpiration: Record<string, number>;
  enabled: boolean;             // If false, no expiration checks
}

class NotificationExpirationService {
  constructor(config: ExpirationConfig)
  
  isExpired(event: EventResponse): boolean
  shouldProcess(event: EventResponse): boolean
  getExpirationTime(eventType?: string): number
}
```

### 2. Integration Points

- **EventSubscriber.shouldProcessEvent()** - Add expiration check
- **DiscordNotificationService** - Check expiration before sending
- **Config** - Add expiration configuration options

### 3. Configuration

```typescript
interface Config {
  // ... existing fields
  expiration?: {
    defaultExpirationMs: number;
    perEventTypeExpiration: Record<string, number>;
    enabled: boolean;
  };
}
```

## Default Values

- `defaultExpirationMs`: 24 * 60 * 60 * 1000 (24 hours)
- `enabled`: true

## Testing Strategy

1. Unit tests for NotificationExpirationService
2. Integration tests for expiration in EventSubscriber
3. Edge cases: null expiration, very long expiration, past expiration