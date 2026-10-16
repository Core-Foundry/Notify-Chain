# Implementation Plan: Notify-Chain Improvements

## Overview

Three independent task groups, each committable to its own branch. Tasks within each group build on one another; groups are fully independent.

---

## Task Dependency Graph

```json
{
  "waves": [
    {
      "wave": 1,
      "tasks": ["1", "5", "11"],
      "description": "First task of each independent group — can all start in parallel"
    },
    {
      "wave": 2,
      "tasks": ["2", "6", "12"],
      "description": "Builds on wave 1 within each group"
    },
    {
      "wave": 3,
      "tasks": ["3", "7", "13"],
      "description": "Builds on wave 2 within each group"
    },
    {
      "wave": 4,
      "tasks": ["4", "8", "14"],
      "description": "Checkpoints and final registrations"
    },
    {
      "wave": 5,
      "tasks": ["9", "15"],
      "description": "Documentation and final verification"
    },
    {
      "wave": 6,
      "tasks": ["10"],
      "description": "Task Group 2 final checkpoint"
    }
  ]
}
```

The three groups (Tasks 1–4, Tasks 5–10, Tasks 11–15) are fully independent and can be executed in parallel on separate branches.

---

## Tasks

<!-- ============================================================ -->
<!-- TASK GROUP 1: Secure Credential Management                   -->
<!-- ============================================================ -->

- [ ] 1. Add `.env` to `dashboard/.gitignore`
  - Open `dashboard/.gitignore` and append `.env`, `.env.local`, and `.env.*.local` entries.
  - Verify that creating a `dashboard/.env` file and running `git status` does not show the file as untracked.
  - _Requirements: 1.1, 1.2_

- [ ] 2. Complete `listener/.env.example` with missing variables
  - Add a `# Discord Webhook Configuration` comment block with `DISCORD_WEBHOOK_ID=` including an inline description explaining it is the numeric webhook ID paired with `DISCORD_WEBHOOK_URL`.
  - Add a `# Rate Limiting Configuration` comment block containing:
    - `RATE_LIMIT_ENABLED=true` with description
    - `RATE_LIMIT_WINDOW_MS=60000` with unit annotation (milliseconds)
    - `RATE_LIMIT_MAX_REQUESTS=60` with description
    - `RATE_LIMIT_CLIENT_OVERRIDES={}` with a JSON schema example comment showing `{"client-id": {"maxRequests": 30, "windowMs": 60000}}`
  - Verify the file parses correctly (each line is a valid `KEY=value` or comment).
  - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5_

- [ ] 3. Add Configuration reference section to root `README.md`
  - Locate or create an appropriate position in the root `README.md` (after the existing introduction/setup sections).
  - Add `## Configuration / Environment Variables` heading.
  - Add a `### Listener (\`listener/.env\`)` sub-section with a Markdown table containing columns: Variable, Type, Default, Required, Description — populated from all variables in `listener/.env.example`.
  - Add a `### Dashboard (\`dashboard/.env\`)` sub-section with the same table format — populated from all variables in `dashboard/.env.example`.
  - Mark variables with no default (e.g. `CONTRACT_ADDRESSES`, `DISCORD_WEBHOOK_URL`, `DISCORD_WEBHOOK_ID`) as Required = Yes.
  - _Requirements: 3.1, 3.2, 3.3, 3.4_

- [ ] 4. Checkpoint — Task 1 complete
  - Confirm `dashboard/.gitignore` includes `.env`.
  - Confirm `listener/.env.example` includes all five new variables.
  - Confirm root `README.md` contains the Configuration section with both sub-sections.
  - Ensure all tests pass, ask the user if questions arise.

<!-- ============================================================ -->
<!-- TASK GROUP 2: Gas Consumption Tracking                       -->
<!-- ============================================================ -->

