# Implementation Plan: notification-type-filtering

## Overview

This implementation plan adds notification type metadata to emitted events for selective subscription and filtering by off-chain consumers.

## Tasks

- [ ] 1. Define NotificationType enum
  - [ ] 1.1 Create NotificationType enum in types/index.ts
    - Values: CREATION, DELIVERY, ACKNOWLEDGMENT, EXPIRATION, PAUSE, UNPAUSE
    - _Requirements: 1.2, 2.2_

  - [ ] 1.2 Export NotificationType from types module
    - Make available to all consumers
    - _Requirements: 1.2, 4.2_

- [ ] 2. Extend event structure with notification type
  - [ ] 2.1 Add notificationType field to event registry schema
    - Add to EventRegistry or similar persistent storage type
    - _Requirements: 1.1, 2.1, 2.3_

  - [ ] 2.2 Add timestamp field to event data
    - Capture when event was emitted
    - _Requirements: 1.1, 2.1_

  - [ ] 2.3 Update event validation to allow notificationType
    - Modify validateEventPayload() to accept the field
    - _Requirements: 2.1, 4.4_

- [ ] 3. Set notification type during event processing
  - [ ] 3.1 Update EventSubscriber.processEvent()
    - Determine notification type based on event context
    - Set notificationType before storing/emitting
    - _Requirements: 1.1, 1.3, 4.1_

  - [ ] 3.2 Map event characteristics to notification types
    - CREATION: When notification is created
    - DELIVERY: When notification is sent to user
    - ACKNOWLEDGMENT: When notification is acknowledged
    - EXPIRATION: When notification expires
    - PAUSE: When system is paused
    - UNPAUSE: When system is unpaused
    - _Requirements: 1.2, 4.1_

  - [ ] 3.3 Ensure notificationType is set before event registration
    - Set type in EventSubscriber before calling registry
    - _Requirements: 1.1, 1.3_

- [ ] 4. Update Discord notification service
  - [ ] 4.1 Include notification type in Discord messages
    - Add notificationType to embedded message
    - _Requirements: 1.1, 2.1_

  - [ ] 4.2 Format type display for Discord
    - Use readable format (e.g., "Creation", "Delivery")
    - _Requirements: 1.1_

- [ ] 5. Create helper functions for filtering
  - [ ] 5.1 Create filterEventsByType() utility function
    - Accept events and notification type(s)
    - Return filtered events
    - _Requirements: 4.1, 4.2, 4.3_

  - [ ] 5.2 Create isNotificationType() helper
    - Check if event matches a specific type
    - Support multiple types
    - _Requirements: 4.2, 4.3_

  - [ ] 5.3 Export filtering utilities from event-utils
    - Make available for consumer use
    - _Requirements: 4.2_

- [ ] 6. Create filtering tests
  - [ ] 6.1 Create filtering-tests.ts
    - Test each notification type is correctly identified
    - Test filtering logic with multiple types
    - Test backward compatibility
    - _Requirements: 5.1, 5.2, 5.3, 5.4_

  - [ ] 6.2 Add unit tests for each notification type
    - Test CREATION events
    - Test DELIVERY events
    - Test ACKNOWLEDGMENT events
    - Test EXPIRATION events
    - Test PAUSE/UNPAUSE events
    - _Requirements: 5.1, 5.4_

  - [ ] 6.3 Add backward compatibility tests
    - Test that old event listeners still work
    - Test that missing notificationType is handled
    - _Requirements: 3.1, 3.2, 3.3, 3.4_

  - [ ] 6.4 Add filtering logic tests
    - Test filterEventsByType() with single type
    - Test filterEventsByType() with multiple types
    - Test filtering performance
    - _Requirements: 5.1, 5.2, 5.3_

- [ ] 7. Update documentation
  - [ ] 7.1 Document notification types in API documentation
    - List all notification types
    - Explain when each type is emitted
    - _Requirements: 4.4_

  - [ ] 7.2 Add filtering examples to documentation
    - Example: Filter for creation events only
    - Example: Filter for delivery and acknowledgment
    - Example: Exclude expiration events
    - _Requirements: 4.3, 4.4_

  - [ ] 7.3 Document backward compatibility
    - Explain how old listeners work with new events
    - Provide migration guide
    - _Requirements: 3.1, 3.2, 3.3, 3.4_

- [ ] 8. Create integration tests
  - [ ] 8.1 Test end-to-end event emission with type
    - Create notification → Verify type is CREATION
    - Deliver notification → Verify type is DELIVERY
    - _Requirements: 5.1, 5.2_

  - [ ] 8.2 Test filtering in real listener scenarios
    - Subscribe to only DELIVERY events
    - Verify only DELIVERY events are processed
    - _Requirements: 4.1, 4.2, 4.3_

  - [ ] 8.3 Test multi-type subscription
    - Subscribe to CREATION and DELIVERY
    - Verify both types received
    - _Requirements: 4.2_

- [ ] 9. Performance validation
  - [ ] 9.1 Verify filtering doesn't impact event throughput
    - Benchmark event processing with/without filtering
    - _Requirements: 4.3_

  - [ ] 9.2 Verify minimal storage overhead
    - Confirm notificationType adds minimal size
    - _Requirements: 1.1_

- [ ] 10. Final testing checkpoint
  - [ ] 10.1 Run all tests
    - Ensure no regressions
    - Verify all requirements met
    - _Requirements: 5.1, 5.2, 5.3, 5.4_

  - [ ] 10.2 Verify backward compatibility
    - Test with old listener code
    - Confirm no breaking changes
    - _Requirements: 3.1, 3.2, 3.3, 3.4_

## Notes

- NotificationType is additive - no existing fields are changed
- Filtering can be done at consumer level or in listener
- Documentation should include migration guide for new filtering
- All existing listeners should continue to work without code changes
- Consider adding notificationType index for query performance