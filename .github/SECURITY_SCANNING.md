# Security Scanning in CI

This repository runs automated dependency vulnerability scanning on every
pull request. Results are visible in the `security-scan` job of the CI
workflow (`.github/workflows/ci.yml`).

## Tooling

| Ecosystem | Tool         | Source of truth database             |
|-----------|--------------|--------------------------------------|
| Rust      | `cargo-audit`| RustSec Advisory Database            |
| JS / TS   | `npm audit`  | GitHub Advisory Database (registry)  |

Both tools are invoked from the GitHub Actions runner; no external SaaS
account or API token is required.

## Severity policy

Each scan reports a count of findings grouped by CVSS-level severity:
`critical`, `high`, `moderate`, `low`, and `info`.

| Severity    | Blocks the build? | Action required                                                    |
|-------------|-------------------|--------------------------------------------------------------------|
| **Critical**| ✅ Yes            | Patch immediately or add a temporary suppress-and-ticket entry.   |
| **High**    | ✅ Yes            | Patch before merge.                                                |
| Moderate    | ❌ No             | Track for the next release window.                                 |
| Low         | ❌ No             | Triage at team discretion.                                         |
| Info        | ❌ No             | Informational only – no change required.                           |

Informational findings (moderate / low / info) are printed to the CI log
for visibility but never fail the pipeline. This keeps the signal-to-noise
ratio high while ensuring the team is still aware of the backlog.

## Running locally

### Rust

```bash
cargo install cargo-audit   # one-time install
cd contract
cargo audit
```

To replicate the CI blocking behaviour (only critical/high fail):

```bash
cd contract
cargo audit --json | jq -e '
  [.vulnerabilities.list[] | select(.severity == "critical" or .severity == "high")]
  | length == 0
'
```

### JavaScript / TypeScript (dashboard, listener)

```bash
cd dashboard
npm audit           # or: npm audit --json
```

CI uses a wrapper script that:
1. Runs `npm audit --json`.
2. Exits `0` if the set of **critical** and **high** findings is empty.
3. Exits `1` (blocking) otherwise, printing the filtered findings.

## False positives / suppressions

If a finding is a confirmed false positive or mitigated through another
control, document the rationale in the PR description. For Rust,
`cargo audit` supports per-advisory suppression via `.cargo/audit.toml`.
For npm, `npm audit` supports `auditignore` entries in `package.json` on
recent npm versions. Every suppression must carry an expiry date.