- [ ] 5. Create the gas snapshot baseline JSON skeleton
  - Create directory `contract/contracts/hello-world/gas-snapshots/`.
  - Create `contract/contracts/hello-world/gas-snapshots/autoshare.json` with the following skeleton (all numeric values set to `0`):
    ```json
    {
      "version": 1,
      "functions": {
        "create":               { "cpu_insns": 0, "mem_bytes": 0, "description": "Create a new AutoShare group (10 usages, no members)" },
        "topup_subscription":   { "cpu_insns": 0, "mem_bytes": 0, "description": "Top up existing group with 10 additional usages" },
        "update_members":       { "cpu_insns": 0, "mem_bytes": 0, "description": "Set 3 members with equal percentage split" },
        "withdraw":             { "cpu_insns": 0, "mem_bytes": 0, "description": "Admin withdraws 100 tokens to recipient" }
      }
    }
    ```
  - _Requirements: 5.1, 5.2, 5.3, 5.4_

- [ ] 6. Implement `gas_snapshot_test.rs`
  - Create `contract/contracts/hello-world/src/tests/gas_snapshot_test.rs`.
  - Add imports: `use crate::test_utils::{create_test_group, mint_tokens, setup_test_env}; use crate::AutoShareContractClient; use soroban_sdk::{testutils::Address as _, Address, BytesN, String, Vec};`
  - Implement four `#[test]` functions following the pattern below. Each test MUST:
    1. Call `test_env.env.budget().reset_unlimited()` immediately before the contract call being measured.
    2. Perform the contract call.
    3. Read `test_env.env.budget().cpu_insns_consumed()` and `test_env.env.budget().mem_bytes_consumed()`.
    4. Assert both values are `> 0`.
    5. Print `println!("SNAPSHOT {name}: cpu={cpu} mem={mem}");` so the CI gate can parse output.
  - **`snapshot_create`**: mint 10 000 tokens to creator, call `client.create(...)` with 10 usages, measure budget.
  - **`snapshot_topup_subscription`**: use `create_test_group(...)` to set up a group, mint extra tokens to creator, call `client.topup_subscription(...)` with 10 additional usages, measure budget.
  - **`snapshot_update_members`**: create a group (0 members), build a `Vec<GroupMember>` with 3 members at 34/33/33 %, call `client.update_members(...)`, measure budget.
  - **`snapshot_withdraw`**: create a group (funds land in contract), call `client.withdraw(admin, token, 100, recipient)`, measure budget.
  - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7_

- [ ]* 6.1 Verify gas snapshot tests compile and run
  - Run `cargo test --all-features gas_snapshot -- --nocapture` in `contract/`.
  - Confirm all four tests pass and each prints a `SNAPSHOT ...: cpu=NNN mem=NNN` line with non-zero values.
  - Copy the printed values into `autoshare.json` (replacing the `0` skeletons) and commit.
  - _Requirements: 4.6, 4.7, 5.4_

- [ ] 7. Register `gas_snapshot_test` module in `lib.rs`
  - In `contract/contracts/hello-world/src/lib.rs`, inside the `mod tests { ... }` block, add:
    ```rust
    #[path = "../tests/gas_snapshot_test.rs"]
    mod gas_snapshot_test;
    ```
  - Run `cargo build --all-features` in `contract/` to confirm no compilation errors.
  - _Requirements: 4.8_

- [ ] 8. Add CI gas regression gate step to `.github/workflows/ci.yml`
  - After the existing `Run tests` step in the `rust` job, add a new step named `Gas regression check`.
  - The step runs in `working-directory: contract`.
  - Shell script logic:
    1. Run `cargo test --all-features gas_snapshot -- --nocapture 2>&1` and capture output.
    2. Check whether the snapshot file contains all-zero baselines; if so, print a warning and exit 0.
    3. For each of the four function names, parse the `cpu_insns` and `mem_bytes` from the captured output using `grep` and `awk`.
    4. Read the baseline values from `contracts/hello-world/gas-snapshots/autoshare.json` using `jq`.
    5. For each metric, compute `threshold = baseline * 110 / 100` using integer arithmetic in `awk`.
    6. If any measured value exceeds its threshold, print the function name and values, then exit 1.
  - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5_

