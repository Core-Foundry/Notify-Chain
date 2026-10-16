# NotifyChain Glossary

This glossary defines key terms used throughout the NotifyChain project, covering NotifyChain-specific concepts, the Soroban smart contract platform, the Stellar network, and notification system terminology. It is intended to help new contributors quickly get up to speed with the language used across the codebase, documentation, and issues. Terms are listed in alphabetical order.

---

### AutoShare

A Soroban smart contract included in the NotifyChain project (`contract/contracts/hello-world/`) that manages subscription groups and shared resource access. It allows users to create groups, manage members, handle subscription payments, track usage, and transfer admin rights. The contract emits structured events (e.g., `AutoshareCreated`, `GroupDeactivated`) that the Listener Service picks up and forwards as notifications.

---

### AuditRecordAppended

An event emitted when a new entry is written to the notification audit log. Audit records capture lifecycle milestones such as notification creation, delivery attempts, failures, and acknowledgments to support compliance and operational monitoring. These records are intended to be immutable after creation so that the audit trail cannot be altered retroactively.

---

### BatchNotificationsCreated

An event emitted when a single transaction creates multiple notifications at once using the batch creation mechanism. Batching reduces gas costs and operational overhead compared to creating notifications individually. The event carries enough metadata for consumers to identify each notification that was created in the batch.

---

### BlockchainEvent

A structured data record emitted by a Soroban smart contract when a significant state change occurs (e.g., a task is created, a payment is made). Blockchain events are the primary signal that the off-chain Listener Service monitors; they are recorded in the ledger and can be retrieved via the Stellar RPC. In NotifyChain, every important contract action should produce at least one blockchain event so that off-chain systems can react without polling contract state directly.

---

### ContractAddress

A unique identifier assigned to a deployed Soroban smart contract on the Stellar network. It is encoded as a Strkey with a `C` prefix and is used when invoking contract functions or subscribing the Listener Service to a specific contract's events. In configuration files and CLI commands, the contract address is typically referred to as `CONTRACT_ID`.

---

### Deduplication

The process of detecting and discarding events that have already been processed, preventing the same notification from being delivered more than once. In NotifyChain the `NotificationDeduplicator` service (`listener/src/services/notification-deduplicator.ts`) tracks seen events by a composite key of contract address and event ID. Deduplication is essential because the Listener Service polls the Stellar RPC on an interval and may retrieve the same event multiple times.

---

### Discord Webhook

A URL provided by Discord that allows external services to post messages to a specific channel without OAuth authentication. The NotifyChain Listener Service uses a configured Discord webhook URL to forward blockchain events as human-readable notifications in real time. The `DiscordNotificationService` (`listener/src/services/discord-notification.ts`) formats each event and sends it to this endpoint.

---

### EventId

A unique identifier assigned to each blockchain event within a contract's event stream. The Listener Service uses the event ID, combined with the contract address, as the key for deduplication so that replayed or re-fetched events are not processed twice. Event IDs are assigned by the Soroban runtime and are included in the raw event data returned by the Stellar RPC.

---

### EventRegistry

The in-memory store maintained by the Listener Service that holds all events received from monitored contracts during the current process lifetime (`listener/src/store/`). The dashboard queries this registry via the `GET /api/events` endpoint to render real-time contract activity. Because the registry is in-memory, it is reset when the Listener Service restarts; persistent storage would require an external database.

---

### EventSubscriber

The component of the Listener Service (`listener/src/services/event-subscriber.ts`) responsible for periodically polling the Stellar RPC for new contract events. It manages reconnection on failure, hands raw events to the deduplicator, and records accepted events in the EventRegistry. The polling interval and the list of contracts to watch are controlled by environment configuration.

---

### Freighter

A browser extension wallet for the Stellar network that allows users to store keys, sign transactions, and interact with Soroban dApps without exposing their private key to web pages. NotifyChain's frontend integrates with Freighter via the `window.freighter` API to request account access and obtain transaction signatures. The README documents four UX states (`disconnected`, `connected`, `waiting_for_signature`, `error`) that every UI depending on the wallet must handle.

---

### Friendbot

A testnet faucet service provided by the Stellar Development Foundation that funds a new account with test XLM so it can pay transaction fees. It is used during local development and CI to bootstrap test identities without requiring real funds. The Stellar CLI command `stellar keys fund <identity> --network testnet` calls Friendbot under the hood.

---

### Horizon

The REST API server for the Stellar network maintained by the Stellar Development Foundation. Horizon exposes endpoints for querying accounts, transactions, operations, and ledger data. While NotifyChain primarily uses the Soroban RPC for contract event retrieval, Horizon is useful for inspecting account balances, transaction history, and other network-level data during development and debugging.

---

### Ledger

A single, globally-agreed-upon block of transactions on the Stellar network, produced approximately every 5 seconds through the Stellar Consensus Protocol. Each ledger has a sequence number and contains all transactions that were approved in that round. When the Listener Service polls for events, it typically tracks the last processed ledger sequence to avoid re-fetching old data.

---

### Listener Service

The off-chain Node.js/TypeScript service (`listener/`) that bridges the Stellar blockchain and human-readable notifications. It polls configured contracts for new blockchain events, deduplicates them, stores them in the EventRegistry, sends Discord notifications, and exposes an HTTP API (`GET /api/events`, `GET /health`) that the dashboard consumes. The Listener Service is the central processing engine of the NotifyChain architecture.

---

### NotificationCategory

