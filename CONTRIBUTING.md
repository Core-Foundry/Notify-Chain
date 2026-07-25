# Contributing to NotifyChain

Welcome, and thank you for considering a contribution to NotifyChain! 🎉

Whether you're fixing a bug, writing tests, improving documentation, or adding a new feature, your help is appreciated. This guide covers everything you need to set up the project locally, run the tests, and submit a pull request.

---

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Setting Up Locally](#setting-up-locally)
3. [Running Tests](#running-tests)
4. [Pull Request Process](#pull-request-process)
5. [Code Style Guidelines](#code-style-guidelines)
6. [Code of Conduct](#code-of-conduct)

---

## Prerequisites

Before you begin, make sure you have the following installed:

| Tool | Purpose | Install |
|------|---------|---------|
| **Rust** (stable) | Smart contract development | [rustup.rs](https://rustup.rs) |
| **wasm32 target** | Compile contracts to WebAssembly | `rustup target add wasm32-unknown-unknown` |
| **Stellar CLI** | Deploy and invoke Soroban contracts | `cargo install --locked stellar-cli --features opt` |
| **Node.js ≥ 18** | Listener and dashboard | [nodejs.org](https://nodejs.org) |
| **Git** | Version control | [git-scm.com](https://git-scm.com) |

Verify your Rust installation:
```bash
rustc --version
cargo --version
```

Verify Stellar CLI:
```bash
stellar --version
```

---

## Setting Up Locally

### 1. Fork and Clone the Repository

Fork the repository on GitHub, then clone your fork:

```bash
git clone https://github.com/<your-username>/Notify-Chain.git
cd Notify-Chain
```

Add the upstream remote so you can stay in sync:

```bash
git remote add upstream https://github.com/Core-Foundry/Notify-Chain.git
git remote -v  # verify: origin = your fork, upstream = main repo
```

### 2. Build the AutoShare Contract

```bash
cd contract
stellar contract build
```

### 3. Install Listener Dependencies

```bash
cd listener
npm ci
```

### 4. Install Dashboard Dependencies

```bash
cd dashboard
npm ci
```

---

## Running Tests

### Smart Contract Tests (Rust)

```bash
cd contract/contracts/hello-world
cargo test
```

To run a specific test by name:

```bash
cargo test test_get_all_groups -- --nocapture
```

### Listener Tests (TypeScript)

```bash
cd listener
npm test
```

### Dashboard Tests (TypeScript)

```bash
cd dashboard
npm test
```

All tests are also run automatically by the GitHub Actions CI pipeline on every push and pull request.

---

## Pull Request Process

1. **Sync with upstream** before starting work:
   ```bash
   git checkout main
   git fetch upstream
   git merge upstream/main
   git push origin main
   ```

2. **Create a feature branch** with a descriptive name:
   ```bash
   git checkout -b fix/reduce-usage-validation
   # or
   git checkout -b feat/add-slack-notifications
   ```

3. **Make your changes** — write clean, readable code and include tests for any new logic.

4. **Commit using [Conventional Commits](https://www.conventionalcommits.org/)**:
   ```bash
   git commit -m "fix: add authorization check to reduce_usage"
   git commit -m "test: add unit tests for get_all_groups"
   git commit -m "docs: update CONTRIBUTING guide"
   ```

5. **Push your branch** and open a Pull Request on GitHub:
   ```bash
   git push -u origin <branch-name>
   ```

6. **Fill in the PR description** with:
   - A summary of what changed and why
   - The issue(s) this PR closes (e.g. `Closes #42`)
   - How to test the changes
   - Any screenshots or log output if relevant

7. **Respond to review feedback** promptly and update your branch as needed.

### PR Checklist

- [ ] Tests added or updated and passing locally
- [ ] No new lint warnings (`cargo fmt` / `npm run lint`)
- [ ] Documentation updated if behavior changed
- [ ] Branch is up to date with `main`
- [ ] PR title follows Conventional Commits format

---

## Code Style Guidelines

### Rust

- Format with `cargo fmt` before committing.
- Use `///` doc comments on all public functions and structs.
- Define custom errors with `#[contracterror]`.
- Keep functions focused and test all edge cases.

### TypeScript

- Run `npm run lint` before committing.
- Use strict TypeScript — avoid `any`.
- Write unit tests for all new service logic.
- Follow the naming conventions used in each package.

---

## Code of Conduct

- Be respectful and inclusive toward all contributors.
- Provide constructive, actionable feedback in code reviews.
- Focus on the best outcome for the project and its users.

---

For questions or help, open a GitHub issue or start a discussion. We're happy to guide you through your first contribution!
