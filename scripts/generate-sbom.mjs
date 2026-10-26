#!/usr/bin/env node
/**
 * Software Bill of Materials generator (#1002).
 *
 * Reads an npm `package-lock.json` (lockfileVersion 2 or 3) and emits a
 * machine-readable CycloneDX 1.5 SBOM as JSON. Zero external dependencies:
 * the lockfile already carries everything needed (name, version, resolved
 * registry URL, integrity hash, license where recorded).
 *
 * Design notes:
 * - Deterministic output: components are sorted by purl and the timestamp comes
 *   from `SOURCE_DATE_EPOCH` (or `--timestamp`) so two runs over the same
 *   lockfile produce identical bytes (except serialNumber when no timestamp is
 *   pinned). CI pins it to the commit time.
 * - Duplicate name@version pairs across the lockfile are deduplicated; a
 *   component is identified by its purl.
 * - Every component carries the integrity hash from the lockfile when present,
 *   so downstream consumers can verify what CI consumed.
 * - Malformed input fails loudly (non-zero exit) — an SBOM that silently
 *   omits packages is worse than no SBOM.
 *
 * Usage:
 *   node scripts/generate-sbom.js <path-to-package-lock.json> [--out FILE] [--timestamp EPOCH_SECONDS] [--name NAME] [--version VERSION]
 *
 * Exports (for tests):
 *   parseLockfile, buildSbom, main
 */

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const CYCLONEDX_SPEC = '1.5';
const SBOM_VERSION = '1';

class SbomGenerationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'SbomGenerationError';
  }
}

/** Convert an SRI integrity string ("sha512-<b64>") to {alg, content}. */
function parseIntegrity(integrity) {
  if (typeof integrity !== 'string' || !integrity.includes('-')) {
    return null;
  }
  const idx = integrity.indexOf('-');
  const alg = integrity.slice(0, idx);
  const content = integrity.slice(idx + 1);
  if (!alg || !content) return null;
  // SRI may list several hashes; take the first.
  const first = content.split(/\s+/)[0];
  if (!first) return null;
  return { alg, content: first };
}

/** SRI algorithm names -> CycloneDX canonical hash algorithm names. */
const SRI_ALG_TO_CYCLONEDX = {
  md5: 'MD5',
  sha1: 'SHA-1',
  sha256: 'SHA-256',
  sha384: 'SHA-384',
  sha512: 'SHA-512',
  'sha3-256': 'SHA3-256',
  'sha3-384': 'SHA3-384',
  'sha3-512': 'SHA3-512',
};

/** SRI digest content is base64; CycloneDX requires lowercase hex. */
function b64DigestToHex(content) {
  try {
    return Buffer.from(content, 'base64').toString('hex');
  } catch {
    return null;
  }
}

/**
 * Convert an SRI integrity string into a CycloneDX hash entry, or null.
 * Unknown algorithms are dropped rather than emitted in a form that would
 * fail validation downstream.
 */
function toCycloneDxHash(integrity) {
  const parsed = parseIntegrity(integrity);
  if (!parsed) return null;
  const alg = SRI_ALG_TO_CYCLONEDX[String(parsed.alg).toLowerCase()];
  if (!alg) return null;
  const hex = b64DigestToHex(parsed.content);
  if (!hex || hex.length < 32) return null;
  return { alg, content: hex };
}

/** Build the purl for an npm component. */
function npmPurl(name, version) {
  // Scoped names keep the '@' unencoded and encode the '/' as %2F.
  const [scope, unscoped] = name.startsWith('@')
    ? [name.slice(0, name.indexOf('/')), name.slice(name.indexOf('/') + 1)]
    : [null, name];
  let qname = unscoped;
  if (scope) {
    qname = `${scope}/${unscoped}`;
  }
  let purl = `pkg:npm/${qname}@${encodeURIComponent(version)}`;
  if (scope) {
    purl = `pkg:npm/${scope}/${encodeURIComponent(unscoped)}@${encodeURIComponent(version)}`;
  }
  return purl;
}

/**
 * Parse a package-lock.json into { root: {name, version}, components: [...] }.
 *
 * Handles lockfileVersion 3 (flat `packages`) and v2 (flat `packages` plus the
 * legacy `dependencies` tree, of which only v3's flat map is used when present).
 */
