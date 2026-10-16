# Code Review Guidelines

These guidelines help contributors and reviewers keep NotifyChain changes safe,
consistent, and easy to maintain. Use them alongside
[CONTRIBUTING.md](../CONTRIBUTING.md) and the PR checklist there.

---

## Goals of review

- Correctness — behavior matches the issue and does not regress existing flows
- Security — no new secret leakage, unsafe deserialization, or missing auth checks
- Operability — listener/dashboard changes remain observable and configurable
- Consistency — code and docs match patterns in the touched package
- Testability — meaningful tests accompany behavior changes

---

## Review checklist

### All changes

- [ ] PR title and description follow [Conventional Commits](https://www.conventionalcommits.org/) style
- [ ] Scope is limited to one issue or feature; unrelated refactors are avoided
- [ ] Linked GitHub issue is referenced when applicable
- [ ] CI-equivalent checks were run locally (see [Environment Setup](ENVIRONMENT_SETUP.md) when available, or [CONTRIBUTING.md](../CONTRIBUTING.md#3-write-and-run-tests))
- [ ] User-facing behavior changes are documented (README, listener docs, or contract guides)

### Rust / Soroban (`contract/`, `Documents/Task Bounty/`)

- [ ] `cargo fmt` and `cargo test` pass for affected crates
- [ ] Public contract methods have clear errors (`#[contracterror]`) and events for state changes
- [ ] Storage layout changes are called out; upgrade path noted if deployed contracts exist ([CONTRACT_UPGRADE_GUIDE.md](../CONTRACT_UPGRADE_GUIDE.md))
- [ ] Authorization (`require_auth`, admin checks) is correct for privileged operations
- [ ] Fuzz or property tests updated when validation logic changes

### Listener (`listener/`)

- [ ] TypeScript types are explicit; no unchecked `any` without justification
- [ ] API routes validate input and return consistent error shapes ([API_ERROR_REFERENCE.md](../listener/API_ERROR_REFERENCE.md))
- [ ] Database migrations are idempotent and included when schema changes
- [ ] Retries, rate limits, and idempotency considered for notification delivery paths
- [ ] Secrets read from environment variables, not hard-coded

### Dashboard (`dashboard/`)

- [ ] Components handle loading, empty, and error states
- [ ] API URLs come from config (`VITE_*`), not hard-coded production hosts
- [ ] Accessibility basics: labels on controls, keyboard-friendly interactions where applicable
- [ ] Tests cover new UI logic (Jest/React Testing Library)

### Frontend (`frontend/`)

- [ ] Next.js pages and hooks follow existing folder conventions
- [ ] Lint passes (`npm run lint`)

---

## Best practices

### For contributors

1. **Small PRs** — Easier to review and revert; split large features behind flags when possible.
2. **Explain the why** — PR description should state problem, approach, and trade-offs.
3. **Show verification** — Paste test commands and results; include screenshots for UI changes.
4. **Respond to feedback** — Address or discuss every review comment; push follow-up commits on the same branch.
5. **Update docs in the same PR** — If behavior changes, update the doc that users read first (README, listener guides, or `docs/`).

### For reviewers

1. **Be timely and specific** — Suggest concrete fixes; distinguish blocking issues from nits.
2. **Test when risk is high** — Contract upgrades, auth, migrations, and payment flows deserve a local run.
3. **Check security first** — Webhooks, signatures, API keys, and CORS settings affect production safety.
4. **Approve when ready** — Do not block on style preferences already covered by formatters/linters.
5. **Escalate** — Tag maintainers for breaking API or contract storage changes.

### Review tone

- Assume good intent; ask questions before requesting large rewrites.
- Prefer "consider" for optional improvements and "must" for correctness or security issues.
- Link to existing docs or code examples in the repo when suggesting patterns.

---

## Approval expectations

| Change type | Typical reviewers | Notes |
|-------------|-------------------|-------|
| Docs only | 1 maintainer | Spell-check and link validation |
| Listener / dashboard | 1–2 with TypeScript context | Run `npm test` in affected package |
| Smart contracts | 1–2 with Soroban context | Upgrade and deployment impact noted |
| Cross-cutting (API + contract events) | 2 reviewers | Confirm event schema docs updated |

Maintainers may request additional review before tagged releases.

---

## Related resources

- [CONTRIBUTING.md](../CONTRIBUTING.md) — workflow and PR template
- [CONTRIBUTOR_DEVELOPMENT_WORKFLOW_GUIDE.md](../CONTRIBUTOR_DEVELOPMENT_WORKFLOW_GUIDE.md) — branching and sync
- [ARCHITECTURE_OVERVIEW.md](../ARCHITECTURE_OVERVIEW.md) — system boundaries
- [CI workflow](../.github/workflows/ci.yml) — automated checks on every PR
