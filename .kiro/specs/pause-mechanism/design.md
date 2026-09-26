# Design Document: Pause Mechanism

## Overview

The pause mechanism provides administrators with an emergency control to temporarily suspend all notification operations while maintaining system stability. When activated, the system rejects all notification creation, processing, and delivery requests. The mechanism is backed by atomic state transitions, comprehensive event logging, and multi-admin support for operational flexibility.

## Architecture

### Components

1. **Pause State Manager** - Manages atomic pause/unpause transitions
2. **Authorization Service** - Validates admin permissions for pause operations
3. **Event Emission Service** - Emits pause/unpause events with admin context
4. **Guard System** - Pre-flight checks that block operations when paused
5. **Audit Log Integration** - Records all pause state transitions

### State Flow

```
Active State
    ↓
[Authorized Admin calls pause()]
    ↓
Check authorization → Check not already paused → Update state → Emit event → Audit log
    ↓
Paused State
    ↓
[All notification operations blocked]
    ↓
[Authorized Admin calls unpause()]
    ↓
Check authorization → Check currently paused → Update state → Emit event → Audit log
    ↓
Active State
```

## Components and Interfaces

### 1. Pause State Storage

**Contract Instance Storage**

```
INSTANCE_PAUSED: bool
  - Stored in contract instance storage for atomic visibility
  - Default: false
  - Accessed before any notification operation
```

### 2. Authorization Module

**Admin Registry**

```
INSTANCE_ADMIN: Address
  - Single or multiple authorized admin addresses
  - Validated via `require_auth()` for each operation
  - Can be transferred via admin authorization
```

**Permission Check**

```
require_admin(env: &Env, admin: &Address) -> Result<(), Error>
  - Verifies caller has admin permissions
  - Returns AdminUnauthorized error if caller is not admin
```

### 3. Guard Functions

**Pre-Operation Checks**

```
check_not_paused(env: &Env) -> Result<(), Error>
  - Called at the start of create(), process(), and delivery operations
  - Returns ContractPaused error if system is paused
  - Read operations (get(), query()) skip this check
```

### 4. Event Emission

**Pause Event**

```
ContractPaused {
  admin: Address,           // Who triggered the pause
  category: NotificationCategory::Admin,
  priority: NotificationPriority::High,
  timestamp: u64           // Ledger timestamp
}
```

**Unpause Event**

```
ContractUnpaused {
  admin: Address,           // Who triggered the unpause
  category: NotificationCategory::Admin,
  priority: NotificationPriority::High,
  timestamp: u64           // Ledger timestamp
}
```

Events are automatically published and appear in the audit log.

### 5. Query Interface

```
get_paused_status() -> bool
  - Public function accessible to any caller
  - Returns current pause state
  - No authorization required
```

## Data Models

### Pause State

```
PauseState {
  is_paused: bool,
  last_paused_at: Option<u64>,      // Timestamp of last pause
  last_paused_by: Option<Address>,  // Admin who last paused
  last_unpaused_at: Option<u64>,    // Timestamp of last unpause
  last_unpaused_by: Option<Address> // Admin who last unpaused
}
```

The primary `is_paused` flag is stored in contract instance storage for atomicity. The metadata fields are stored in the audit log as part of pause/unpause events.

### Error Types

```
enum Error {
  AdminUnauthorized,     // Caller lacks admin permissions
  AlreadyPaused,         // Attempt to pause when already paused
  NotPaused,             // Attempt to unpause when not paused
  ContractPaused,        // Operation blocked due to pause state
  ...
}
```

## Authorization Mechanisms

### Admin Authorization Flow

```
1. Admin calls pause(admin_address) or unpause(admin_address)
2. admin_address.require_auth() enforces signature requirement
3. require_admin() verifies caller is stored admin
4. If authorized: state updated and events emitted
5. If unauthorized: operation rejected with AdminUnauthorized error
```

### Multi-Admin Support

The system supports multiple authorized administrators through:
- Maintaining a registry of authorized admin addresses
- Allowing any registered admin to pause or unpause
- Recording which admin performed each operation in events
- Enabling emergency operations when primary admin is unavailable

## Event Emission Strategy

### Pause Event Emission

```rust
pub fn pause(env: Env, admin: Address) -> Result<(), Error> {
    admin.require_auth();
    require_admin(&env, &admin)?;
    
    // Check not already paused
    let is_paused = env.storage().instance().get(&INSTANCE_PAUSED).unwrap_or(false);
    if is_paused {
        return Err(Error::AlreadyPaused);
    }
    
    // Update state
    env.storage().instance().set(&INSTANCE_PAUSED, &true);
    
    // Emit event
    ContractPaused {
        admin: admin.clone(),
        category: NotificationCategory::Admin,
        priority: NotificationPriority::High,
    }.publish(&env);
    
    Ok(())
}
```

### Event Routing

- **Pause events** → Audit log (via automatic event publishing)
- **Pause events** → Off-chain listeners (via Stellar event stream)
- Events include admin address for compliance tracking
- Timestamps captured automatically by Soroban contract environment

### Audit Log Integration

Pause and unpause events are recorded in the audit log with:
- Event type (PauseInitiated, UnpauseInitiated)
- Admin address
- Timestamp
- Transaction hash (via Soroban)

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system—essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: Only Authorized Admins Can Pause

*For any* non-authorized address, attempting to pause SHALL result in an AdminUnauthorized error, and the pause state SHALL remain unchanged.

**Validates: Requirements 1.2, 1.3**

### Property 2: Non-Authorized Pause Attempts Are Rejected

*For any* address that is not registered as an admin, calling pause() SHALL fail with authorization error, regardless of current pause state.

**Validates: Requirements 1.2**

### Property 3: Non-Authorized Unpause Attempts Are Rejected

