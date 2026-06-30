# Smart Contract Deployment Playbook

This playbook provides a comprehensive, step-by-step guide for building, optimizing, deploying, initializing, and verifying the NotifyChain smart contracts on both **Stellar Testnet** and **Stellar Mainnet** networks.

---

## 1. Prerequisites

Before starting, ensure that your development machine has the following tools installed and configured:

### 1.1 Rust & WebAssembly Target
NotifyChain contracts are written in Rust and compile to WebAssembly (`wasm32-unknown-unknown`).
```bash
# Install Rust (if not already installed)
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh

# Add the WASM target
rustup target add wasm32-unknown-unknown
```

### 1.2 Stellar CLI
The [Stellar CLI](https://soroban.stellar.org/docs/getting-started/setup#install-the-stellar-cli) is used to compile, deploy, and interact with Soroban contracts.
```bash
# Install Stellar CLI
cargo install --locked stellar-cli --features opt

# Verify installation
stellar --version
```

### 1.3 Stellar Network Configuration
To deploy and invoke contracts, the CLI must know about the RPC nodes and passphrases of the networks. Add them to your CLI configuration:

```bash
# Add Stellar Testnet
stellar network add \
  --rpc-url "https://soroban-testnet.stellar.org" \
  --network-passphrase "Test SDF Network ; September 2015" \
  testnet

# Add Stellar Mainnet
stellar network add \
  --rpc-url "https://soroban-rpc.stellar.org" \
  --network-passphrase "Public Global Stellar Network ; September 2015" \
  mainnet
```
*Alternatively, you can configure these directly in your project-specific or global configuration file at `.stellar/config.toml`.*

### 1.4 Identity & Funding
You need a Stellar account with sufficient XLM to cover fee and rent costs for deploying the contract.

#### For Testnet:
Generate a test deployer account and fund it using Friendbot (Stellar's testnet faucet):
```bash
# Generate a test deployer keypair
stellar keys generate deployer --network testnet

# Fund the account with Friendbot
stellar keys fund deployer --network testnet
```

#### For Mainnet:
For production environments, do **NOT** store raw private keys in plain text. Use a hardware wallet (like Ledger) or secure key manager.
To add an existing private key securely:
```bash
# Add your mainnet signing identity
stellar keys add mainnet-deployer
```
*You will be prompted to enter your secret key securely. Ensure this account has sufficient mainnet XLM.*

---

## 2. Environment Variables

Deploying the smart contracts and wiring them to the off-chain stack requires setting up several environment variables.

### 2.1 Deployment & Command Line Variables
These variables are commonly exported during CLI deployment scripting:
- `CONTRACT_ID`: The unique 56-character string identifying your deployed contract.
- `ADMIN_ADDRESS`: The admin address that is granted authorization rights to manage contract settings.
- `DISPUTE_RESOLVER_ADDRESS`: The designated address authorized to resolve disputed tasks in `TaskBounty`.

### 2.2 Off-Chain Listener Configuration (`listener/.env`)
Once the contracts are deployed, their IDs must be registered in the listener's environment config [listener/.env.example](file:///workspaces/Notify-Chain/listener/.env.example):
- `STELLAR_NETWORK`: Set to `testnet` or `public` (mainnet).
- `STELLAR_RPC_URL`: The Stellar RPC endpoint URL (e.g., `https://soroban-testnet.stellar.org:443`).
- `CONTRACT_ADDRESSES`: A JSON array specifying the contract addresses and events to subscribe to.
  ```env
  CONTRACT_ADDRESSES=[
    {"address":"C_AUTOSHARE_CONTRACT_ID_HERE","events":["*"]},
    {"address":"C_TASKBOUNTY_CONTRACT_ID_HERE","events":["*"]}
  ]
  ```

### 2.3 Frontend Dashboard Configuration (`dashboard/.env`)
Provide the frontend dashboard [dashboard/.env.example](file:///workspaces/Notify-Chain/dashboard/.env.example) with details to query the listener:
- `VITE_EVENTS_API_URL`: HTTP URL of the listener event feed (e.g., `http://localhost:8787/api/events`).
- `VITE_STELLAR_NETWORK`: Network context (`TESTNET` or `PUBLIC`).

---

## 3. Step-by-Step Deployment Examples

NotifyChain contains two primary smart contracts that must be compiled and deployed:
1. `AutoShare` - Subscription and group management contract located in [contract/contracts/hello-world](file:///workspaces/Notify-Chain/contract/contracts/hello-world).
2. `TaskBounty` - Decentralized task and reward board contract located in [Documents/Task Bounty](file:///workspaces/Notify-Chain/Documents/Task%20Bounty).

---

### Example A: Deploying AutoShare Contract

#### Step A.1: Build the Contract
Navigate to the contract workspace and run the build command.
```bash
cd /workspaces/Notify-Chain/contract/contracts/hello-world

# Build using Stellar CLI
stellar contract build
```
This outputs the WebAssembly file in `target/wasm32-unknown-unknown/release/hello_world.wasm` or `target/wasm32v1-none/release/hello_world.wasm` depending on your version.

#### Step A.2: Optimize the WebAssembly Binary
Soroban charges transaction fees and rent based on code size. Run the optimization tool to minify the WASM:
```bash
stellar contract optimize \
  --wasm target/wasm32-unknown-unknown/release/hello_world.wasm
```
This generates an optimized WASM file at `target/wasm32-unknown-unknown/release/hello_world.optimized.wasm`.

#### Step A.3: Deploy to Testnet
Upload the optimized WASM to the Stellar ledger using the `deployer` identity:
```bash
stellar contract deploy \
  --wasm target/wasm32-unknown-unknown/release/hello_world.optimized.wasm \
  --source deployer \
  --network testnet
```
This will print a 56-character contract ID starting with `C` (e.g., `CAS33...`).
Save this contract ID:
```bash
export AUTOSHARE_CONTRACT_ID=<returned-contract-id>
```

#### Step A.4: Initialize the Contract
The `AutoShare` contract requires initializing the administrator identity before it can accept groups and payments. Call the [initialize_admin](file:///workspaces/Notify-Chain/contract/contracts/hello-world/src/lib.rs#L38) function:
```bash
stellar contract invoke \
  --id $AUTOSHARE_CONTRACT_ID \
  --source deployer \
  --network testnet \
  -- \
  initialize_admin \
  --admin <DEPLOYER_ADDRESS_OR_ADMIN_ADDRESS>
```

---

### Example B: Deploying TaskBounty Contract

#### Step B.1: Build the Contract
Navigate to the Task Bounty folder and compile the contract:
```bash
cd /workspaces/Notify-Chain/Documents/Task\ Bounty

# Build using Stellar CLI
stellar contract build
```

#### Step B.2: Optimize the Binary
```bash
stellar contract optimize \
  --wasm target/wasm32-unknown-unknown/release/task_bounty.wasm
```
This generates the optimized binary at `target/wasm32-unknown-unknown/release/task_bounty.optimized.wasm`.

#### Step B.3: Deploy to Testnet
```bash
stellar contract deploy \
  --wasm target/wasm32-unknown-unknown/release/task_bounty.optimized.wasm \
  --source deployer \
  --network testnet
```
Save the returned contract ID:
```bash
export TASKBOUNTY_CONTRACT_ID=<returned-contract-id>
```

#### Step B.4: Initialize the Contract
The `TaskBounty` contract requires setting up the admin address and a dispute resolver. Call the [initialize](file:///workspaces/Notify-Chain/Documents/Task%20Bounty/src/lib.rs#L38) function:
```bash
stellar contract invoke \
  --id $TASKBOUNTY_CONTRACT_ID \
  --source deployer \
  --network testnet \
  -- \
  initialize \
  --dispute_resolver <DISPUTE_RESOLVER_ADDRESS> \
  --admin <ADMIN_ADDRESS>
```

---

## 4. Contract Verification Process

To ensure reproducible builds, verify contract validity, and guarantee correct function signatures and event catalogs, follow these verification procedures.

### 4.1 Build Hash Verification (Before Deployment)
You can verify the compiled bytecode interface to ensure it hasn't been altered and is safe to deploy:
```bash
# Calculate SHA256 sum of the optimized contract
sha256sum target/wasm32-unknown-unknown/release/*.wasm
```

Inspect the contract ABI interface to confirm function names, categories, and parameters match the code specifications:
```bash
stellar contract inspect --wasm target/wasm32-unknown-unknown/release/hello_world.optimized.wasm
```
Verify that all administrative, group, and scheduled notification functions appear as expected in the output.

### 4.2 State and Version Verification (After Deployment)
To verify that the contract is deployed correctly, call read-only getter functions.

#### For AutoShare:
Query the contract version:
```bash
stellar contract invoke \
  --id $AUTOSHARE_CONTRACT_ID \
  --source deployer \
  --network testnet \
  -- \
  version
```
Expected output: `1`

Verify the contract admin address:
```bash
stellar contract invoke \
  --id $AUTOSHARE_CONTRACT_ID \
  --source deployer \
  --network testnet \
  -- \
  get_admin
```

#### For TaskBounty:
Verify total tasks counter (should return `0` initially after deployment):
```bash
stellar contract invoke \
  --id $TASKBOUNTY_CONTRACT_ID \
  --source deployer \
  --network testnet \
  -- \
  get_total_tasks
```

### 4.3 Event Verification (Integration Stage)
To verify that the contract is emitting events correctly:
1. Call a state-changing method (such as creating an AutoShare group or task).
2. Query the Stellar network logs for the emitted events.

```bash
# Query recent ledger events for the contract
stellar contract event \
  --network testnet \
  --id $AUTOSHARE_CONTRACT_ID \
  --start-ledger <ledger-number-of-deployment>
```
Verify that the output contains the correct event topics (e.g. `AutoshareCreated`) and matching data values.
