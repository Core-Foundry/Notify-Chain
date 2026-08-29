# Local Development Setup Guide

This guide walks you through setting up every component of NotifyChain on your local machine: the Soroban smart contracts (Rust), the off-chain listener service (Node.js/TypeScript), and the React dashboard.

---

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Repository Setup](#repository-setup)
3. [Smart Contracts](#smart-contracts)
4. [Listener Service](#listener-service)
5. [Dashboard](#dashboard)
6. [Running Everything Together](#running-everything-together)
7. [Environment Variables Reference](#environment-variables-reference)
8. [Example Configuration](#example-configuration)
9. [IDE Setup (VS Code)](#ide-setup-vs-code)
10. [Troubleshooting](#troubleshooting)

---

## Prerequisites

### Required tools

| Tool | Version | Install |
|------|---------|---------|
| Node.js | ≥ 18 (20 recommended for Listener) | [nodejs.org](https://nodejs.org) |
| npm | ≥ 9 | Bundled with Node.js |
| Rust | stable | `curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs \| sh` |
| Stellar CLI | latest | `cargo install --locked stellar-cli --features opt` |

### Verify installations

```bash
node --version    # v18+
npm --version     # 9+
rustc --version
cargo --version
stellar --version
```

### WebAssembly target (required for contracts)

```bash
rustup target add wasm32-unknown-unknown
```

---

## Repository Setup

```bash
git clone https://github.com/Core-Foundry/Notify-Chain.git
cd Notify-Chain
```

---

## Smart Contracts

### AutoShare contract

```bash
cd contract
stellar contract build
```

Run tests:

```bash
cd contracts/hello-world
cargo test
```

### TaskBounty contract

```bash
cd "Documents/Task Bounty"
stellar contract build
# or: cargo build --target wasm32-unknown-unknown --release
```

Run tests:

```bash
cargo test
```

### Deploying to testnet (optional)

Generate and fund a test identity:

```bash
stellar keys generate dev-account --network testnet
stellar keys fund dev-account --network testnet
```

Deploy:

```bash
stellar contract deploy \
  --wasm target/wasm32-unknown-unknown/release/hello_world.wasm \
  --source dev-account \
  --network testnet
# Outputs: CONTRACT_ID
```

Initialize:

```bash
stellar contract invoke \
  --id <CONTRACT_ID> \
  --source dev-account \
  --network testnet \
  -- initialize_admin \
  --admin <YOUR_PUBLIC_KEY>
```

---

## Listener Service

The listener polls Stellar for contract events, persists them to SQLite, sends Discord notifications, and exposes an HTTP API.

### Install dependencies

```bash
cd listener
npm ci
```

### Configure environment

```bash
cp .env.example .env
```

Edit `.env` — at minimum set:

```env
STELLAR_RPC_URL=https://soroban-testnet.stellar.org:443
CONTRACT_ADDRESSES=[{"address":"<YOUR_CONTRACT_ID>","events":["*"]}]
EVENTS_API_PORT=8787
```

See [Environment Variables Reference](#environment-variables-reference) for all options.

Use `npm ci` when installing from the lockfile (CI / clean setups). Use `npm install` for local dependency updates.

### Initialize database

```bash
npm run migrate
```

### Run in development mode

```bash
npm run dev
```

### Build and run compiled output

```bash
npm run build
npm start
```

### Run tests

```bash
npm test
```

### Verify the service is running

```bash
curl http://localhost:8787/health
```

Expected response:

```json
{ "status": "ok", "timestamp": "...", "services": { ... } }
```

---

## Dashboard

The dashboard is a React + Vite app that displays events fetched from the listener.

### Install dependencies

```bash
cd dashboard
npm ci
```

### Configure environment

```bash
cp .env.example .env
```

The default `.env` points to the listener at `http://localhost:8787`:

```env
VITE_EVENTS_API_URL=http://localhost:8787/api/events
VITE_STELLAR_NETWORK=TESTNET
```

### Run in development mode

```bash
npm run dev
```

The dashboard is available at `http://localhost:5173`.

### Build for production

```bash
npm run build
npm run preview
```

### Run tests

```bash
npm test
```

---

## Running Everything Together

Open three terminal tabs:

```bash
# Tab 1 — listener
cd listener && npm run dev

# Tab 2 — dashboard
cd dashboard && npm run dev

# Tab 3 — health check
curl http://localhost:8787/health
```

The dashboard at `http://localhost:5173` will start receiving events from the listener.

---

## Environment Variables Reference

### Listener (`listener/.env`)

#### Network

| Variable | Default | Description |
|----------|---------|-------------|
| `STELLAR_NETWORK` | `testnet` | Network name |
| `STELLAR_RPC_URL` | `https://soroban-testnet.stellar.org:443` | Stellar RPC endpoint |
| `STELLAR_NETWORK_PASSPHRASE` | `Test SDF Network ; September 2015` | Network passphrase |
| `CONTRACT_ADDRESSES` | — | JSON array of `{ address, events }` objects |

#### Polling

| Variable | Default | Description |
|----------|---------|-------------|
| `POLL_INTERVAL_MS` | `30000` | How often to poll for new events (ms) |
| `MAX_RECONNECT_ATTEMPTS` | `5` | Max reconnect attempts on failure |
| `RECONNECT_DELAY_MS` | `5000` | Delay between reconnect attempts (ms) |

#### API

| Variable | Default | Description |
|----------|---------|-------------|
| `EVENTS_API_PORT` | `8787` | Port for the HTTP events API |
| `EVENTS_API_CORS_ORIGIN` | `http://localhost:5173` | Allowed CORS origin |
| `WEBHOOK_SECRETS` | `[]` | JSON array of `{ id, secret }` for webhook verification |

#### Database

| Variable | Default | Description |
|----------|---------|-------------|
| `DATABASE_PATH` | `./data/notifications.db` | Path to the SQLite database file |

#### Discord (optional)

| Variable | Default | Description |
|----------|---------|-------------|
| `DISCORD_WEBHOOK_URL` | — | Discord webhook URL for notifications |

#### Scheduler

| Variable | Default | Description |
|----------|---------|-------------|
| `SCHEDULER_ENABLED` | `true` | Enable the scheduled notifications scheduler |
| `SCHEDULER_POLL_INTERVAL_MS` | `10000` | How often the scheduler checks for due notifications |
| `SCHEDULER_BATCH_SIZE` | `10` | Max notifications processed per cycle |

#### Rate limiting

| Variable | Default | Description |
|----------|---------|-------------|
| `RATE_LIMIT_ENABLED` | `true` | Enable rate limiting on the API |
| `RATE_LIMIT_WINDOW_MS` | `60000` | Time window for rate limiting (ms) |
| `RATE_LIMIT_MAX_REQUESTS` | `60` | Max requests per window per client |

### Dashboard (`dashboard/.env`)

| Variable | Default | Description |
|----------|---------|-------------|
| `VITE_EVENTS_API_URL` | `http://localhost:8787/api/events` | Listener API endpoint |
| `VITE_STELLAR_NETWORK` | `TESTNET` | Stellar network (`TESTNET` or `PUBLIC`) |

---

## Example Configuration

Minimal `listener/.env` to monitor a testnet contract and receive Discord alerts:

```env
STELLAR_NETWORK=testnet
STELLAR_RPC_URL=https://soroban-testnet.stellar.org:443
STELLAR_NETWORK_PASSPHRASE=Test SDF Network ; September 2015

CONTRACT_ADDRESSES=[{"address":"CXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX","events":["*"]}]

EVENTS_API_PORT=8787
EVENTS_API_CORS_ORIGIN=http://localhost:5173

DATABASE_PATH=./data/notifications.db

DISCORD_WEBHOOK_URL=https://discord.com/api/webhooks/YOUR_ID/YOUR_TOKEN

SCHEDULER_ENABLED=true
RATE_LIMIT_ENABLED=true
```

Minimal `dashboard/.env`:

```env
VITE_EVENTS_API_URL=http://localhost:8787/api/events
VITE_STELLAR_NETWORK=TESTNET
```

---

## IDE Setup (VS Code)

### Recommended extensions

Install the following extensions for the best development experience across the Rust contracts and TypeScript listener/dashboard:

| Extension | ID | Purpose |
|-----------|-----|---------|
| **rust-analyzer** | `rust-lang.rust-analyzer` | Rust language support (autocomplete, inlay hints, go-to-definition) |
| **CodeLLDB** | `vadimcn.vscode-lldb` | Native debugger for Rust |
| **Better TOML** | `bungcip.better-toml` | Syntax highlighting for `Cargo.toml` files |
| **ESLint** | `dbaeumer.vscode-eslint` | TypeScript/JavaScript linting for the listener and dashboard |

Install all at once from the terminal:

```bash
code --install-extension rust-lang.rust-analyzer
code --install-extension vadimcn.vscode-lldb
code --install-extension bungcip.better-toml
code --install-extension dbaeumer.vscode-eslint
```

### Recommended `.vscode/settings.json`

The repository already ships with a `.vscode/settings.json`. If you need to create or extend it, the recommended settings are:

```json
{
  "rust-analyzer.cargo.target": "wasm32-unknown-unknown",
  "rust-analyzer.checkOnSave.allTargets": false,
  "editor.formatOnSave": true
}
```

- `rust-analyzer.cargo.target` — tells rust-analyzer to check the code against the `wasm32-unknown-unknown` target, matching how the contracts are built. Without this, rust-analyzer may surface false-positive errors for WASM-only APIs.
- `rust-analyzer.checkOnSave.allTargets` — disabling prevents rust-analyzer from checking every target on every save, which speeds up feedback in a multi-target workspace.
- `editor.formatOnSave` — auto-formats Rust files with `rustfmt` and TypeScript files with Prettier (if configured) on each save.

> **Note:** A `.vscode/settings.json` file is already included in the repository root with the `rust-analyzer` target pre-configured. You can edit it directly rather than creating a new one.

---

## Troubleshooting

### Listener fails to start: `ConfigError`

Check that `STELLAR_RPC_URL` and `CONTRACT_ADDRESSES` are set in `listener/.env`. The service exits on startup if required config is missing.

### `DATABASE_PATH` directory does not exist

Create the `data/` directory before starting the listener:

```bash
mkdir -p listener/data
```

### No events appearing in the dashboard

1. Confirm the listener is healthy: `curl http://localhost:8787/health`
2. Check `VITE_EVENTS_API_URL` in `dashboard/.env` matches the listener port.
3. Check `EVENTS_API_CORS_ORIGIN` in `listener/.env` matches the dashboard origin (`http://localhost:5173` by default).
4. Confirm `CONTRACT_ADDRESSES` contains the correct deployed contract ID.

### Stellar RPC errors / timeouts

- Switch to a different public RPC endpoint. The [Stellar Developer docs](https://developers.stellar.org/docs/tools/developer-tools/rpc-providers) list available providers.
- Increase `POLL_INTERVAL_MS` to reduce request frequency.

### Contract build fails: `wasm32-unknown-unknown` not found

```bash
rustup target add wasm32-unknown-unknown
```

### `cargo install --locked stellar-cli --features opt` is slow or fails

Try with the `--locked` flag to use pinned dependency versions:

```bash
cargo install --locked stellar-cli --features opt
```

### Tests fail with SQLite errors

The listener tests use an in-memory SQLite database (`:memory:`). Make sure `sqlite3` native bindings compiled correctly:

```bash
cd listener
npm ci
npm test
```

If `sqlite3` fails to build, ensure you have a C++ toolchain installed (`build-essential` on Debian/Ubuntu, `xcode-select --install` on macOS).

### Port already in use

If port `8787` is taken, change `EVENTS_API_PORT` in `listener/.env` and update `VITE_EVENTS_API_URL` in `dashboard/.env` to match.

### Rust version too old

Soroban contracts require a recent stable Rust toolchain. If you see errors such as `error[E0XXX]: ...` about unstable features or missing trait implementations, your local Rust is likely out of date.

Update to the latest stable release:

```bash
rustup update stable
```

After updating, verify the version:

```bash
rustc --version   # should be 1.78 or later
```

Then rebuild the contract:

```bash
cd contract
stellar contract build
```

### stellar-cli version mismatch

Running `stellar contract build` with an outdated `stellar-cli` may silently produce a Wasm binary that is incompatible with the current Soroban host environment on testnet, causing invocation errors or unexpected behaviour at runtime.

Reinstall the CLI to the latest pinned version:

```bash
cargo install --locked stellar-cli --features opt
```

Verify the installed version:

```bash
stellar --version
```

If multiple versions are on your `PATH` (e.g. from a previous global install), check which binary is being used:

```bash
which stellar
```

### npm run dev fails with ts-node / ESM errors

The listener uses TypeScript with ES module output. Depending on your Node.js version, `ts-node` may fail to resolve ESM imports, producing errors like:

```
Error [ERR_UNKNOWN_FILE_EXTENSION]: Unknown file extension ".ts"
```

or

```
SyntaxError: Cannot use import statement in a module
```

**Reliable workaround — compile first, then run:**

```bash
cd listener
npm run build
npm start
```

**Alternative — check `tsconfig.json`:**

Ensure the `module` and `moduleResolution` settings are consistent. For Node 18+, the recommended combination is:

```json
{
  "compilerOptions": {
    "module": "NodeNext",
    "moduleResolution": "NodeNext"
  }
}
```

If you need to keep `ts-node` for a faster dev loop, add `"ts-node": { "esm": true }` to `tsconfig.json` and use `node --loader ts-node/esm src/index.ts`.

### Dashboard shows CORS error

The browser blocks requests from the dashboard to the listener when the `Origin` header does not match the value of `EVENTS_API_CORS_ORIGIN` in `listener/.env`. The mismatch must be **exact** — including the protocol, hostname, and port.

**Symptom:**

```
Access to fetch at 'http://localhost:8787/api/events' from origin 'http://localhost:5173'
has been blocked by CORS policy: No 'Access-Control-Allow-Origin' header is present.
```

**Fix:**

Open `listener/.env` and set `EVENTS_API_CORS_ORIGIN` to exactly the origin shown in the browser's address bar:

```env
# Default dashboard dev server
EVENTS_API_CORS_ORIGIN=http://localhost:5173

# If you changed the dashboard port or are using a different host
EVENTS_API_CORS_ORIGIN=http://localhost:4173
```

Restart the listener after editing `.env`. The header value must not have a trailing slash.

### SQLite WAL mode contention

The listener opens its SQLite database in WAL (Write-Ahead Logging) mode for better concurrency. However, if two or more listener processes attempt to **write** to the same database file simultaneously, you will see errors such as:

```
SqliteError: database is locked
SQLITE_BUSY: database is locked
```

**Fix 1 — ensure only one listener process runs at a time:**

```bash
# Check for existing listener processes
lsof listener/data/notifications.db

# Kill any stale processes before starting a new one
pkill -f "node.*listener"
```

**Fix 2 — give each process its own database file:**

If you intentionally run multiple listener instances (e.g. one per contract), point each to a separate file using the `DATABASE_PATH` environment variable:

```env
# Instance A
DATABASE_PATH=./data/contract-a.db

# Instance B
DATABASE_PATH=./data/contract-b.db
```

### Contract invoke returns "simulation failed"

`stellar contract invoke` runs a local simulation before broadcasting the transaction. A `simulation failed` error usually points to one of three causes:

1. **Contract not initialized** — the contract was deployed but `initialize_admin` (or equivalent) was never called. Re-run the initialization step:

   ```bash
   stellar contract invoke \
     --id <CONTRACT_ID> \
     --source dev-account \
     --network testnet \
     -- initialize_admin \
     --admin <YOUR_PUBLIC_KEY>
   ```

2. **Wrong network** — the `--network` flag does not match where the contract was deployed. Confirm the contract exists on the target network:

   ```bash
   stellar contract info --id <CONTRACT_ID> --network testnet
   ```

3. **Wrong `--id`** — the contract ID was miscopied. The deploy command prints the contract ID on stdout. You can re-check it with:

   ```bash
   stellar keys list          # list your identities
   # Re-deploy if needed and note the printed CONTRACT_ID
   ```

Enable verbose output for more detail:

```bash
stellar contract invoke --id <CONTRACT_ID> --source dev-account --network testnet --verbose -- <FUNCTION> <ARGS>
```

### Freighter not detecting local testnet

Freighter does not automatically switch networks. If your contract is deployed on Testnet but Freighter is set to Mainnet (or vice versa), transactions will be rejected or signed for the wrong network.

**Fix:**

1. Click the Freighter browser extension icon.
2. Open **Settings → Network**.
3. Select **Testnet** for local development.
4. Reload your dApp page.

Freighter must be on the **same network** as the `--network` flag you used when deploying the contract and as `VITE_STELLAR_NETWORK` in `dashboard/.env`.

For a full list of Freighter connection issues (extension not detected, popup not appearing, signing timeouts, wrong network errors), see the [Freighter Troubleshooting](README.md#freighter-troubleshooting) section in `README.md`.
