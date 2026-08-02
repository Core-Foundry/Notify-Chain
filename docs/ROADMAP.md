# NotifyChain Project Roadmap

High-level plan for NotifyChain development. Update this file when milestones
ship or priorities change. Status values:

| Status | Meaning |
|--------|---------|
| **Done** | Available on `main` and documented |
| **In progress** | Active development or partial implementation |
| **Planned** | Agreed direction, not yet started |
| **Exploring** | Under research; may change |

---

## Vision

NotifyChain connects Soroban smart contract events to reliable off-chain
notifications and operator tooling so dApps can react to on-chain activity
without building a full indexer from scratch.

---

## Milestones

### M1 — Core event pipeline (Done)

| Item | Status | Notes |
|------|--------|-------|
| Soroban contracts emit structured events | Done | AutoShare, TaskBounty examples |
| Listener polls Stellar RPC and deduplicates events | Done | `listener/` |
| Events HTTP API | Done | `/api/events` and related endpoints |
| React dashboard for live activity | Done | `dashboard/` |
| Discord notifications | Done | Webhook integration |

### M2 — Delivery reliability and operations (In progress)

| Item | Status | Notes |
|------|--------|-------|
| Scheduled notifications and retry scheduler | Done | See listener scheduler docs |
| Rate limiting and backpressure | Done | `listener/RATE-LIMITING-GUIDE.md` |
| Notification templates and preview | Done | Template system in listener + dashboard |
| Indexing health and reconciliation | In progress | Dashboard panels, gap detection |
| Archival and search | In progress | Archive API, notification search UI |
| Monitoring integrations | Planned | See `docs/MONITORING_INTEGRATION.md` |

### M3 — Multi-channel notifications (Planned)

| Item | Status | Notes |
|------|--------|-------|
| Webhook delivery hardening (signatures, retries) | In progress | Partial webhook dashboard |
| Email provider integration | Planned | Listed in README tech stack |
| Telegram / Slack adapters | Planned | |
| Mobile push notifications | Exploring | |

### M4 — Contract and protocol features (Planned)

| Item | Status | Notes |
|------|--------|-------|
| User notification preferences on-chain | In progress | Preferences modules in AutoShare |
| Batch notifications and acknowledgments | In progress | Contract tests in tree |
| Reputation and category registry | In progress | Soroban modules |
| Formal upgrade playbook for production deploys | Done | `CONTRACT_UPGRADE_GUIDE.md`, `DEPLOYMENT_PLAYBOOK.md` |
| Mainnet deployment guides | Planned | Expand beyond testnet playbooks |

### M5 — Developer experience (In progress)

| Item | Status | Notes |
|------|--------|-------|
| Contributor setup and workflow docs | In progress | `docs/`, `CONTRIBUTOR_*` guides |
| CI for contracts, listener, dashboard | Done | `.github/workflows/ci.yml` |
| Preview deployments | Done | `PREVIEW_DEPLOYMENTS.md` |
| Unified analytics frontend | In progress | `frontend/` Next.js app |
| Public API cookbook and OpenAPI-style references | In progress | `listener/API_*` docs |

---

## How to maintain this document

1. **One row per deliverable** — Keep items small enough to track in a single PR or issue.
2. **Update status in the PR that ships the work** — Do not batch roadmap-only PRs without code/docs changes unless correcting priorities.
3. **Link to detail elsewhere** — Use this file for priorities and status; put how-to content in README, `listener/`, or `docs/`.
4. **Quarterly review** — Maintainers revisit **Planned** vs **Exploring** items and open GitHub issues for the next milestone.

---

## How to propose changes

Open a GitHub issue with the `enhancement` label describing the feature and
which milestone it belongs to. Maintainers adjust this roadmap when the work is
accepted.

---

## Related documents

- [README.md](../README.md) — product overview and features
- [ARCHITECTURE_OVERVIEW.md](../ARCHITECTURE_OVERVIEW.md) — system design
- [Documents/Task Bounty/README.md](../Documents/Task%20Bounty/README.md) — example contract roadmap (TaskBounty-specific)
