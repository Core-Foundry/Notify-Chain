# API Credential Rotation Audit

## Scope

Reviewed the TaskBounty API credential registry for overlapping active keys, rotation workflow, and audit logging.

## Findings

### 1. Multiple active credentials are supported

Organizations can register a new credential before revoking the old one, which keeps existing integrations working during migration.

### 2. Rotation history is logged

Every rotation writes an immutable audit entry with the old credential ID, new credential ID, actor, reason, and timestamp.

### 3. Revocation preserves continuity

When a credential is revoked, another active credential is promoted to primary if one exists, so service does not need to pause for rotations.

## Edge Cases Covered

- Duplicate active fingerprints are rejected
- Rotating a missing or inactive key is rejected
- Revocation on the final key leaves no active primary
- Active-key lookups continue working across rotation

## Result

API credential rotation now supports zero-downtime key changes and maintains a usable audit trail.
