# Implementation Plan: notification-expiration

## Overview

This implementation plan adds expiration support to prevent outdated notifications from being processed or delivered.

## Tasks

- [ ] 1. Add expiration configuration to types
  - [ ] 1.1 Add ExpirationConfig interface to Config type
  - [ ] 1.2 Add expiresAt field to AppCleanupConfig if applicable
  - _Requirements: 1.1, 4.1, 4.2_

- [ ] 2. Create NotificationExpirationService
  - [ ] 2.1 Create src/services/notification-expiration.ts
  - [ ] 2.2 Implement isExpired() method
  - [ ] 2.3 Implement shouldProcess() method
  - [ ] 2.4 Implement getExpirationTime() method
  - _Requirements: 2.1, 2.2, 2.3_

- [ ] 3. Update EventSubscriber to check expiration
  - [ ] 3.1 Integrate NotificationExpirationService in EventSubscriber
  - [ ] 3.2 Add expiration check in shouldProcessEvent()
  - [ ] 3.3 Log when notifications are skipped due to expiration
  - _Requirements: 2.1, 2.2, 2.3_

- [ ] 4. Add unit tests
  - [ ] 4.1 Create notification-expiration.test.ts
  - [ ] 4.2 Test isExpired() with past time
  - [ ] 4.3 Test isExpired() with future time
  - [ ] 4.4 Test shouldProcess() returns false for expired
  - [ ] 4.5 Test shouldProcess() returns true for valid
  - [ ] 4.6 Test default expiration behavior
  - [ ] 4.7 Test per-event-type expiration
  - _Requirements: 3.1, 3.2, 3.3, 3.4_

- [ ] 5. Update config schema if needed
  - [ ] 5.1 Add expiration to Config interface
  - [ ] 5.2 Update .env.example with expiration settings
  - _Requirements: 4.1, 4.2, 4.3_

## Notes

- Default expiration: 24 hours (86400000 ms)
- Check expiration after event validation but before notification sending
- Log skipped notifications with "expired" reason
- Support disabling expiration via config for backward compatibility