# Requirements Document

## Introduction

This document captures the formal requirements for three independent improvements to the Notify-Chain repository. The improvements address a credential-management gap in the dashboard, introduce gas-consumption tracking for the AutoShare Soroban contract, and expand the Rust test suite with subscription edge-case coverage.

Each requirement group is independently deliverable and can be merged as a separate pull request.

---

## Glossary

- **AutoShare Contract**: The Soroban/Rust smart contract located in `contract/contracts/hello-world/`.
- **Dashboard**: The React/Vite frontend located in `dashboard/`.
- **Listener**: The Node.js/TypeScript off-chain event listener located in `listener/`.
- **Gas Snapshot**: A JSON file containing baseline CPU instruction and memory byte counts for measured contract functions.
- **Budget API**: The Soroban testutils `env.budget()` interface that exposes `cpu_insns_consumed()` and `mem_bytes_consumed()` after a contract call.
- **Group**: An AutoShare subscription group identified by a `BytesN<32>` ID; has `usage_count` (remaining) and `total_usages_paid` (cumulative) fields.
- **Topup**: A call to `topup_subscription` that increases a group's `usage_count` and `total_usages_paid` by `additional_usages`.
- **Reduce**: A call to `reduce_usage` that decrements a group's `usage_count` by 1.
- **CI**: The GitHub Actions continuous integration pipeline defined in `.github/workflows/ci.yml`.

---

## Requirements

### Requirement 1: Prevent Accidental `.env` Commits in the Dashboard

**User Story:** As a contributor, I want the dashboard directory to exclude `.env` files from version control, so that I cannot accidentally commit secrets by running a standard `git add .`.

#### Acceptance Criteria

1. THE Dashboard `.gitignore` SHALL contain `.env` as an entry so that a file named `.env` created in the `dashboard/` directory is not tracked by Git.
2. THE Dashboard `.gitignore` SHALL contain `.env.local` and `.env.*.local` as entries to cover common Vite-flavored environment file variants.

---

### Requirement 2: Complete the Listener `.env.example`

**User Story:** As an operator setting up a new Notify-Chain deployment, I want the listener's example environment file to document every variable the listener reads, so that I do not have to read TypeScript source code to find missing configuration keys.

#### Acceptance Criteria

1. THE `listener/.env.example` SHALL contain a documented entry for `DISCORD_WEBHOOK_ID` that explains it is the numeric webhook identifier required alongside `DISCORD_WEBHOOK_URL`.
2. THE `listener/.env.example` SHALL contain a documented entry for `RATE_LIMIT_ENABLED` with a default value of `true` and a description of its effect.
3. THE `listener/.env.example` SHALL contain a documented entry for `RATE_LIMIT_WINDOW_MS` with a default value of `60000` and a unit annotation (milliseconds).
4. THE `listener/.env.example` SHALL contain a documented entry for `RATE_LIMIT_MAX_REQUESTS` with a default value of `60` and a description.
5. THE `listener/.env.example` SHALL contain a documented entry for `RATE_LIMIT_CLIENT_OVERRIDES` with a default value of `{}` and a JSON-format example showing the per-client override schema.

---

### Requirement 3: Add a Configuration Reference to the Root README

**User Story:** As a new contributor, I want a single place in the repository to find every environment variable for both the listener and the dashboard, so that I can configure my local development environment without reading multiple source files.

#### Acceptance Criteria

1. THE root `README.md` SHALL contain a section headed `## Configuration / Environment Variables`.
2. WITHIN the Configuration section, THE `README.md` SHALL document all environment variables read by the Listener, including each variable's name, type, default value, and a short description.
3. WITHIN the Configuration section, THE `README.md` SHALL document all environment variables read by the Dashboard, including each variable's name, type, default value, and a short description.
4. WHEN a variable has no default (i.e., it is required), THE `README.md` SHALL mark it as required rather than listing a default.

---

### Requirement 4: Gas Snapshot Test Module

**User Story:** As a contract developer, I want automated tests that measure the CPU instruction and memory byte cost of critical contract functions, so that I have a reproducible performance baseline.

#### Acceptance Criteria

