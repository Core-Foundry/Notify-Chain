# Contributor Environment Setup

Step-by-step instructions to set up NotifyChain on a clean machine. When you
finish the [verification checklist](#verification-checklist), contracts build,
the listener responds on its health endpoint, and component tests run the same
commands as [CI](../.github/workflows/ci.yml).

Related guides (deeper detail, not required for first setup):

- [LOCAL_DEVELOPMENT.md](../LOCAL_DEVELOPMENT.md) — running the full stack day to day
- [CONTRIBUTOR_DEVELOPMENT_WORKFLOW_GUIDE.md](../CONTRIBUTOR_DEVELOPMENT_WORKFLOW_GUIDE.md) — fork, branch, and PR workflow
- [TROUBLESHOOTING.md](../TROUBLESHOOTING.md) — common errors

---

## 1. Required tools

| Tool | Version (CI) | Purpose |
|------|----------------|---------|
| Git | 2.30+ | Clone and contribute |
| Rust (stable) | stable | Soroban smart contracts |
| `wasm32-unknown-unknown` | — | Contract WASM target |
| Stellar CLI | latest | Build and deploy contracts |
| Node.js | **22** | Listener and dashboard (see `.github/workflows/ci.yml`) |
| npm | bundled with Node | Install dependencies |

### Install Rust, WASM target, and Stellar CLI

```bash
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
source "$HOME/.cargo/env"
rustup target add wasm32-unknown-unknown
cargo install --locked stellar-cli --features opt
```

### Install Node.js 22

Use [nodejs.org](https://nodejs.org/) or [nvm](https://github.com/nvm-sh/nvm):

```bash
nvm install 22
nvm use 22
```

### Verify installations

```bash
git --version
rustc --version && cargo --version
stellar --version
node --version   # expect v22.x in CI
npm --version
```

All commands above should print a version without errors.

---

## 2. Clone the repository

For contributions, fork [Core-Foundry/Notify-Chain](https://github.com/Core-Foundry/Notify-Chain) on GitHub, then:

```bash
git clone https://github.com/YOUR-USERNAME/Notify-Chain.git
cd Notify-Chain
git remote add upstream https://github.com/Core-Foundry/Notify-Chain.git
git fetch upstream
git checkout main
git merge upstream/main
```

Read-only clone (no fork):

```bash
git clone https://github.com/Core-Foundry/Notify-Chain.git
cd Notify-Chain
```

---

## 3. Listener service

The listener polls Stellar, processes events, and exposes the events HTTP API.

```bash
cd listener
npm ci
cp .env.example .env
```

Edit `listener/.env`. Minimum for local development:

```bash
STELLAR_RPC_URL=https://soroban-testnet.stellar.org:443
CONTRACT_ADDRESSES=[{"address":"YOUR_CONTRACT_ID","events":["*"]}]
```

Initialize the database and start the service:

```bash
npm run migrate
npm run dev
```

In another terminal, confirm the service is up:

```bash
curl -s http://localhost:8787/health
curl -s http://localhost:8787/api/events
```

---

## 4. Dashboard

```bash
cd dashboard
npm ci
```

Optional: create `dashboard/.env` if the listener is not on the default URL:

```bash
# Example — adjust port if EVENTS_API_PORT differs in listener/.env
VITE_EVENTS_API_URL=http://localhost:8787
```

```bash
npm run dev
```

Open [http://localhost:5173](http://localhost:5173). The UI should load without CORS errors when the listener is running.

---

## 5. Smart contracts

### AutoShare (`contract/`)

```bash
cd contract
stellar contract build
cd contracts/hello-world
cargo test
```

### TaskBounty (`Documents/Task Bounty/`)

```bash
cd "Documents/Task Bounty"
stellar contract build
cargo test
```

---

## 6. Optional: frontend analytics app

```bash
cd frontend
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) when you work on analytics UI.

---

## 7. Environment variables

- Listener: see `listener/.env.example` and [ENVIRONMENT_VARIABLES_AND_SECRETS.md](../ENVIRONMENT_VARIABLES_AND_SECRETS.md)
- Dashboard: `VITE_EVENTS_API_URL` (events API base URL)

---

## Verification checklist

Complete these steps to confirm your environment is ready for development.

### Toolchain

- [ ] `rustc`, `cargo`, `stellar`, `node`, and `npm` versions print successfully
- [ ] `rustup target list --installed` includes `wasm32-unknown-unknown`

### Listener

- [ ] `cd listener && npm ci` completes without errors
- [ ] `npm run migrate` creates `listener/data/notifications.db`
- [ ] `npm run dev` starts without crashing
- [ ] `curl http://localhost:8787/health` returns HTTP 200 with `"status":"ok"`

### Dashboard

- [ ] `cd dashboard && npm ci` completes
- [ ] `npm run dev` serves the app on port 5173
- [ ] Browser loads the dashboard with the listener running

### Contracts

- [ ] `stellar contract build` succeeds under `contract/`
- [ ] `cargo test` passes in `contract/contracts/hello-world` (when the workspace builds)
- [ ] `cargo test` passes under `Documents/Task Bounty/`

### CI parity (run before opening a PR)

```bash
# Listener
cd listener && npm ci && npm run lint && npm run typecheck && npm test --silent

# Dashboard
cd dashboard && npm ci && npm run lint && npm run build && npm test --silent && npm run test:wallet --silent

# Contracts
cd contract && cargo fmt --all -- --check && cargo test --workspace --all-features --verbose
```

- [ ] All commands above succeed on your machine (or note pre-existing upstream failures in your PR)

---

## 8. VS Code (recommended)

Install [rust-analyzer](https://marketplace.visualstudio.com/items?itemName=rust-lang.rust-analyzer) and [ESLint](https://marketplace.visualstudio.com/items?itemName=dbaeumer.vscode-eslint). The repo includes `.vscode/settings.json` with `wasm32-unknown-unknown` configured for contracts.

---

## 9. Troubleshooting

| Symptom | Fix |
|---------|-----|
| `sqlite3` / `node-gyp` install errors | `npm rebuild sqlite3`; install platform build tools (see [TROUBLESHOOTING.md](../TROUBLESHOOTING.md)) |
| `SQLITE_ERROR: no such table` | `cd listener && npm run migrate` |
| Dashboard cannot reach API | Match `VITE_EVENTS_API_URL` to listener `EVENTS_API_PORT` |
| Port 8787 in use | Change `EVENTS_API_PORT` in `listener/.env` or stop the conflicting process |

For more detail, see [TROUBLESHOOTING.md](../TROUBLESHOOTING.md).
