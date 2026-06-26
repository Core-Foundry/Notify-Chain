# Issue #217

Description

Organizations should be able to schedule notifications for future delivery rather than sending them immediately.

Tasks
Design scheduling schema.
Create scheduling APIs.
Implement background processing.
Handle timezone conversions.
Add automated tests.

Acceptance Criteria
Scheduled notifications are delivered at the correct time.
Timezones are handled correctly.
Failed schedules are logged.
Tests cover edge cases.

Contributor Guidelines
git checkout -b feature/notification-scheduling-service

---

# Issue #223

Description

Ensure NotifyChain contracts behave consistently across all supported blockchain networks.

Tasks
Create network-specific test configurations.
Run deployment tests.
Validate event emissions.
Compare contract behavior.

Acceptance Criteria
Tests pass on supported networks.
Event outputs remain consistent.
Reports are generated automatically.

Contributor Guidelines
git checkout -b test/cross-network-compatibility