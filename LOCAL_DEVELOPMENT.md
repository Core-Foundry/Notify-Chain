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
9. [Troubleshooting](#troubleshooting)

---

## Prerequisites

### Required tools

| Tool | Version | Install |
|------|---------|---------|
| Node.js | ≥ 18 | [nodejs.org](https://nodejs.org) |
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

### `cargo install stellar-cli` is slow or fails

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