1. THE AutoShare Contract SHALL have a test module at `contract/contracts/hello-world/src/tests/gas_snapshot_test.rs` that measures gas usage using the Soroban Budget API.
2. THE gas snapshot test module SHALL measure `cpu_insns_consumed()` and `mem_bytes_consumed()` for the `create` function under the baseline scenario (1 group, 10 usages, mock token, no members).
3. THE gas snapshot test module SHALL measure `cpu_insns_consumed()` and `mem_bytes_consumed()` for the `topup_subscription` function under the baseline scenario (existing group, 10 additional usages, same token).
4. THE gas snapshot test module SHALL measure `cpu_insns_consumed()` and `mem_bytes_consumed()` for the `update_members` function under the baseline scenario (group with 3 members replacing an empty list).
5. THE gas snapshot test module SHALL measure `cpu_insns_consumed()` and `mem_bytes_consumed()` for the `withdraw` function under the baseline scenario (admin withdraws 100 tokens to a recipient).
6. WHEN a gas snapshot test runs, THE test SHALL assert that `cpu_insns_consumed() > 0` and `mem_bytes_consumed() > 0`, confirming that measurement is active.
7. THE gas snapshot test module SHALL print each measurement to stdout in the format `FUNCTION: cpu=NNN mem=NNN` so that CI scripts can parse the values.
8. THE `lib.rs` test module block SHALL register the gas snapshot test module with `#[path = "../tests/gas_snapshot_test.rs"] mod gas_snapshot_test;`.

---

### Requirement 5: Gas Snapshot Baseline File

**User Story:** As a CI engineer, I want a machine-readable JSON file that records the baseline gas costs, so that the regression gate has a stable reference to compare against.

#### Acceptance Criteria

1. THE repository SHALL contain a gas snapshot file at `contract/contracts/hello-world/gas-snapshots/autoshare.json`.
2. THE snapshot file SHALL contain a top-level `"version"` field set to `1`.
3. THE snapshot file SHALL contain a `"functions"` object with entries for `"create"`, `"topup_subscription"`, `"update_members"`, and `"withdraw"`.
4. EACH function entry in the snapshot file SHALL contain `"cpu_insns"` and `"mem_bytes"` numeric fields and a `"description"` string field.
5. WHEN the snapshot values are zero (initial skeleton), THE CI regression gate SHALL skip comparison and emit a warning rather than failing.

---

### Requirement 6: CI Gas Regression Gate

**User Story:** As a maintainer, I want CI to block merges that increase any function's gas cost by more than 10 %, so that performance regressions are caught before they reach the main branch.

#### Acceptance Criteria

1. THE `.github/workflows/ci.yml` SHALL contain a step in the `rust` job that re-runs only the gas snapshot tests after the main `cargo test` step.
2. WHEN the gas regression step runs and the snapshot file contains non-zero baselines, THE CI step SHALL parse the printed measurements and compare each value against the corresponding baseline.
3. IF any measured `cpu_insns` or `mem_bytes` value exceeds its snapshot baseline by more than 10 %, THEN THE CI step SHALL exit with a non-zero status code and print which function exceeded its budget.
4. IF the snapshot file contains only zero baseline values, THEN THE CI step SHALL print a warning and exit with status zero (skip regression check).
5. THE CI regression gate step SHALL use only standard Unix tools (`jq`, `awk`, `bash`) available on the `ubuntu-latest` runner without additional installation steps.

---

### Requirement 7: Gas Usage Documentation

**User Story:** As a developer unfamiliar with Soroban resource accounting, I want a human-readable document that explains what each function costs and how to update the baselines, so that I can reason about the contract's on-chain economics.

#### Acceptance Criteria

1. THE repository SHALL contain a `GAS_USAGE.md` file at the repository root.
2. THE `GAS_USAGE.md` SHALL contain a section explaining Soroban CPU instruction and memory byte metering in plain language.
3. THE `GAS_USAGE.md` SHALL contain a table of the four measured functions listing their baseline `cpu_insns`, `mem_bytes`, and the scenario used for measurement.
4. THE `GAS_USAGE.md` SHALL contain instructions for how to update the snapshot (run the gas snapshot tests with `--nocapture`, copy printed values into `autoshare.json`).
5. THE `GAS_USAGE.md` SHALL document the 10 % regression tolerance policy.

---

### Requirement 8: Duplicate Create Error-Type Test

**User Story:** As a contract developer, I want a test that verifies the exact error type returned when `create` is called with a duplicate group ID, so that regressions in error classification are caught.

#### Acceptance Criteria

1. THE test suite SHALL contain a test named `test_duplicate_create_error_type` in `subscription_edge_cases_test.rs` that calls `create` twice with the same `BytesN<32>` ID.
2. WHEN `create` is called with a duplicate ID, THE test SHALL assert that the call panics (corresponding to `Error::AlreadyExists`).

---

### Requirement 9: Topup on Non-Existent Group Test

**User Story:** As a contract developer, I want a test that verifies `topup_subscription` panics when the target group ID does not exist, so that the NotFound guard is confirmed.

#### Acceptance Criteria

1. THE test suite SHALL contain a test named `test_topup_nonexistent_group` that calls `topup_subscription` with a `BytesN<32>` ID that was never passed to `create`.
2. WHEN `topup_subscription` is called with an unknown group ID, THE test SHALL assert that the call panics.