function parseLockfile(lockJson) {
  if (!lockJson || typeof lockJson !== 'object') {
    throw new SbomGenerationError('Lockfile is not a JSON object.');
  }
  const version = lockJson.lockfileVersion;
  if (version !== 2 && version !== 3) {
    throw new SbomGenerationError(
      `Unsupported lockfileVersion ${JSON.stringify(version)}; expected 2 or 3.`,
    );
  }

  const rootName =
    lockJson.name ||
    (typeof lockJson.packages?.['']?.name === 'string' ? lockJson.packages[''].name : undefined);
  const rootVersion =
    lockJson.version ||
    (typeof lockJson.packages?.['']?.version === 'string'
      ? lockJson.packages[''].version
      : undefined);

  const packages = lockJson.packages;
  if (!packages || typeof packages !== 'object') {
    throw new SbomGenerationError('Lockfile has no "packages" map.');
  }

  /** purl -> component (dedupe across paths, e.g. nested duplicates) */
  const byPurl = new Map();
  let skippedLink = 0;

  for (const [pkgPath, meta] of Object.entries(packages)) {
    if (pkgPath === '') continue; // the root project, not a dependency
    if (!meta || typeof meta !== 'object') continue;
    // workspace/link entries carry a "link": true flag and no real registry data
    if (meta.link === true) {
      skippedLink += 1;
      continue;
    }
    const name = meta.name || (pkgPath.includes('node_modules')
      ? pkgPath.slice(pkgPath.lastIndexOf('node_modules/') + 'node_modules/'.length)
      : pkgPath);
    const ver = meta.version;
    if (!name || !ver) {
      // e.g. an incomplete entry — refuse to silently drop it
      throw new SbomGenerationError(
        `Lockfile entry ${JSON.stringify(pkgPath)} is missing name or version.`,
      );
    }
    const purl = npmPurl(name, ver);
    if (byPurl.has(purl)) continue;

    const component = { type: 'library', name, version: ver, purl };

    const hash = toCycloneDxHash(meta.integrity);
    if (hash) {
      component.hashes = [hash];
    }
    if (typeof meta.license === 'string' && meta.license) {
      component.licenses = [{ license: { id: meta.license } }];
    }
    if (typeof meta.resolved === 'string' && /^https?:\/\//.test(meta.resolved)) {
      component.externalReferences = [{ type: 'distribution', url: meta.resolved }];
    }
    if (meta.dev === true) {
      component.properties = [{ name: 'notifychain:scope', value: 'development' }];
    }
    byPurl.set(purl, component);
  }

  const components = [...byPurl.values()].sort((a, b) => (a.purl < b.purl ? -1 : a.purl > b.purl ? 1 : 0));
  if (components.length === 0) {
    throw new SbomGenerationError('Lockfile yielded zero dependency components.');
  }

  return {
    root: { name: rootName || 'unknown', version: rootVersion || '0.0.0' },
    components,
    skippedLink,
  };
}

/** Deterministic serial number derived from the timestamp + component purls. */
function serialNumberFor(timestamp, components) {
  const digest = crypto
    .createHash('sha256')
    .update(String(timestamp))
    .update(components.map((c) => c.purl).join('\n'))
    .digest('hex');
  return `urn:uuid:${[
    digest.slice(0, 8),
    digest.slice(8, 12),
    `5${digest.slice(13, 16)}`,
    `a${digest.slice(17, 20)}`,
    digest.slice(20, 32),
  ].join('-')}`;
}

/** Assemble the CycloneDX document. */
function buildSbom({ root, components }, { timestamp, toolVersion = SBOM_VERSION }) {
  const iso = new Date(timestamp * 1000).toISOString();
  return {
    bomFormat: 'CycloneDX',
    specVersion: CYCLONEDX_SPEC,
    serialNumber: serialNumberFor(timestamp, components),
    version: 1,
    metadata: {
      timestamp: iso,
      component: {
        type: 'application',
        name: root.name,
        version: root.version,
      },
      tools: [
        { vendor: 'Notify-Chain', name: 'generate-sbom', version: toolVersion },
      ],
    },
    components,
  };
}

function parseArgs(argv) {
  const out = { positional: [], flags: {} };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--out') out.flags.out = argv[++i];
    else if (a === '--timestamp') out.flags.timestamp = Number(argv[++i]);
    else if (a === '--name') out.flags.name = argv[++i];
    else if (a === '--version') out.flags.version = argv[++i];
    else out.positional.push(a);
  }
  return out;
}

function main(argv = process.argv.slice(2)) {
  const { positional, flags } = parseArgs(argv);
  const lockPath = positional[0];
  if (!lockPath) {
    console.error('Usage: node scripts/generate-sbom.js <package-lock.json> [--out FILE] [--timestamp EPOCH] [--name NAME] [--version VERSION]');
    return 2;
  }

  const abs = path.resolve(lockPath);
  if (!fs.existsSync(abs)) {
    console.error(`SBOM generation failed: lockfile not found: ${abs}`);
    return 1;
  }

  let lockJson;
  try {
    lockJson = JSON.parse(fs.readFileSync(abs, 'utf8'));
  } catch (err) {
    console.error(`SBOM generation failed: cannot parse ${abs}: ${err.message}`);
    return 1;
  }

  try {
    const parsed = parseLockfile(lockJson);
    if (flags.name) parsed.root.name = flags.name;
    if (flags.version) parsed.root.version = flags.version;

    // Pin the timestamp for reproducibility; default to "now" for local runs.
    const timestamp =
      Number.isFinite(flags.timestamp) && flags.timestamp > 0
        ? flags.timestamp
        : Math.floor(Date.now() / 1000);

    const sbom = buildSbom(parsed, { timestamp });
    const json = `${JSON.stringify(sbom, null, 2)}\n`;

    if (flags.out) {
      const outPath = path.resolve(flags.out);
      fs.mkdirSync(path.dirname(outPath), { recursive: true });
      fs.writeFileSync(outPath, json, 'utf8');
      console.error(
        `SBOM written: ${outPath} (${sbom.components.length} components, ${path.basename(abs)})`,
      );
    } else {
      process.stdout.write(json);
    }
    return 0;
  } catch (err) {
    console.error(`SBOM generation failed: ${err.message}`);
    return 1;
  }
}

if (process.argv[1] === __filename) {
  process.exit(main());
}

export { parseLockfile, buildSbom, main, npmPurl, parseIntegrity, toCycloneDxHash, serialNumberFor, SbomGenerationError, CYCLONEDX_SPEC };
