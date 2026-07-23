# Signature Verification Audit

## Scope

This audit reviewed the contract-side auth workflow around AutoShare creation, membership changes, and usage reduction.

## Findings

### 1. `add_group_member` accepted unauthenticated calls

The original implementation updated a group without requiring a signer check from the group owner. That meant any caller could add members to any group if they knew the group ID.

Impact:
- Unauthorized membership changes
- Potential dilution or hijacking of payout splits
- Weak ownership enforcement for state-changing actions

Fix:
- Added `caller.require_auth()`
- Verified the caller matches the stored group creator
- Rejected changes to inactive groups

### 2. `reduce_usage` had no signer ownership gate

The original implementation let any caller decrement remaining usages. That made the usage counter easy to exhaust or skew.

Impact:
- Unauthorized usage depletion
- Possible denial of service for legitimate group owners
- No ownership binding between the action and the group

Fix:
- Added `caller.require_auth()`
- Verified the caller matches the stored group creator
- Rejected reductions for inactive groups

## Edge Cases Covered

- Unauthorized caller attempts to modify group membership
- Unauthorized caller attempts to reduce usage
- Usage reduction when no usages remain
- Membership changes on inactive groups

## Result

The contract now enforces signer ownership on the mutating paths most relevant to creation and acknowledgment-style usage updates. The added tests cover the expected failure modes and the zero-usage edge case.
