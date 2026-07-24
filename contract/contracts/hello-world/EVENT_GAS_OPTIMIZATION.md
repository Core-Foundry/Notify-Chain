# Event Gas Optimization

This commit optimizes event emissions by removing redundant timestamp fields that can be derived from ledger metadata.

## Changes Made

### 1. `AuditRecordAppended` Event
- **Removed**: `timestamp` field
- **Rationale**: The timestamp of event emission is already available in the ledger metadata for every event
- **Savings**: ~8 bytes per event

### 2. `NotificationRevoked` Event
- **Removed**: `revoked_at` field
- **Rationale**: The timestamp of revocation is already available in the ledger metadata for the event
- **Savings**: ~8 bytes per event

## Files Modified

1. `src/base/events.rs`:
   - Updated `AuditRecordAppended` to remove timestamp field
   - Updated `NotificationRevoked` to remove revoked_at field
   - Added comments explaining the gas optimization rationale

2. `src/autoshare_logic.rs`:
   - Updated `append_audit_record` to remove timestamp from event emission
   - Updated `revoke_notification` to remove revoked_at from event emission

## Notes

- The `AuditRecord` stored in contract state still retains the `timestamp` field for on-chain audit purposes
- All existing tests pass (no test changes required as we only modified event emission, not stored state)
- Off-chain consumers can still obtain the timestamp from the ledger transaction metadata

## Verification

These changes follow the gas optimization best practice of avoiding redundant data in event emissions, since:
1. Every event already has a timestamp in the ledger context
2. Storing redundant data in events increases gas costs without providing additional value
3. The changes maintain backward compatibility for all other event fields
