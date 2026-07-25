# Issue #138 — Practical API examples

Status: Completed

## Description

Create practical examples demonstrating common API workflows.

## Tasks
- Add request examples.
- Add response examples.
- Cover authentication flows.
- Include troubleshooting tips.

## Acceptance Criteria
- Examples are functional.
- Common workflows are documented.
- Contributors can test endpoints easily.

## Resolution
Implemented in `listener/API.md` with request and response examples, authentication flow documentation, and troubleshooting guidance.

---

# Issue #183 — Comprehensive API reference guide

Status: Completed

## Description

Developers integrating with NotifyChain need a single source of truth for API endpoints, request payloads, response structures, and smart contract events.

Create a comprehensive reference guide to improve developer onboarding and integration speed.

## Tasks
- Document all public API endpoints.
- Document request and response schemas.
- Document emitted contract events.
- Include example requests and responses.
- Add authentication requirements.
- Add versioning guidelines.

## Acceptance Criteria
- Developers can integrate without reviewing source code.
- Event payloads are documented accurately.
- Examples are tested and verified.
- Documentation remains synchronized with current APIs.

## Resolution
Implemented in `listener/API.md` and related documentation, and this file now reflects the completed status for both issue entries.

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




---

# Issue #168

Description

Users with large notification histories need an efficient way to locate specific notifications.

Introduce a search experience supporting metadata, sender names, transaction hashes, and notification identifiers.

Tasks
Create backend search endpoints.
Add indexed database queries.
Build frontend search interface.
Support partial matching.
Add pagination.
Display empty-state messaging.

Acceptance Criteria
Search returns relevant results.
Response times remain performant.
Pagination functions correctly.
Search works across supported notification metadata.

Contributor Guidelines
git checkout -b feature/notification-search