*For any* address that is not registered as an admin, calling unpause() SHALL fail with authorization error, regardless of current pause state.

**Validates: Requirements 1.3**

### Property 4: Notification Creation Blocked When Paused

*For any* valid notification creation parameters, when the system is paused, the create operation SHALL fail with ContractPaused error, and no notification SHALL be created.

**Validates: Requirements 2.1**

### Property 5: Notification Processing Blocked When Paused

*For any* in-flight notification, when the system is paused, all processing operations SHALL fail with ContractPaused error.

**Validates: Requirements 2.2**

### Property 6: Notification Delivery Blocked When Paused

*For any* notification ready for delivery, when the system is paused, delivery operations SHALL fail with ContractPaused error.

**Validates: Requirements 2.3**

### Property 7: Pause Operations Emit Events

*For any* successful pause operation by an authorized admin, a ContractPaused event SHALL be emitted containing the admin's address.

**Validates: Requirements 3.1, 3.3**

### Property 8: Unpause Operations Emit Events

*For any* successful unpause operation by an authorized admin, a ContractUnpaused event SHALL be emitted containing the admin's address.

**Validates: Requirements 3.2, 3.4**

### Property 9: Pause State Query Returns Accurate Boolean

*For any* moment in time, calling get_paused_status() SHALL return true if and only if a pause operation has completed more recently than an unpause operation.

**Validates: Requirements 4.2**

### Property 10: Query Function Is Publicly Accessible

*For any* address, calling get_paused_status() SHALL succeed without authorization checks.

**Validates: Requirements 4.3**

### Property 11: Concurrent Pause Attempts Have Single Winner

*For any* sequence of concurrent pause requests, exactly one SHALL succeed and the others SHALL fail with AlreadyPaused error.

**Validates: Requirements 5.1, 5.2**

### Property 12: Concurrent Unpause Attempts Have Single Winner

*For any* sequence of concurrent unpause requests, exactly one SHALL succeed and the others SHALL fail with NotPaused error.

**Validates: Requirements 5.3**

### Property 13: Pause State Transitions Are Atomic

*For any* completed pause or unpause operation, all subsequent operations SHALL immediately observe the new state without intermediate states.

**Validates: Requirements 5.4**

### Property 14: Operations Allowed After Unpause (Round Trip)

*For any* notification operation that failed while paused, after unpausing, the same operation SHALL succeed with equivalent parameters, demonstrating state restoration.

**Validates: Requirements 2.1, 2.2, 2.3**

## Error Handling

### Authorization Errors

```
Error::AdminUnauthorized
  - Triggered when caller is not registered admin
  - Propagates to caller with descriptive message
  - No state change occurs
  - Event emission skipped
```

### State Conflict Errors

```
Error::AlreadyPaused
  - Triggered when pause() called and already paused
  - Prevents duplicate pause operations
  - No state change or event emission

Error::NotPaused
  - Triggered when unpause() called and not paused
  - Prevents invalid unpause requests
  - No state change or event emission
```

### Operation Blocked Errors

```
Error::ContractPaused
  - Triggered when any notification operation attempted while paused
  - Descriptive message indicates pause state
  - Returned to caller without state changes
```

### Error Recovery

- **Retryable**: Operations blocked by ContractPaused can be retried after unpause
- **Non-retryable**: Authorization errors require admin privileges or account change
- **Idempotent**: Pause when paused or unpause when unpaused returns error without side effects

## Testing Strategy

### Unit Testing Approach

The pause mechanism requires comprehensive unit testing covering:

**Authorization Tests**
- Authorized admin can pause
- Authorized admin can unpause
- Non-authorized account cannot pause
- Non-authorized account cannot unpause
- Pause event includes correct admin address
- Unpause event includes correct admin address

**State Management Tests**
- System starts in unpaused state
- After pause, state is paused
- After unpause, state is unpaused
- Query returns accurate state
- Query works when paused
- Query works when unpaused

**Operation Blocking Tests**
- Create fails when paused with ContractPaused error
- Processing fails when paused with ContractPaused error
- Delivery fails when paused with ContractPaused error
- Read operations (get, query) work when paused
- Operations succeed after unpause

**Atomicity Tests**
- Pause when already paused returns AlreadyPaused error
- Unpause when not paused returns NotPaused error
- Events emitted on successful pause
- Events emitted on successful unpause
- Event includes admin address
- Event includes timestamp

**Concurrency Tests**
- Multiple pause requests → one succeeds, others fail
- Multiple unpause requests → one succeeds, others fail
- Pause then unpause → operations work again
- State remains consistent across transitions

### Property-Based Testing Configuration

Each correctness property SHALL be implemented as a property-based test using a suitable PBT framework for the target language:

**Test Configuration**
- Minimum 100 iterations per property test
- Random admin address generation for authorization tests
- Random notification parameters for blocking tests
- State transitions verified at each step

**Test Tag Format**

Each test SHALL include a comment referencing the design property:

```rust
// Feature: pause-mechanism, Property 4: Notification Creation Blocked When Paused
#[test]
fn test_create_fails_when_paused() { ... }
```

### Integration Testing Approach

Integration tests verify end-to-end pause/unpause behavior:

1. **Setup phase**: Initialize system with admin, create sample notifications
2. **Pause phase**: Call pause, verify operations fail
3. **Unpause phase**: Call unpause, verify operations succeed
4. **Audit phase**: Query audit log, verify pause events recorded

### Edge Cases and Error Conditions

- Double pause (already paused state)
- Double unpause (not paused state)
- Non-existent admin attempting pause
- Pause during active notification delivery
- Unpause with no prior pause
- Multiple concurrent pause/unpause operations
- Query state immediately after pause/unpause
- Empty authorization registry