---

### Requirement 10: Topup on Inactive Group Test

**User Story:** As a contract developer, I want a test that confirms `topup_subscription` intentionally succeeds on a deactivated group and correctly updates usage counts, so that this permissive behaviour is explicitly documented as tested.

#### Acceptance Criteria

1. THE test suite SHALL contain a test named `test_topup_inactive_group_succeeds` that creates a group, deactivates it, and then calls `topup_subscription` on it.
2. WHEN `topup_subscription` is called on an inactive group with a funded payer, THE test SHALL assert that the call succeeds.
3. AFTER a successful topup on an inactive group, THE test SHALL assert that `usage_count` equals the initial count plus the additional usages.
4. AFTER a successful topup on an inactive group, THE test SHALL assert that `total_usages_paid` equals the initial total plus the additional usages.
5. AFTER a successful topup on an inactive group, THE test SHALL assert that `is_group_active` still returns `false`.

---

### Requirement 11: Multiple Sequential Topups Test

**User Story:** As a contract developer, I want a test that performs multiple consecutive topups and verifies cumulative accounting, so that off-by-one or reset bugs are detected.

#### Acceptance Criteria

1. THE test suite SHALL contain a test named `test_multiple_sequential_topups` that calls `topup_subscription` at least three times on the same group.
2. AFTER each topup, THE test SHALL assert that `usage_count` and `total_usages_paid` equal the expected cumulative sum.
3. AFTER all topups, THE test SHALL assert that `total_usages_paid` equals the initial usages plus the sum of all topup amounts.

---

### Requirement 12: Reduce to Zero Then Over-Reduce Test

**User Story:** As a contract developer, I want a test that reduces a group's usage count to zero and then attempts one more reduction, so that the NoUsagesRemaining guard is confirmed.

#### Acceptance Criteria

1. THE test suite SHALL contain a test named `test_reduce_to_zero_then_reduce_again` that creates a group with a small fixed `usage_count` (e.g., 3) and calls `reduce_usage` exactly that many times.
2. AFTER reducing to zero, THE test SHALL assert that `get_remaining_usages` returns `0`.
3. WHEN `reduce_usage` is called one more time after the count reaches zero, THE test SHALL assert that the call panics.

---

### Requirement 13: Large Usage Count Arithmetic Test

**User Story:** As a contract developer, I want a test that tops up with a very large number of usages (e.g., 10 000) and verifies that the arithmetic is exact, so that potential integer overflow or truncation bugs are caught.

#### Acceptance Criteria

1. THE test suite SHALL contain a test named `test_large_usage_count` that calls `topup_subscription` with `additional_usages = 10_000`.
2. THE test SHALL mint sufficient tokens to the payer to cover `10_000 * usage_fee` before calling `topup_subscription`.
3. AFTER the topup, THE test SHALL assert that `usage_count` equals exactly `initial_count + 10_000`.
4. AFTER the topup, THE test SHALL assert that `total_usages_paid` equals exactly `initial_total + 10_000`.

---

### Requirement 14: Third-Party Payer Topup Test

**User Story:** As a contract developer, I want a test that verifies any funded address (not just the group creator) can top up a subscription, so that the permissive payer model is explicitly tested.

#### Acceptance Criteria

1. THE test suite SHALL contain a test named `test_topup_different_payer` that generates a new address distinct from the group creator and mints tokens to that address.
2. WHEN `topup_subscription` is called by the non-creator payer, THE test SHALL assert that the call succeeds.
3. AFTER the topup, THE test SHALL assert that `usage_count` and `total_usages_paid` are updated correctly.

---

### Requirement 15: Topup with Insufficient Balance Test

**User Story:** As a contract developer, I want a test that verifies `topup_subscription` panics when the payer has no tokens, so that the token transfer failure path is confirmed.

#### Acceptance Criteria

1. THE test suite SHALL contain a test named `test_topup_insufficient_balance` that generates a payer address without minting any tokens to it.
2. WHEN `topup_subscription` is called by the zero-balance payer, THE test SHALL assert that the call panics.

---

### Requirement 16: Register Subscription Edge-Case Module in `lib.rs`

**User Story:** As a contributor, I want the subscription edge-case tests to be compiled and run as part of `cargo test --workspace --all-features`, so that CI executes them automatically.

#### Acceptance Criteria

1. THE `lib.rs` `mod tests` block SHALL contain the declaration `#[path = "../tests/subscription_edge_cases_test.rs"] mod subscription_edge_cases_test;`.
2. WHEN `cargo test --workspace --all-features` is run, THE Command SHALL execute all tests in `subscription_edge_cases_test.rs` without compilation errors.
