# Deployment Troubleshooting Guide

This guide documents common issues that arise during staging and production deployments of NotifyChain, including configuration mistakes, networking problems, contract deployment failures, and recovery procedures.

> **Intended Audience**: DevOps engineers, deployment maintainers, and system administrators deploying NotifyChain to non-local environments.

---

## Table of Contents

1. [Pre-Deployment Checklist](#1-pre-deployment-checklist)
2. [Contract Deployment Failures](#2-contract-deployment-failures)
3. [Listener Service Deployment](#3-listener-service-deployment)
4. [Database & Storage Issues](#4-database--storage-issues)
5. [Network & Connectivity](#5-network--connectivity)
6. [Stellar Network Integration](#6-stellar-network-integration)
7. [Monitoring & Logging](#7-monitoring--logging)
8. [Recovery Procedures](#8-recovery-procedures)
9. [Rollback Strategies](#9-rollback-strategies)

---

## 1. Pre-Deployment Checklist

Before deploying to staging or production, verify the following:

### Infrastructure Requirements

- [ ] Compute resources meet minimum requirements:
  - **Listener Service**: 512MB RAM minimum, 2 CPU cores recommended
  - **Dashboard**: Static hosting or Node.js server with 256MB RAM
  - **Database**: Sufficient disk space (start with 10GB for SQLite, or managed PostgreSQL)
  
- [ ] Network connectivity:
  - [ ] Outbound HTTPS (443) access to Stellar RPC endpoint
  - [ ] Optional: Inbound HTTP (8787 default) for Listener API
  - [ ] Optional: Outbound HTTPS to Discord webhook URLs
  - [ ] Database connection pool properly configured

- [ ] Secrets management:
  - [ ] All sensitive environment variables stored in secret vault (not in code)
  - [ ] Database credentials encrypted at rest
  - [ ] Admin wallet private keys stored securely
  - [ ] Discord webhook URLs (if used) stored securely

- [ ] Contracts deployed:
  - [ ] AutoShare contract compiled and deployed to target network
  - [ ] TaskBounty contract compiled and deployed (if in use)
  - [ ] Contract addresses documented and accessible
  - [ ] Contract versions match codebase expectations

### Configuration Validation

```bash
# Validate environment variables before deployment
./scripts/validate-config.sh
```

Required environment variables:
```bash
STELLAR_RPC_URL              # Must be testnet or mainnet
STELLAR_NETWORK_PASSPHRASE   # Must match network choice
CONTRACT_IDS                 # Comma-separated list, must be deployed contracts
PORT                         # Should not conflict with other services
DATABASE_PATH                # Must be writable directory or DB connection string
```

---

## 2. Contract Deployment Failures

### ❌ Contract build fails before deployment

**Symptoms:**
- `stellar contract build` fails with compilation errors
- WASM binary is not generated

**Debug steps:**
```bash
# Ensure target is properly installed
rustup target add wasm32-unknown-unknown

# Rebuild from clean state
cd contract
cargo clean
stellar contract build --features opt

# Check for specific compilation errors
cargo build --target wasm32-unknown-unknown --release 2>&1 | tail -50
```

**Common causes:**
- Missing Rust target (see above)
- Version mismatch between soroban-sdk and contract code
- Recent changes to contract code introduce compile errors

**Resolution:**
- Install missing target or update Rust: `rustup update`
- Verify soroban-sdk version in `Cargo.toml`
- Review recent contract code changes for syntax errors

---

### ❌ Contract deployment times out

**Symptoms:**
- `stellar contract deploy` hangs or returns timeout after 5–30 minutes
- No clear error message

**Debug steps:**
```bash
# Check RPC endpoint connectivity
curl -X POST $STELLAR_RPC_URL \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":"1","method":"getHealth","params":[]}'

# Expected response: {"jsonrpc":"2.0","result":{"status":"healthy"},"id":"1"}

# Try with explicit timeout and verbose output
stellar contract deploy --network testnet --verbose 2>&1 | tail -100
```

**Common causes:**
- RPC endpoint is overloaded or unhealthy
- Network connectivity issue between deployment machine and RPC
- Contract WASM binary is too large (> 160KB)
- Transaction queue is congested on the network

**Resolution:**
```bash
# If RPC is unhealthy, wait or switch endpoints:
# Testnet: https://soroban-testnet.stellar.org
# Futurenet: https://rpc-futurenet.stellar.org

# If binary is too large, optimize:
# In Cargo.toml, ensure release profile is optimized:
[profile.release]
opt-level = "z"      # Optimize for size
lto = true           # Enable Link Time Optimization
```

---

### ❌ Contract deployment fails with "Invalid account"

**Symptoms:**
- Error: `error: Invalid account: account does not exist or is not funded`

**Debug steps:**
```bash
# Verify the deploying identity is funded on target network
stellar keys list
stellar keys address DEPLOYING_IDENTITY

# Check account balance on testnet
curl -s "https://horizon-testnet.stellar.org/accounts/GXXXXXX" | jq '.balances'

# For futurenet, use:
curl -s "https://horizon-futurenet.stellar.org/accounts/GXXXXXX" | jq '.balances'
```

**Resolution:**
```bash
# Fund the account via Friendbot (testnet only):
stellar keys generate deploying-id --network testnet
stellar keys fund deploying-id --network testnet

# For futurenet, you must fund manually or use a custom faucet
# For mainnet, fund via your usual method (exchange, etc.)
```

---

### ❌ Contract deployment fails with "Signature verification failed"

**Symptoms:**
- Error: `error: Signature verification failed`
- Transaction is signed but rejected

**Debug steps:**
```bash
# Verify the signing key matches the account
stellar keys list
# The key used should match the account being deployed from

# Check if the account requires specific signature weights
curl -s "https://horizon-testnet.stellar.org/accounts/GXXXXXX" | jq '.thresholds'
```

**Resolution:**
- Ensure you are using the correct identity/private key for the deployment account
- If using multi-sig, ensure all required signers are used
- Verify network passphrase matches: `stellar keys show IDENTITY --network testnet`

---

## 3. Listener Service Deployment

### ❌ Listener fails to start: "Port already in use"

**Symptoms:**
- Error: `EADDRINUSE: address already in use :::8787`
- Service exits immediately on startup

**Debug steps:**
```bash
# Identify the process using the port
lsof -i :8787                        # Linux/macOS
netstat -ano | findstr :8787         # Windows

# Get the process ID (PID) and process name
ps aux | grep PID
```

**Resolution:**
```bash
# Either kill the existing process (if safe):
kill -9 <PID>

# Or change the port in your deployment config:
export PORT=8788
# Then restart the listener
```

---

### ❌ Listener crashes immediately with "Contract not found"

**Symptoms:**
- Listener starts but exits with: `Error: contract CXXXX not found`
- No events are being polled

**Debug steps:**
```bash
# Verify CONTRACT_IDS environment variable
echo $CONTRACT_IDS

# Verify contract is deployed on the configured network
stellar contract info --network testnet CXXXXX

# Check listener logs for which contract failed
# Logs should show: "Subscribed to contract C..." or error messages
```

**Resolution:**
- Ensure `CONTRACT_IDS` contains only valid, deployed contract IDs
- Verify the contract is deployed to the same network as `STELLAR_RPC_URL`
- If using multiple contracts, separate by comma without spaces: `C...,C...,C...`

---

### ❌ Listener runs but API returns no events

**Symptoms:**
- Listener is running (health check passes)
- `GET /api/events` returns empty array `[]`
- No activity on contract

**Debug steps:**
```bash
# 1. Health check
curl http://localhost:8787/health
# Expected: {"status":"ok"}

# 2. Check listener logs
tail -f listener-logs.log | grep -i "event\|contract\|subscription"

# 3. Verify polling is working
# Logs should show: "polling interval: 5000ms" or similar

# 4. Trigger a contract action to generate events
stellar contract invoke --network testnet ... <contract_method>

# 5. Check after 30 seconds (default polling interval)
curl http://localhost:8787/api/events
```

**Common causes:**
- No contract activity on the monitored contracts
- Polling is paused or slow (high `POLLING_INTERVAL_MS`)
- Deduplicator is filtering out duplicate events
- Contract addresses in `CONTRACT_IDS` don't match actual deployed contracts

**Resolution:**
- Generate test activity on contracts: call a contract method that emits events
- Lower `POLLING_INTERVAL_MS` to increase polling frequency (e.g., `1000` for 1-second intervals)
- Check deduplicator logs for filtered events: they are normal
- Verify contract addresses by comparing on-chain (Stellar explorer) vs. environment config

---

### ❌ Listener memory usage grows unbounded

**Symptoms:**
- Listener process memory increases over days/weeks
- Eventually crashes with `SIGKILL` or "Out of memory" error
- No obvious network or disk issues

**Debug steps:**
```bash
# Monitor memory in real-time
top -p <listener_PID>    # Linux
ps aux | grep listener   # Shows VSZ, RSS columns

# Check for memory leaks in Node.js
node --inspect=0.0.0.0:9229 dist/index.js
# Then use Chrome DevTools or clinic.js to profile

# Check event store size
du -sh data/

# Count events in database (SQLite)
sqlite3 data/notifications.db "SELECT COUNT(*) as event_count FROM events;"
```

**Common causes:**
- Event store (database) grows indefinitely without cleanup
- Deduplicator in-memory cache not properly evicting old entries
- Polling produces duplicate events that aren't deduplicated
- Long-running timers or intervals not cleared

**Resolution:**
```bash
# 1. Implement event retention policy (e.g., delete events older than 30 days):
sqlite3 data/notifications.db "DELETE FROM events WHERE created_at < datetime('now', '-30 days');"

# 2. Enable periodic cleanup in listener config:
# Add to .env:
CLEANUP_ENABLED=true
CLEANUP_INTERVAL_MS=3600000  # Once per hour
RETENTION_DAYS=30

# 3. Restart listener:
systemctl restart notify-chain-listener

# 4. Monitor memory after restart:
watch -n 5 'ps aux | grep listener | grep -v grep'
```

---

## 4. Database & Storage Issues

### ❌ Database initialization fails: "No such table"

**Symptoms:**
- Listener starts but crashes: `SQLITE_ERROR: no such table: events`
- Dashboard shows "Database error"

**Debug steps:**
```bash
# Check if database file exists
ls -lh data/notifications.db

# Check if migrations have run
sqlite3 data/notifications.db ".tables"
# Should list: events, notifications, etc.

# Check migration status
grep -i "migration\|schema" listener-logs.log | head -20
```

**Resolution:**
```bash
# Run migrations
cd listener
npm run migrate

# If that fails, check if database is locked:
fuser data/notifications.db       # Show process holding lock
kill -9 <PID>                     # Release the lock

# Retry migration:
npm run migrate

# Verify migration ran:
sqlite3 data/notifications.db "SELECT name FROM sqlite_master WHERE type='table';"
```

---

### ❌ Database disk space is exhausted

**Symptoms:**
- Listener crashes: `SQLITE_CANTOPEN: unable to open database file`
- Dashboard shows error when querying events

**Debug steps:**
```bash
# Check disk usage
df -h
df -h data/

# Check database file size
du -sh data/notifications.db

# Count total events
sqlite3 data/notifications.db "SELECT COUNT(*) as count FROM events;"

# Check average event size
sqlite3 data/notifications.db "SELECT \
  CAST(SUM(LENGTH(CAST(data AS TEXT))) AS REAL) / COUNT(*) as avg_size_bytes \
  FROM events;"
```

**Resolution:**
```bash
# Option 1: Increase disk space (if possible)
# Allocate additional storage to the data directory

# Option 2: Clean up old events
sqlite3 data/notifications.db "DELETE FROM events WHERE created_at < datetime('now', '-7 days');"

# Option 3: Archive and rotate database
# Create backup before deleting
cp data/notifications.db data/notifications.db.backup
sqlite3 data/notifications.db "DELETE FROM events WHERE created_at < datetime('now', '-30 days');"
sqlite3 data/notifications.db "VACUUM;"  # Reclaim space

# Option 4: Migrate to PostgreSQL for scalability
# See migration guide: DATABASE_MIGRATION_GUIDE.md
```

---

### ❌ Database locks prevent deployments

**Symptoms:**
- During deployment, database operations hang
- Error: `database is locked`
- Deployment script times out

**Debug steps:**
```bash
# Check which process has the database open
lsof data/notifications.db
fuser data/notifications.db

# Check for hung listener processes
ps aux | grep listener | grep -v grep
```

**Resolution:**
```bash
# Stop all services that access the database:
systemctl stop notify-chain-listener
systemctl stop notify-chain-dashboard

# Release any locks:
fuser -k data/notifications.db

# Verify database integrity:
sqlite3 data/notifications.db "PRAGMA integrity_check;"

# Restart services:
systemctl start notify-chain-listener
systemctl start notify-chain-dashboard
```

---

## 5. Network & Connectivity

### ❌ Listener cannot reach RPC endpoint

**Symptoms:**
- Listener fails to start: `ENOTFOUND: getaddrinfo ENOTFOUND soroban-testnet.stellar.org`
- Or: `ECONNREFUSED: Connection refused`

**Debug steps:**
```bash
# Test DNS resolution
nslookup soroban-testnet.stellar.org
dig soroban-testnet.stellar.org

# Test HTTPS connectivity
curl -v https://soroban-testnet.stellar.org

# Test from the deployment environment
ssh deploy-server
curl -v $STELLAR_RPC_URL
```

**Common causes:**
- DNS is not configured or is blocking the domain
- Firewall rules block outbound HTTPS (443)
- RPC endpoint URL is malformed or wrong
- Corporate proxy requires authentication

**Resolution:**
```bash
# Verify RPC URL is correct
echo $STELLAR_RPC_URL
# Should be: https://soroban-testnet.stellar.org (or similar valid endpoint)

# If behind a corporate proxy, configure:
export HTTP_PROXY=http://proxy.company.com:8080
export HTTPS_PROXY=http://proxy.company.com:8080
export NO_PROXY=localhost,127.0.0.1,internal.company.com

# Test again with proxy:
curl -v $STELLAR_RPC_URL

# Restart listener with proxy environment:
systemctl set-environment HTTP_PROXY=$HTTP_PROXY
systemctl restart notify-chain-listener
```

---

### ❌ Discord notifications not being delivered

**Symptoms:**
- Listener runs without errors
- Events are polled and stored
- But Discord webhooks are never called

**Debug steps:**
```bash
# Check if webhook URL is set
echo $DISCORD_WEBHOOK_URL

# Test webhook manually
curl -X POST \
  -H 'Content-Type: application/json' \
  -d '{"content":"Test from deployment"}' \
  $DISCORD_WEBHOOK_URL

# Check listener logs for webhook errors
tail -f listener-logs.log | grep -i "discord\|webhook\|notification"

# Verify event data format matches Discord payload schema
grep -A 20 "formatDiscordMessage\|notificationService" listener/src/services/* | head -40
```

**Common causes:**
- `DISCORD_WEBHOOK_URL` is not set or is wrong
- Discord webhook has been revoked or deleted
- Network blocks outbound connections to Discord
- Event data doesn't match expected notification schema

**Resolution:**
```bash
# 1. Regenerate webhook in Discord server settings
# 2. Update DISCORD_WEBHOOK_URL environment variable
# 3. Restart listener:
systemctl restart notify-chain-listener

# 4. Test with a contract action:
stellar contract invoke --network testnet ... <method>

# 5. Check logs within 10 seconds:
tail -n 50 listener-logs.log | grep -i "discord\|webhook"
```

---

## 6. Stellar Network Integration

### ❌ Ledger timestamp is wrong or events have future timestamps

**Symptoms:**
- Event `created_at` timestamps are in the future
- Events are marked as expired but shouldn't be
- Scheduler doesn't pick up due notifications

**Debug steps:**
```bash
# Check listener system time vs. network time
date -u           # System time
curl -s https://soroban-testnet.stellar.org \
  -X POST \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":"1","method":"getLedger","params":[]}' | jq '.result.closeTime'

# Calculate time difference
# Should be within a few seconds

# Check latest ledger timestamp
curl -s https://horizon-testnet.stellar.org/ledgers?order=desc&limit=1 | jq '.records[0].closed_at'
```

**Common causes:**
- System clock is out of sync (clock skew)
- RPC endpoint is lagging behind network consensus
- Events have not been included in a closed ledger yet

**Resolution:**
```bash
# Synchronize system time:
ntpdate -u pool.ntp.org                    # One-time sync
# Or enable NTP daemon:
systemctl start ntpd                       # Linux
launchctl start org.ntp.ntpd               # macOS

# Wait for ledger to close:
# Events typically appear within 3-5 seconds on testnet, 2-3 seconds on mainnet

# For critical deployments, check ledger sequence:
curl -s https://soroban-testnet.stellar.org \
  -X POST \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":"1","method":"getLedger","params":[]}' | jq '.result.sequence'
```

---

### ❌ Contract emits events but listener doesn't see them

**Symptoms:**
- Contract invocation succeeds
- No errors in listener logs
- But event does not appear in API

**Debug steps:**
```bash
# 1. Verify contract invocation succeeded
# Check transaction on Stellar Explorer: https://testnet.stellarexpert.com/

# 2. Check listener polling
grep -i "polling\|ledger\|event" listener-logs.log | tail -50

# 3. Verify contract in subscription list
grep -i "subscribed\|watching" listener-logs.log

# 4. Check if deduplicator filtered the event
grep -i "deduplicate\|duplicate" listener-logs.log | grep <event_id>

# 5. Check database directly
sqlite3 data/notifications.db \
  "SELECT id, contract_id, event_type, created_at FROM events ORDER BY created_at DESC LIMIT 10;"
```

**Common causes:**
- Listener hasn't polled since the transaction was confirmed (polling is slow)
- Event is deduplicated as a duplicate (expected behavior)
- Contract ID in subscription doesn't match event source
- Ledger hasn't closed with the event yet

**Resolution:**
```bash
# 1. Increase polling frequency
export POLLING_INTERVAL_MS=1000
systemctl restart notify-chain-listener

# 2. Wait for next polling cycle and check API:
sleep 2
curl http://localhost:8787/api/events | jq '.[-1]'

# 3. If deduplication is too aggressive, adjust threshold:
export DEDUP_WINDOW_MS=60000  # 1 minute window
systemctl restart notify-chain-listener
```

---

## 7. Monitoring & Logging

### Log Locations

| Service | Log Location | Notes |
|---------|--------------|-------|
| Listener | `/var/log/notify-chain/listener.log` | systemd journal: `journalctl -u notify-chain-listener` |
| Dashboard | `/var/log/notify-chain/dashboard.log` | Check web server logs (nginx, Apache) |
| Database | `/var/log/sqlite3/` or embedded in listener | SQLite logs (if enabled) |

### Key Log Patterns to Monitor

```bash
# Error patterns (grep these to find issues)
grep -E "ERROR|FAIL|PANIC|EXCEPTION" listener-logs.log

# Startup logs (what happened during boot)
grep -A 5 "Listener starting\|initialization\|ready" listener-logs.log

# Event processing
grep "processing event\|emitted" listener-logs.log

# Database operations
grep "database\|query\|migration" listener-logs.log

# Network activity
grep "RPC\|request\|response" listener-logs.log
```

### Set Up Centralized Logging

For production, ship logs to a central location:

```bash
# Using rsyslog (Linux)
sudo tee -a /etc/rsyslog.d/notify-chain.conf <<EOF
:programname, isequal, "notify-chain-listener" /var/log/notify-chain/listener.log
& stop
EOF
sudo systemctl restart rsyslog

# Using logrotate to prevent disk fill
sudo tee -a /etc/logrotate.d/notify-chain <<EOF
/var/log/notify-chain/*.log {
    daily
    rotate 7
    compress
    delaycompress
    notifempty
    create 0640 nobody nobody
    sharedscripts
    postrotate
        systemctl reload notify-chain-listener > /dev/null 2>&1 || true
    endscript
}
EOF
```

---

## 8. Recovery Procedures

### Emergency: Listener is in a bad state

**Goal:** Get the listener back to a clean state without data loss.

```bash
# 1. Stop the listener gracefully
systemctl stop notify-chain-listener
sleep 5

# 2. Back up the database
cp -r data/ data.backup.$(date +%s)

# 3. Check database integrity
sqlite3 data/notifications.db "PRAGMA integrity_check;"

# 4. If corrupted, restore from backup
# (assumes you have a backup from another deployment)

# 5. Restart the listener
systemctl start notify-chain-listener

# 6. Monitor for errors
journalctl -u notify-chain-listener -f
```

### Emergency: Database is corrupted

**Goal:** Recover from a corrupted database with minimal data loss.

```bash
# 1. Stop all services
systemctl stop notify-chain-listener
systemctl stop notify-chain-dashboard

# 2. Dump uncorrupted data (if possible)
sqlite3 data/notifications.db ".recovery data.recovered.sql"

# 3. Back up the corrupted database
mv data/notifications.db data/notifications.db.corrupted

# 4. Create a fresh database
npm run migrate

# 5. Restore data (if recovery succeeded)
sqlite3 data/notifications.db < data.recovered.sql

# 6. Verify data integrity
sqlite3 data/notifications.db "SELECT COUNT(*) as count FROM events;"

# 7. Restart services
systemctl start notify-chain-listener
systemctl start notify-chain-dashboard

# 8. Monitor
journalctl -u notify-chain-listener -f
```

### Emergency: Events are missing from API

**Goal:** Resync events from the Stellar network without redeploying.

```bash
# 1. Stop the listener
systemctl stop notify-chain-listener

# 2. (Optional) Back up current events
sqlite3 data/notifications.db ".backup data/events.backup.db"

# 3. Clear the event store (⚠ will lose in-memory events not yet committed)
sqlite3 data/notifications.db "DELETE FROM events WHERE created_at > datetime('now', '-1 hour');"

# 4. Reset polling state (forces re-poll from current ledger)
sqlite3 data/notifications.db "DELETE FROM polling_state WHERE contract_id IN (SELECT DISTINCT contract_id FROM events LIMIT 1);"

# 5. Restart the listener
systemctl start notify-chain-listener

# 6. The listener will re-poll recent events from the network
# Monitor the logs:
journalctl -u notify-chain-listener -f | grep -i "polling\|event"
```

---

## 9. Rollback Strategies

### Rollback: Contracts

If a contract deployment introduces bugs or issues:

```bash
# 1. Identify the previous working contract ID
git log --oneline | head -10
git show HEAD~1:contract.json | jq '.contractId'

# 2. Update environment to point to old contract:
export CONTRACT_IDS="CXXXXXXXX_OLD"

# 3. Restart listener
systemctl restart notify-chain-listener

# 4. Verify events are flowing from old contract
sleep 5
curl http://localhost:8787/api/events | jq '.[-1].contract_id'

# 5. Once validated, keep the old contract active until new one is vetted
```

### Rollback: Listener Service

If a listener update introduces issues:

```bash
# 1. Identify the previous working version
git log --oneline listener/ | head -5

# 2. Checkout previous version
git checkout HEAD~1 -- listener/

# 3. Rebuild and redeploy
cd listener
npm install
npm run build
systemctl restart notify-chain-listener

# 4. Verify with health check
curl http://localhost:8787/health

# 5. Monitor logs for issues:
journalctl -u notify-chain-listener -f
```

### Rollback: Database

If a migration or change corrupts the database:

```bash
# 1. Stop services
systemctl stop notify-chain-listener
systemctl stop notify-chain-dashboard

# 2. Restore from backup (created before deployment)
rm -rf data/
tar -xzf data.backup.tar.gz

# 3. Restart services
systemctl start notify-chain-listener
systemctl start notify-chain-dashboard

# 4. Verify
curl http://localhost:8787/api/events | jq 'length'
```

---

## Additional Resources

- **Architecture Overview**: [ARCHITECTURE_OVERVIEW.md](./ARCHITECTURE_OVERVIEW.md)
- **System Architecture**: [SYSTEM_ARCHITECTURE.md](./SYSTEM_ARCHITECTURE.md)
- **Contributor Setup**: [CONTRIBUTOR_SETUP.md](./CONTRIBUTOR_SETUP.md)
- **Local Development Troubleshooting**: [TROUBLESHOOTING.md](./TROUBLESHOOTING.md)
- **Stellar Docs**: https://developers.stellar.org/
- **Soroban Docs**: https://developers.stellar.org/learn/fundamentals/soroban

---

## Still need help?

1. Check the [FAQ](./FAQ.md) for common questions.
2. Search [GitHub Issues](https://github.com/Core-Foundry/Notify-Chain/issues).
3. Review [pull request discussions](https://github.com/Core-Foundry/Notify-Chain/pulls) for recent fixes.
4. Open a [new issue](https://github.com/Core-Foundry/Notify-Chain/issues/new) with:
   - Your deployment environment (OS, Kubernetes, Docker, etc.)
   - NotifyChain version and commit hash
   - Full error message and logs
   - Steps already attempted

