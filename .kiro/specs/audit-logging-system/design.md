# Design Document

## Overview

This design implements a comprehensive audit logging system for recording notification lifecycle events with immutability and queryability guarantees.

## Architecture

### Data Model

```typescript
interface AuditLogEntry {
  entryId: string;              // Unique identifier
  notificationId: string;       // Reference to notification
  timestamp: number;            // Unix timestamp
  eventType: EventType;         // CREATION, DELIVERY_ATTEMPT, etc.
  actor: string;                // Address or identifier
  status: 'success' | 'failure'; // Operation status
  metadata: {
    recipient?: string;
    channel?: string;
    errorReason?: string;
    retryCount?: number;
    [key: string]: any;          // Flexible for event-specific data
  };
  createdAt: number;            // When log was created
  immutable: true;              // Flag indicating immutability
}

enum EventType {
  CREATION = 'CREATION',
  DELIVERY_ATTEMPT = 'DELIVERY_ATTEMPT',
  DELIVERY_SUCCESS = 'DELIVERY_SUCCESS',
  DELIVERY_FAILURE = 'DELIVERY_FAILURE',
  ACKNOWLEDGMENT = 'ACKNOWLEDGMENT'
}
```

### Storage Strategy

1. **Primary Storage**: Database/persistent store for all audit logs
2. **Indexing**: Create indexes on notificationId, recipient, eventType, timestamp
3. **Archival**: Move logs older than retention period to archive
4. **Performance**: Use read-optimized queries for audit log retrieval

### Query Interface

```typescript
interface AuditLogQuery {
  notificationId?: string;
  recipient?: string;
  eventType?: EventType | EventType[];
  dateRange?: {
    startTime: number;
    endTime: number;
  };
  actor?: string;
  limit?: number;     // Default 100, max 1000
  offset?: number;    // For pagination
}

interface QueryResult {
  entries: AuditLogEntry[];
  total: number;
  hasMore: boolean;
}
```

### Integration Points

1. **Event Subscriber**: Log CREATION events
2. **Discord Service**: Log DELIVERY_ATTEMPT, DELIVERY_SUCCESS, DELIVERY_FAILURE
3. **Notification Expiration**: Log EXPIRATION events
4. **API Endpoints**: Provide query interface for clients

### Immutability Enforcement

- No UPDATE operations on audit logs
- DELETE only through archive/purge administrative functions
- Logs stored in append-only structure
- Database constraints to prevent modification

## Performance Considerations

- Indexes on query fields (notificationId, recipient, eventType, timestamp)
- Pagination for large queries
- Cache frequently accessed audit logs
- Archive old logs to separate storage

## Compliance and Retention

- Default retention: 365 days
- Configurable retention policy
- Audit trails for who accessed what logs
- Compliance reporting endpoints