- [ ] 9. Create `GAS_USAGE.md` at the repository root
  - Create `GAS_USAGE.md` with the following sections:
    - `## Overview` — 2–3 sentences explaining Soroban CPU instruction and memory byte metering (what they measure, where limits are enforced).
    - `## Function Baselines` — a Markdown table with columns: Function, Scenario, CPU Instructions, Memory Bytes; rows for `create`, `topup_subscription`, `update_members`, `withdraw`. Populate from values committed in task 6.1.
    - `## How to Update the Snapshot` — step-by-step: run `cargo test --all-features gas_snapshot -- --nocapture`, note printed values, update `autoshare.json`.
    - `## Regression Policy` — document the 10 % tolerance and how the CI gate enforces it.
  - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5_

- [ ] 10. Checkpoint — Task 2 complete
  - Confirm snapshot JSON has non-zero values.
  - Confirm `gas_snapshot_test.rs` is registered in `lib.rs`.
  - Confirm CI `ci.yml` has the new regression step.
  - Confirm `GAS_USAGE.md` exists with all required sections.
  - Ensure all tests pass, ask the user if questions arise.

<!-- ============================================================ -->
<!-- TASK GROUP 3: Subscription Edge-Case Tests                   -->
<!-- ============================================================ -->

- [ ] 11. Create `subscription_edge_cases_test.rs` with error-path tests
  - Create `contract/contracts/hello-world/src/tests/subscription_edge_cases_test.rs`.
  - Add standard imports at the top of the file:
    ```rust
    use crate::test_utils::{create_test_group, mint_tokens, setup_test_env};
    use crate::AutoShareContractClient;
    use soroban_sdk::{testutils::Address as _, Address, BytesN, Vec};
    ```
  - Implement the following `#[should_panic]` tests:
    - **`test_duplicate_create_error_type`**: call `create_test_group` twice with the same manually-constructed `BytesN<32>` ID (e.g., `[1u8; 32]`). The second call must panic. Add comment `// Expects Error::AlreadyExists`.
    - **`test_topup_nonexistent_group`**: construct a random `BytesN<32>` that was never used in `create`, call `client.topup_subscription(...)` on it. Must panic. Add comment `// Expects Error::NotFound`.
    - **`test_topup_insufficient_balance`**: create a group normally, generate a new `payer` address, do NOT mint any tokens, call `client.topup_subscription(...)` with that payer. Must panic. Add comment `// Expects token transfer failure`.
  - _Requirements: 8.1, 8.2, 9.1, 9.2, 15.1, 15.2_

- [ ]* 11.1 Write property test for topup accumulation (Property 1)
  - **Property 1: Topup accumulates usage counts correctly**
  - In the same file, add a parameterized helper `assert_topup_accumulates(initial: u32, topup: u32)` that:
    1. Creates a group with `initial` usages.
    2. Mints enough tokens.
    3. Calls `topup_subscription` with `topup` usages.
    4. Asserts `usage_count == initial + topup` and `total_usages_paid == initial + topup`.
  - Call it from a `#[test]` named `test_topup_accumulation_property` with representative pairs: `(1, 1)`, `(5, 10)`, `(100, 200)`, `(1, 10_000)`.
  - **Validates: Requirements 11.2, 11.3, 13.3, 13.4**

- [ ] 12. Implement success-path edge-case tests
  - In `subscription_edge_cases_test.rs`, implement the following success-path `#[test]` functions:
    - **`test_topup_inactive_group_succeeds`**:
      1. Create a group with `initial_usages = 5`.
      2. Call `client.deactivate_group(...)`.
      3. Assert `!client.is_group_active(...)`.
      4. Mint extra tokens to `creator`.
      5. Call `client.topup_subscription(id, 10, token, creator)`.
      6. Assert `client.get(&id).usage_count == 15`.
      7. Assert `client.get(&id).total_usages_paid == 15`.
      8. Assert `!client.is_group_active(...)` (still inactive).
    - **`test_multiple_sequential_topups`**:
      1. Create a group with `initial_usages = 5`.
      2. Perform three topups of `10`, `20`, and `30` usages (mint tokens before each).
      3. After each topup, assert `usage_count` and `total_usages_paid` equal the expected cumulative sum.
      4. After all topups, assert `total_usages_paid == 5 + 10 + 20 + 30 == 65`.
    - **`test_large_usage_count`**:
      1. Create a group with `initial_usages = 1`.
      2. Mint `10_000 * usage_fee + buffer` tokens to the creator.
      3. Call `client.topup_subscription(id, 10_000, token, creator)`.
      4. Assert `usage_count == 10_001` and `total_usages_paid == 10_001`.
    - **`test_topup_different_payer`**:
      1. Create a group with `initial_usages = 5`.
      2. Generate a new `payer` address distinct from `creator`.
      3. Mint `10 * usage_fee` tokens to `payer`.
      4. Call `client.topup_subscription(id, 10, token, payer)`.
      5. Assert `usage_count == 15` and `total_usages_paid == 15`.
  - _Requirements: 10.1–10.5, 11.1–11.3, 13.1–13.4, 14.1–14.3_

