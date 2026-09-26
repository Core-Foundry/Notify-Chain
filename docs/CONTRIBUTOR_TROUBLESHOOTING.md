# Contributor Troubleshooting Guide

Common problems contributors hit while working on NotifyChain, and how to resolve them.

This guide covers the **contribution workflow** — building, testing, linting, running services locally, Git, and CI. For other problem domains:

| Guide | Covers |
|-------|--------|
| [`TROUBLESHOOTING.md`](../TROUBLESHOOTING.md) | First-time environment setup — installing Rust, Stellar CLI, Node |
| [`DEPLOYMENT_TROUBLESHOOTING.md`](../DEPLOYMENT_TROUBLESHOOTING.md) | Deployment and staging failures |
| [API Error Reference](API_ERROR_REFERENCE.md) | HTTP error responses from the listener API |
| [Git Workflow Guide](GIT_WORKFLOW.md) | Branching, commits, and the PR process |

---

## Table of Contents

1. [Start Here — Triage](#1-start-here--triage)
2. [Install and Dependency Issues](#2-install-and-dependency-issues)
3. [TypeScript and Build Failures](#3-typescript-and-build-failures)
4. [Test Failures](#4-test-failures)
5. [Running the Listener Locally](#5-running-the-listener-locally)
6. [Database and Migration Issues](#6-database-and-migration-issues)
7. [Dashboard Issues](#7-dashboard-issues)
8. [Smart Contract (Rust) Issues](#8-smart-contract-rust-issues)
9. [Git and Pull Request Issues](#9-git-and-pull-request-issues)
10. [CI Failures](#10-ci-failures)
11. [Still Stuck?](#11-still-stuck)

---

## 1. Start Here — Triage

Before diving into a specific section, three checks resolve a large share of problems.

**Are you on the right Node version?** CI runs **Node 22**. A different major version is the most common source of "works locally, fails in CI".

```bash
node --version
```

**Are you in the right directory?** Each component has its own `package.json`. Running `npm test` at the repo root does nothing useful — you must be in `listener/` or `dashboard/`.

**Is your branch current?** A failure caused by a stale branch disappears after syncing:

```bash
git fetch upstream && git merge upstream/main
```

---

## 2. Install and Dependency Issues

### `npm ci` fails with a lockfile mismatch

```
npm ERR! `npm ci` can only install packages when your package.json and
npm ERR! package-lock.json are in sync.
```

**Cause:** `package.json` was edited without regenerating the lockfile — often by hand-editing a version, or by a merge that resolved `package.json` but not `package-lock.json`.

**Fix:**

```bash
cd listener        # or dashboard
npm install        # regenerates package-lock.json
```

Commit the updated `package-lock.json`. Never delete it to make an error disappear — CI uses `npm ci`, which requires it.

### `Cannot find module` after switching branches

Branches can carry different dependency sets. Reinstall:

```bash
cd listener
npm install
```

If that doesn't resolve it, clear and reinstall:

```bash
rm -rf node_modules
npm install
```

### Merge conflict in `package-lock.json`

Don't hand-resolve it. Take one side, then regenerate:

```bash
git checkout --theirs package-lock.json
npm install
git add package-lock.json
```

---

## 3. TypeScript and Build Failures

In this repo `npm run lint` and `npm run typecheck` are **both** `tsc --noEmit` for the listener — a lint failure is a type error.

### `npm run lint` fails in `listener/`

```bash
cd listener
npm run typecheck
```

Read the first error, not the last. TypeScript errors cascade: one bad type produces a dozen downstream complaints that vanish when the first is fixed.

### `Property 'x' does not exist on type 'y'`

**Cause:** Usually a domain type in `listener/src/types/` was changed without updating every consumer — exactly the class of bug TypeScript is here to catch (see [ADR-0004](adr/0004-typescript-for-listener-service.md)).

**Fix:** Update the type definition *or* the call site so they agree. Don't reach for `as any` — it silences the check and moves the failure to runtime.

### Build succeeds but `npm start` runs stale code

`npm start` runs `dist/`, not `src/`. If you didn't rebuild, you're running the previous compile:

```bash
cd listener
npm run build
npm start
```

For development use `npm run dev` instead — it runs TypeScript directly through `ts-node`, no build step.

### Dashboard build fails on lint warnings

The dashboard lints with `--max-warnings=0`, so a warning fails the build:

```bash
cd dashboard
npm run lint
```

Fix the warnings. Don't raise the threshold — CI enforces zero.

---

## 4. Test Failures

Run tests from the component directory:

```bash
cd listener && npm test
cd dashboard && npm test
```

### Run a single test file while iterating

```bash
cd listener
npm test -- src/api/events-server.test.ts
```

Filter by test name:

```bash
npm test -- -t "deduplication"
```

### Tests pass individually but fail together

**Cause:** Shared state leaking between tests — a module-level cache, a database file, or a timer that outlives its test.

**Fix:** Reset state in `beforeEach`/`afterEach`. For the deduplicator and similar caches, construct a fresh instance per test rather than reusing a module-level singleton.

### Tests hang or time out

**Cause:** An open handle — a server, database connection, or interval that was never closed.

**Fix:** Close what you opened in `afterEach`/`afterAll`. To find the culprit:

```bash
cd listener
npm test -- --detectOpenHandles
```

### Timing-dependent tests fail intermittently

Deduplication and rate-limiting logic is time-windowed. Tests that use real wall-clock time are flaky by construction.

**Fix:** Inject the clock rather than reading it. `NotificationDeduplicator` accepts a `now: () => number` option precisely for this — pass a controllable function instead of relying on `Date.now()`.

### Snapshot mismatches

If the change is intentional:

```bash
npm test -- -u
```

Review the updated snapshots in the diff before committing. An unreviewed `-u` can silently bless a regression.

---

## 5. Running the Listener Locally

### Setup

```bash
cd listener
cp .env.example .env      # then edit
npm install
npm run dev
```

### `EADDRINUSE: address already in use`

The events API defaults to port **8787**.

Find and stop the process holding it:

```bash
lsof -i :8787
kill <PID>
```

Or run on a different port by setting `EVENTS_API_PORT` in `listener/.env`.

### The listener starts but no events arrive

Work through these in order:

1. **Is the contract address correct?** Check it in `listener/.env` against the deployed contract.
2. **Is the RPC endpoint reachable?** A wrong or unreachable URL usually surfaces as repeated poll errors in the logs.
3. **Are you on the right network?** A testnet contract address against a mainnet RPC returns nothing — no error, just silence.
4. **Have the events already been consumed?** Deduplication suppresses events seen within the window. Restarting clears the in-memory cache (see [ADR-0005](adr/0005-event-deduplication-strategy.md)).

### An endpoint returns 503

A 503 means an optional subsystem isn't enabled, not that the server is broken. `Scheduler not enabled` on `/api/schedule*` is the common case — it's off by default. See [Section 11 of the API Error Reference](API_ERROR_REFERENCE.md#11-503--service-unavailable).

### Everything returns 404

Check the path and method. `/api/events` and `/api/v1/events` both work; `/v1/events` does not. Scheduling is `POST /api/schedule`, not `GET`.

---

## 6. Database and Migration Issues

The listener uses SQLite, defaulting to `./data/notifications.db` (override with `DATABASE_PATH`). See [ADR-0003](adr/0003-sqlite-for-local-persistence.md).

### `SQLITE_BUSY: database is locked`

**Cause:** Two processes have the database file open — commonly a stray `npm run dev` from a previous session, or a DB browser you left connected.

**Fix:** Find and stop the other process, or point your test run at a separate `DATABASE_PATH`.

### Migration errors on startup

Check migration status:

```bash
cd listener
npm run check-migrations
```

Apply pending migrations:

```bash
npm run migrate
```

### Schema out of sync after switching branches

If a branch added a migration that another branch doesn't have, the schema can end up in a state neither expects. Locally, the fastest fix is a clean database:

```bash
rm -f data/notifications.db
npm run migrate
```

> This **deletes all local data**. Only do it in development, never against anything you need to keep.

### `SQLITE_CANNOT_OPEN`

The parent directory doesn't exist. Create it:

```bash
mkdir -p data
```

---

## 7. Dashboard Issues

### Dashboard loads but shows no data

The dashboard reads from the listener API. Confirm, in order:

1. **The listener is running** — `curl http://localhost:8787/health`.
2. **The dashboard points at the right URL** — check `dashboard/.env` against the listener's actual port.
3. **No CORS errors in the browser console** — the listener sets CORS headers; a mismatch usually means the wrong origin or port.

### Vite dev server won't start

Port already taken — stop the other process or start Vite on another port:

```bash
cd dashboard
npm run dev -- --port 5174
```

### Wallet (Freighter) not detected

Wallet-specific problems are covered in the **Freighter Troubleshooting** section of [`README.md`](../README.md#freighter-troubleshooting).

---

## 8. Smart Contract (Rust) Issues

### `error[E0463]: can't find crate for 'core'` when building

The WebAssembly target isn't installed:

```bash
rustup target add wasm32-unknown-unknown
```

### `cargo test` fails after pulling contract changes

Clear stale build artifacts:

```bash
cd contract/contracts/hello-world
cargo clean
cargo test
```

### `stellar: command not found`

The Stellar CLI isn't installed or isn't on `PATH`:

```bash
cargo install --locked stellar-cli --features opt
```

If it installs but isn't found, ensure `~/.cargo/bin` is on your `PATH`.

### Contract builds locally but the WASM is rejected

Build with the release profile and the correct target — a debug build produces a much larger artifact that may exceed limits. Check the `Makefile` in `contract/contracts/hello-world/` for the canonical build command.

---

## 9. Git and Pull Request Issues

Full workflow details are in the [Git Workflow Guide](GIT_WORKFLOW.md). The failures that come up most often:

### Your PR shows commits you didn't write

**Cause:** You branched off another feature branch instead of a synced `main`.

**Fix:** Re-create the branch from an up-to-date `main` and move only your commits across. See [Git Workflow §10](GIT_WORKFLOW.md#10-after-your-pr-merges).

### You committed to `main` by accident

```bash
git branch feature/my-work
git reset --hard upstream/main
git checkout feature/my-work
```

> `--hard` discards uncommitted work. Run `git status` first.

### `Updates were rejected because the remote contains work you do not have`

Someone (or you, elsewhere) pushed to that branch. Integrate before pushing:

```bash
git pull --rebase origin <branch-name>
git push
```

Don't force-push a branch that's under review unless a reviewer asks — it makes incremental re-review much harder.

### Permission denied when pushing

You're pushing to `upstream` instead of `origin`. Contributors push to their fork only:

```bash
git remote -v          # confirm origin is YOUR fork
git push origin <branch-name>
```

### Your PR has conflicts with `main`

```bash
git checkout main
git fetch upstream && git merge upstream/main
git checkout <your-branch>
git merge main
# resolve, then:
git add . && git commit && git push
```

Resolve by understanding both sides — if upstream changed a signature you also touched, your code needs to adapt to the new one.

---

## 10. CI Failures

### Reproduce CI locally before pushing again

CI runs lint, typecheck/build, and tests per component. Run the same gates:

```bash
cd listener && npm run lint && npm test
cd ../dashboard && npm run lint && npm run build && npm test
```

Run the checks for **every component you touched**. A green listener says nothing about the dashboard.

### Passes locally, fails in CI

The usual causes, in order:

1. **Node version** — CI uses Node 22.
2. **`npm install` vs `npm ci`** — CI uses `npm ci`, which installs strictly from the lockfile. If your lockfile is stale, CI sees different dependencies than you do.
3. **Uncommitted files** — a file that exists locally but was never `git add`ed. Check `git status`.
4. **Case-sensitive imports** — macOS is case-insensitive, CI's Linux is not. `import './Foo'` resolves locally and fails in CI when the file is `foo.ts`.
5. **Test ordering or timing** — see [Section 4](#4-test-failures).

### CI didn't run on your PR

The CI workflow is path-filtered on pull requests — it triggers on changes under `listener/src/migrations/`, `listener/src/database/`, `listener/src/scripts/`, and `listener/package.json`. A PR touching only documentation legitimately runs no jobs. That's expected, not a failure.

---

## 11. Still Stuck?

Before opening an issue, gather:

1. **What you ran** — the exact command and directory.
2. **What happened** — the full error output, not a paraphrase.
3. **Environment** — `node --version`, `npm --version`, and OS.
4. **Branch state** — `git status` and `git log --oneline -3`.
5. **What you already tried.**

Then:

- **Search existing issues first** — [Issue tracker](https://github.com/Core-Foundry/Notify-Chain/issues). Most contributor-facing problems have been hit before.
- **Comment on the issue you're working on** if it's specific to that work.
- **Open a new issue** if the problem is reproducible and undocumented — and consider a PR adding it to this guide.

If a fix here is wrong or out of date, that's a bug in the docs. Please fix it.