Metadata attached to a notification event that describes the type or class of notification (e.g., payment, dispute, membership change). Consumers use the category to filter and selectively process only the events relevant to them, reducing unnecessary work. Adding category metadata to emitted events is part of the notification filtering feature planned in the project backlog.

---

### NotificationPriority

A field on a notification that indicates its relative urgency or importance (e.g., low, normal, high, critical). Priority information allows consumers and delivery channels to apply different handling logic, such as sending high-priority notifications immediately while batching low-priority ones. It is part of the extended notification metadata model being developed for NotifyChain.

---

### NotificationScheduled

An event emitted when a notification is queued for future delivery rather than sent immediately. It records the intended delivery time and the notification payload so that the system can resume delivery even after a restart. This event is part of the notification lifecycle and feeds into the audit log.

---

### NotifyChain

The open-source event monitoring and notification system that is the subject of this repository. It combines on-chain Soroban smart contracts (which emit structured events) with an off-chain Listener Service (which consumes those events and triggers notifications) and a React dashboard (which visualizes activity in real time). The name reflects its purpose: chaining on-chain notifications to off-chain consumers.

---

### Passphrase (Network)

A human-readable string that uniquely identifies a Stellar network and is incorporated into every transaction signature to prevent replay attacks across networks. The Testnet passphrase is `Test SDF Network ; September 2015` and the Mainnet passphrase is `Public Global Stellar Network ; September 2015`. When building or signing transactions, the passphrase must match the network selected in Freighter; a mismatch is a common source of `txBAD_SEQ` or signature errors during development.

---

### Processed Event

A blockchain event that has passed through the full Listener Service pipeline: fetched from the RPC, validated, deduplicated, recorded in the EventRegistry, and (if a webhook is configured) forwarded to a notification channel. Once an event is marked as processed, the deduplicator prevents it from triggering duplicate notifications in subsequent polling cycles.

---

### RPC (Remote Procedure Call)

In the Stellar/Soroban context, a JSON-RPC server endpoint that exposes Soroban-specific methods such as `getEvents`, `simulateTransaction`, and `sendTransaction`. The Listener Service's EventSubscriber communicates with a Soroban RPC node (configured via `RPC_URL`) to fetch contract events. Unlike Horizon (which covers the classic Stellar protocol), the Soroban RPC is needed for reading smart contract state and events.

---

### Scheduled Notification

A notification whose delivery is deferred to a future point in time rather than being dispatched immediately when the triggering event occurs. The NotifyChain system tracks scheduled notifications through their own lifecycle events (`NotificationScheduled`) and ensures they are delivered at the configured time even if the Listener Service restarts in the interim. Scheduled notifications are persisted in the notification store alongside their target delivery timestamps.

---

### Soroban

Stellar's smart contract platform, built on WebAssembly (Wasm) and written in Rust. Soroban contracts run deterministically on the Stellar network, can hold and transfer assets, and emit structured events that external services can observe. NotifyChain's on-chain layer is built entirely on Soroban.

---

### Stellar

A public, open-source blockchain network designed for fast, low-cost financial transactions and asset issuance. Stellar uses the Stellar Consensus Protocol (SCP) for agreement and produces a new ledger roughly every 5 seconds. NotifyChain is built on Stellar because of its low transaction fees, fast finality, and first-class smart contract support through Soroban.

---

### Stellar CLI

The official command-line tool (`stellar`) for interacting with Soroban smart contracts and the Stellar network. It supports building and optimizing contract Wasm binaries, deploying contracts, invoking contract functions, managing key identities, and funding testnet accounts via Friendbot. NotifyChain's development workflow relies heavily on the Stellar CLI for contract compilation, deployment, and manual testing.

---

### Strkey

A base32-encoded string format used by Stellar to represent cryptographic keys and contract addresses in a human-readable, error-resistant way. Account public keys start with `G`, secret keys with `S`, and contract addresses with `C`. Strkeys include a checksum to catch transcription errors and are the standard format used in configuration files, CLI commands, and on-chain storage throughout NotifyChain.

---

### TaskBounty

A Soroban smart contract (`Documents/Task Bounty/`) that implements a decentralized task and reward board. It allows users to post tasks with escrowed rewards, submit work, approve or reject submissions, and raise disputes, with payouts handled automatically by the contract. The TaskBounty contract is one of the two primary example contracts in the NotifyChain project and emits events such as `TaskCreated`, `WorkSubmitted`, `SubmissionApproved`, and `DisputeRaised`.

---

### Transaction Hash (txHash)

A 32-byte cryptographic hash that uniquely identifies a transaction on the Stellar network, typically displayed as a 64-character hexadecimal string. It is generated from the transaction's contents and can be used to look up the transaction on Horizon or a block explorer. In the NotifyChain Listener Service, the transaction hash is recorded alongside events to provide a traceable link back to the on-chain operation that triggered a notification.

---

### XDR

External Data Representation — a binary serialization format used by the Stellar network to encode transactions, ledger entries, and other protocol data structures. All data sent to and received from the Stellar network (including transactions and events) is XDR-encoded. The Stellar SDK and Stellar CLI handle XDR encoding and decoding automatically; contributors rarely need to work with raw XDR unless debugging low-level protocol issues.

---

### XLM

The native cryptocurrency of the Stellar network, also called "lumens." XLM is used to pay transaction fees (a small fraction of a lumen per operation) and to meet the minimum balance requirements for accounts and contract storage. During development, free test XLM is obtained from Friendbot via `stellar keys fund <identity> --network testnet`.