- [ ]* 12.1 Write property test for inactive-group topup (Property 2)
  - **Property 2: Topup succeeds regardless of group active status**
  - Add a `#[test]` named `test_inactive_topup_property` that calls `assert_topup_accumulates` helper (from task 11.1) after deactivating the group, with pairs: `(5, 5)`, `(1, 100)`.
  - Assert `is_group_active` returns `false` after topup in both cases.
  - **Validates: Requirements 10.2, 10.3, 10.4, 10.5**

- [ ] 13. Implement `test_reduce_to_zero_then_reduce_again`
  - In `subscription_edge_cases_test.rs`, add:
    - **`test_reduce_to_zero_then_reduce_again`** (success part, `#[test]`):
      1. Create a group with `initial_usages = 3`.
      2. Call `client.reduce_usage(...)` three times in a loop.
      3. Assert `client.get_remaining_usages(...)  == 0`.
    - **`test_reduce_below_zero_panics`** (`#[test] #[should_panic]`):
      1. Create a group with `initial_usages = 3`.
      2. Call `client.reduce_usage(...)` four times. The fourth call must panic.
      3. Add comment `// Expects Error::NoUsagesRemaining`.
  - _Requirements: 12.1, 12.2, 12.3_

- [ ]* 13.1 Write property test for reduce_usage boundary (Property 3)
  - **Property 3: reduce_usage terminates at zero**
  - Add a `#[test]` named `test_reduce_terminates_at_zero_property` that runs for `initial_usages` in `[1, 2, 5, 10]`:
    1. For each value N, create a fresh group with N usages.
    2. Call `reduce_usage` N times.
    3. Assert `get_remaining_usages == 0`.
  - Note: the panic test (over-reduce) remains as `test_reduce_below_zero_panics` from task 13.
  - **Validates: Requirements 12.2, 12.3**

- [ ] 14. Register `subscription_edge_cases_test` module in `lib.rs`
  - In `contract/contracts/hello-world/src/lib.rs`, inside the `mod tests { ... }` block, add:
    ```rust
    #[path = "../tests/subscription_edge_cases_test.rs"]
    mod subscription_edge_cases_test;
    ```
  - Run `cargo build --all-features` in `contract/` to confirm no compilation errors.
  - _Requirements: 16.1_

- [ ] 15. Final checkpoint — Task 3 complete
  - Run `cargo test --workspace --all-features` in `contract/` and confirm all tests in `subscription_edge_cases_test` pass.
  - Confirm the module is registered in `lib.rs`.
  - Ensure all tests pass, ask the user if questions arise.

---

## Notes

- Tasks marked with `*` are optional and can be skipped for a faster MVP; the non-starred tests in the same group still provide solid coverage.
- Each task group (1–4, 5–10, 11–15) maps to a separate branch and PR.
- Property tests in this spec are implemented as parameterised `#[test]` functions with multiple representative inputs rather than a full PBT library, since the Soroban `no_std` environment limits available PBT crates.
- The gas snapshot values in `autoshare.json` must be populated from a real measurement run before the CI regression gate becomes meaningful; the skeleton file with zeros causes the gate to skip (per Requirement 6.4).
