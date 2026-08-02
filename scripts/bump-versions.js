#!/usr/bin/env node
/**
 * bump-versions.js
 *
 * Called by semantic-release's @semantic-release/exec plugin during the
 * "prepare" phase.  It updates the `version` field in:
 *   - dashboard/package.json
 *   - listener/package.json
 *   - contract/contracts/hello-world/Cargo.toml
 *
 * Usage (invoked automatically by semantic-release):
 *   node scripts/bump-versions.js <newVersion>
 *
 * Example:
 *   node scripts/bump-versions.js 1.2.3
 */

'use strict';

const fs   = require('fs');
const path = require('path');

const root    = path.resolve(__dirname, '..');
const version = process.argv[2];

if (!version) {
  console.error('bump-versions.js: missing version argument');
  process.exit(1);
}

// Validate basic semver shape (e.g. 1.2.3 or 1.2.3-beta.1)
if (!/^\d+\.\d+\.\d+/.test(version)) {
  console.error(`bump-versions.js: "${version}" does not look like a semver string`);
  process.exit(1);
}

// ── Helper: update package.json ──────────────────────────────────────────────

function bumpPackageJson(relPath) {
  const file = path.join(root, relPath);
  const pkg  = JSON.parse(fs.readFileSync(file, 'utf8'));
  pkg.version = version;
  fs.writeFileSync(file, JSON.stringify(pkg, null, 2) + '\n');
  console.log(`✔ Updated ${relPath}  →  ${version}`);
}

// ── Helper: update Cargo.toml version line ───────────────────────────────────

function bumpCargoToml(relPath) {
  const file    = path.join(root, relPath);
  let   content = fs.readFileSync(file, 'utf8');

  // Replace the first `version = "x.y.z"` in the [package] section.
  // This regex matches the line in [package] before any [dependencies] section.
  const updated = content.replace(
    /^(version\s*=\s*)"[^"]*"/m,
    `$1"${version}"`
  );

  if (updated === content) {
    console.warn(`⚠  No version field found to update in ${relPath}`);
    return;
  }

  fs.writeFileSync(file, updated);
  console.log(`✔ Updated ${relPath}  →  ${version}`);
}

// ── Run ───────────────────────────────────────────────────────────────────────

bumpPackageJson('dashboard/package.json');
bumpPackageJson('listener/package.json');
bumpCargoToml('contract/contracts/hello-world/Cargo.toml');

console.log(`\nAll version files bumped to ${version}`);
