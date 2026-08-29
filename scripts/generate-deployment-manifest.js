#!/usr/bin/env node
/**
 * Contract Deployment Artifact Manifest Generator (Issue #716)
 *
 * Captures essential contract deployment metadata into a deterministic JSON manifest.
 * Guarantees zero secret keys or sensitive credentials are ever persisted.
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

function getGitCommit() {
  try {
    return execSync('git rev-parse HEAD', { encoding: 'utf-8' }).trim();
  } catch {
    return 'unknown';
  }
}

function generateDeploymentManifest(options = {}) {
  const contractId = options.contractId || process.env.CONTRACT_ID || 'CA7QYNF7SOWQ3GLR2BGMZEHXAVIRZA4KVWLTJJFC7MGXUA64P7TV5A4W';
  const network = options.network || process.env.STELLAR_NETWORK || 'testnet';
  const rpcUrl = options.rpcUrl || process.env.STELLAR_RPC_URL || 'https://soroban-testnet.stellar.org';
  const networkPassphrase =
    options.networkPassphrase ||
    process.env.STELLAR_NETWORK_PASSPHRASE ||
    'Test SDF Network ; September 2015';
  const deployer = options.deployer || process.env.STELLAR_ACCOUNT_ID || 'GBRPYHIL2CI3WHGSUJGY6O7SROQOMJG7QBCACN4QPKUOQNXJDGONXHPA';
  const wasmHash = options.wasmHash || process.env.WASM_HASH || 'd4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5';

  // Security Invariant: Detect and throw if any secret keys are inadvertently passed
  const allValues = [contractId, network, rpcUrl, networkPassphrase, deployer, wasmHash].join(' ');
  if (/\bS[A-Z2-7]{55}\b/.test(allValues)) {
    throw new Error('SECURITY VIOLATION: Secret key detected in deployment manifest inputs!');
  }

  const manifest = {
    schema_version: '1.0.0',
    contract: {
      id: contractId,
      name: 'notify-chain-events',
      wasm_hash: wasmHash,
    },
    network: {
      name: network,
      rpc_url: rpcUrl,
      passphrase: networkPassphrase,
    },
    deployment: {
      deployer_public_key: deployer,
      timestamp: new Date().toISOString(),
      git_commit: getGitCommit(),
    },
  };

  return manifest;
}

function main() {
  const outputPath = process.argv[2] || path.join(__dirname, '../deployments/deployment-manifest.json');
  const dir = path.dirname(outputPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const manifest = generateDeploymentManifest();
  fs.writeFileSync(outputPath, JSON.stringify(manifest, null, 2) + '\n', 'utf-8');
  console.log(`✅ Deployment manifest generated successfully at: ${outputPath}`);
}

if (require.main === module) {
  main();
}

module.exports = { generateDeploymentManifest };
