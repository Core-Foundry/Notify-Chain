# Git Workflow Guide

The branching strategy, commit conventions, and pull request process for NotifyChain contributors.

NotifyChain uses a **fork-and-pull-request** model. Nobody pushes directly to `main` on the upstream repository — all changes arrive via reviewed pull requests from forks.

**Related:** [`CONTRIBUTING.md`](../CONTRIBUTING.md) · [`CONTRIBUTOR_DEVELOPMENT_WORKFLOW_GUIDE.md`](../CONTRIBUTOR_DEVELOPMENT_WORKFLOW_GUIDE.md) · [Contributor Troubleshooting](CONTRIBUTOR_TROUBLESHOOTING.md)

---

## Table of Contents

1. [Repository Model](#1-repository-model)
2. [One-Time Setup](#2-one-time-setup)
3. [Keeping Your Fork in Sync](#3-keeping-your-fork-in-sync)
4. [Branch Naming](#4-branch-naming)
5. [Commit Messages](#5-commit-messages)
6. [The Day-to-Day Loop](#6-the-day-to-day-loop)
7. [Opening a Pull Request](#7-opening-a-pull-request)
8. [Review and Merge](#8-review-and-merge)
9. [Handling Conflicts](#9-handling-conflicts)
10. [After Your PR Merges](#10-after-your-pr-merges)
11. [Command Cheat Sheet](#11-command-cheat-sheet)

---

## 1. Repository Model

```
  Core-Foundry/Notify-Chain          ← upstream (read-only for contributors)
            │
            │ fork
            ▼
  your-username/Notify-Chain         ← origin (you push here)
            │
            │ clone
            ▼
       local working copy            ← you work here
```

Two remotes, two distinct roles:

| Remote | Points at | You do |
|--------|-----------|--------|
| `origin` | your fork | push branches, never push to `main` |
| `upstream` | `Core-Foundry/Notify-Chain` | fetch only, never push |

**`main` is a mirror, not a workspace.** Your local `main` exists solely to track upstream. Never commit to it directly — if you do, syncing becomes a conflict-resolution exercise every time.

---

## 2. One-Time Setup

Fork the repository on GitHub, then:

```bash
git clone https://github.com/your-username/Notify-Chain.git
cd Notify-Chain
git remote add upstream https://github.com/Core-Foundry/Notify-Chain.git
```

Verify — you should see exactly four lines:

```bash
git remote -v
```

```
origin    https://github.com/your-username/Notify-Chain.git (fetch)
origin    https://github.com/your-username/Notify-Chain.git (push)
upstream  https://github.com/Core-Foundry/Notify-Chain.git (fetch)
upstream  https://github.com/Core-Foundry/Notify-Chain.git (push)
```

If `origin` points at `Core-Foundry`, you cloned the upstream repo rather than your fork. Fix it without re-cloning:

```bash
git remote set-url origin https://github.com/your-username/Notify-Chain.git
```

Optionally protect yourself from accidental upstream pushes:

```bash
git remote set-url --push upstream DISABLED
```

---

## 3. Keeping Your Fork in Sync

Do this **before starting every new branch**. Most merge conflicts trace back to branching off a stale `main`.

```bash
git checkout main
git fetch upstream
git merge upstream/main
git push origin main
```

If `git merge upstream/main` reports anything other than a fast-forward, you have commits on local `main` that upstream doesn't. See [Section 9](#9-handling-conflicts).

---

## 4. Branch Naming

Format: `<type>/<short-kebab-case-description>`

| Prefix | Use for |
|--------|---------|
| `feature/` | New features |
| `fix/` | Bug fixes |
| `docs/` | Documentation changes |
| `refactor/` | Code restructuring with no behaviour change |
| `test/` | Adding or modifying tests |
| `chore/` | Maintenance, dependencies, tooling |

### Examples

```bash
feature/add-slack-notifications
feature/webhook-retry-queue
fix/resolve-event-deduplication-bug
fix/scheduler-timezone-offset
docs/update-contributing-guide
docs/api-error-reference
refactor/extract-notification-dispatcher
test/add-rate-limiter-coverage
chore/bump-stellar-sdk
```

### Guidelines

- Lowercase, hyphen-separated. No spaces, no underscores, no camelCase.
- Describe the change, not the ticket: `fix/resolve-event-deduplication-bug`, not `fix/issue-488`.
- Aim for three to five words — long enough to be meaningful in a branch list, short enough to type.
- One branch per issue. If you find an unrelated bug mid-branch, open a separate branch for it.

### Avoid

| Don't | Why |
|-------|-----|
| `patch-1` | GitHub's web-editor default; says nothing |
| `my-changes` | Meaningless to a reviewer |
| `fix` | No description, and collides immediately |
| `Feature/Add-Thing` | Inconsistent casing |
| `fix/issue-488` | Identifies the ticket, not the change |

---

## 5. Commit Messages

NotifyChain follows [Conventional Commits](https://www.conventionalcommits.org/).

```
<type>: <imperative summary>
```

| Type | Use for |
|------|---------|
| `feat:` | New feature |
| `fix:` | Bug fix |
| `docs:` | Documentation |
| `test:` | Test additions or changes |
| `refactor:` | Restructuring without behaviour change |
| `chore:` | Maintenance tasks |

### Examples

```bash
git commit -m "feat: add retry queue for failed notifications"
git commit -m "fix: resolve event parsing issue in listener"
git commit -m "docs: update README with setup instructions"
git commit -m "test: cover rate limiter window expiry"
git commit -m "refactor: extract fingerprint generation into helper"
```

### Guidelines

- **Imperative mood** — "add retry queue", not "added" or "adds". Read it as *"this commit will… add retry queue"*.
- **No trailing period**, lowercase after the type prefix.
- **Around 72 characters** for the summary line.
- **Explain *why* in the body** when the change isn't self-evident. The diff shows what changed; the body should say what it fixes and why this approach.

```bash
git commit -m "fix: prevent duplicate Discord sends after listener restart" -m "
The dedup cache is in-memory, so a restart cleared it and events in
flight across the boundary were re-delivered. Seed the cache from the
last processed ledger on startup.

Closes #123
"
```

- **Reference the issue** with `Closes #123` / `Fixes #123` in the body or the PR description — either will auto-close the issue on merge.
- **Commit in logical units.** One commit per coherent change beats one giant commit, and also beats fifteen "wip" commits.

---

## 6. The Day-to-Day Loop

**Claim the issue first.** Comment `I would like to work on this issue.` and wait for a maintainer to assign it. Do not open a PR for an unassigned issue — see the issue-claiming process in [`CONTRIBUTING.md`](../CONTRIBUTING.md).

```bash
# 1. Sync main
git checkout main
git fetch upstream
git merge upstream/main

# 2. Branch
git checkout -b feature/add-slack-notifications

# 3. Work, then stage and review before committing
git add listener/src/services/slack-sender.ts
git diff --staged

# 4. Commit
git commit -m "feat: add Slack notification sender"

# 5. Verify locally — the same gates CI runs
cd listener && npm run lint && npm test && cd ..

# 6. Push
git push -u origin feature/add-slack-notifications
```

`-u` is only needed on the first push; afterwards `git push` suffices.

> Run the checks for **every component you touched**. CI runs lint, typecheck/build, and tests for `dashboard/`, `listener/`, and the Rust contracts independently — a green listener does not tell you the dashboard still compiles.

---

## 7. Opening a Pull Request

Push, then open a PR from your branch to `Core-Foundry/Notify-Chain:main`.

### Title

Same format as commit messages:

```
feat: add Slack notification sender
fix: standardize error messages across contracts
docs: add API error reference
```

### Description

Include:

1. **Overview** — what the PR does and why.
2. **Related issue** — `Closes #123`. Use one `Closes` line per issue if the PR covers several.
3. **Changes** — what was added, removed, or modified.
4. **Verification** — which tests you ran and their results.
5. **How to test** — steps a reviewer can follow.

### Checklist

- [ ] Code follows the project's style guidelines
- [ ] Tests added or updated, and passing
- [ ] Documentation updated
- [ ] All tests pass locally
- [ ] Branch is up to date with `main`

### Scope

Keep a PR to a single issue or feature. A PR that fixes a bug, renames a module, and bumps a dependency is three PRs — reviewers cannot evaluate them independently, and a problem in one blocks the other two.

Open a **draft PR** early if you want feedback on direction before the work is finished.

---

## 8. Review and Merge

**Responding to feedback:** push follow-up commits to the same branch — the PR updates automatically. Don't force-push mid-review unless asked; it makes incremental re-review harder.

```bash
git add .
git commit -m "fix: address review feedback on error handling"
git push
```

Reply to each review comment, and resolve threads once addressed. If you disagree with a suggestion, say so with your reasoning — review is a conversation, not a checklist.

**CI must be green before merge.** Fix failures on your branch and push; do not merge around a red build.

Maintainers merge. Don't merge your own PR unless you are one.

---

## 9. Handling Conflicts

### Your branch conflicts with `main`

Sync `main`, then merge it into your branch:

```bash
git checkout main
git fetch upstream
git merge upstream/main

git checkout feature/your-branch
git merge main
# resolve conflicts in your editor, then:
git add <resolved-files>
git commit
git push
```

Resolve conflicts by understanding both sides — don't blindly take yours. If upstream changed a function you also modified, your change may need to adapt to the new signature.

### You accidentally committed to `main`

Move the commits onto a branch:

```bash
git branch feature/my-work        # save current main (with your commits)
git reset --hard upstream/main    # restore main to upstream state
git checkout feature/my-work      # continue on the branch
```

> `git reset --hard` discards uncommitted changes. Run `git status` first and commit or stash anything you want to keep.

### You need to undo the last commit

```bash
git reset --soft HEAD~1   # undo the commit, keep changes staged
git reset HEAD~1          # undo the commit, keep changes unstaged
```

Avoid rewriting history that is already pushed and under review.

---

## 10. After Your PR Merges

```bash
git checkout main
git fetch upstream
git merge upstream/main
git push origin main

git branch -d feature/add-slack-notifications          # delete locally
git push origin --delete feature/add-slack-notifications  # delete on your fork
```

Start each new issue from a freshly synced `main` — never from a previous feature branch, or your PR will contain the other branch's commits.

---

## 11. Command Cheat Sheet

| Task | Command |
|------|---------|
| Add upstream remote | `git remote add upstream https://github.com/Core-Foundry/Notify-Chain.git` |
| Check remotes | `git remote -v` |
| Sync fork | `git checkout main && git fetch upstream && git merge upstream/main && git push origin main` |
| New branch | `git checkout -b feature/my-feature` |
| Check status | `git status` |
| Review staged changes | `git diff --staged` |
| Commit | `git commit -m "feat: description"` |
| First push | `git push -u origin feature/my-feature` |
| Subsequent pushes | `git push` |
| Update branch from main | `git checkout feature/my-feature && git merge main` |
| List branches | `git branch -a` |
| Switch branch | `git checkout branch-name` |
| Delete local branch | `git branch -d branch-name` |
| Delete remote branch | `git push origin --delete branch-name` |
| Undo last commit, keep changes | `git reset --soft HEAD~1` |
| Stash work in progress | `git stash` / `git stash pop` |
| Compact history | `git log --oneline --graph --decorate -10` |

---

## Questions?

- Workflow question → comment on the issue you're working on
- Something broken → [Contributor Troubleshooting](CONTRIBUTOR_TROUBLESHOOTING.md)
- Setup problem → [`TROUBLESHOOTING.md`](../TROUBLESHOOTING.md)
