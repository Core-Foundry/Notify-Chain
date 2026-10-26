#!/usr/bin/env node
/**
 * SBOM validator (#1002).
 *
 * Validates a CycloneDX SBOM produced by generate-sbom.js so that a broken or
 * empty SBOM fails CI visibly instead of shipping a useless artifact.
 *
 * Checks:
 * - document shape (bomFormat, specVersion, version, serialNumber)
 * - metadata (timestamp parses, application component has name+version)
 * - components: non-empty, each with type/name/version/purl
 * - purl form: pkg:npm/<name>@<version>, version matches component.version
 * - hashes: known CycloneDX algorithms, lowercase hex content
 * - no duplicate purls
 * - optional strict mode: require every component to carry a hash
 *
 * Usage:
 *   node scripts/validate-sbom.js <sbom.json> [--require-hashes] [--min-components N]
 *
 * Exports (for tests): validateSbom, main
 */

import fs from 'fs';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const KNOWN_HASH_ALGS = new Set(['MD5', 'SHA-1', 'SHA-256', 'SHA-384', 'SHA-512', 'SHA3-256', 'SHA3-384', 'SHA3-512', 'BLAKE2b-256', 'BLAKE2b-384', 'BLAKE2b-512', 'BLAKE3']);
const HEX_RE = /^[0-9a-f]+$/;
const SERIAL_RE = /^urn:uuid:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const NPM_PURL_RE = /^pkg:npm\/(?:@[^/@]+\/)?[^@/]+@[^@/]+$/;

class SbomValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'SbomValidationError';
  }
}

/**
 * Validate a parsed SBOM document.
 * Returns { ok: true, components: N } or throws SbomValidationError.
 */
function validateSbom(doc, { requireHashes = false, minComponents = 1 } = {}) {
  const errors = [];
  if (!doc || typeof doc !== 'object' || Array.isArray(doc)) {
    throw new SbomValidationError('SBOM is not a JSON object.');
  }
  if (doc.bomFormat !== 'CycloneDX') {
    errors.push(`bomFormat must be "CycloneDX", got ${JSON.stringify(doc.bomFormat)}`);
  }
  if (doc.specVersion !== '1.5') {
    errors.push(`specVersion must be "1.5", got ${JSON.stringify(doc.specVersion)}`);
  }
  if (doc.version !== 1) {
    errors.push(`document version must be 1, got ${JSON.stringify(doc.version)}`);
  }
  if (typeof doc.serialNumber !== 'string' || !SERIAL_RE.test(doc.serialNumber)) {
    errors.push(`serialNumber must match urn:uuid:<uuid>, got ${JSON.stringify(doc.serialNumber)}`);
  }

  const meta = doc.metadata;
  if (!meta || typeof meta !== 'object') {
    errors.push('metadata is missing');
  } else {
    if (typeof meta.timestamp !== 'string' || Number.isNaN(Date.parse(meta.timestamp))) {
      errors.push('metadata.timestamp is not an ISO-8601 timestamp');
    }
    const comp = meta.component;
    if (!comp || typeof comp !== 'object') {
      errors.push('metadata.component is missing');
    } else {
      if (comp.type !== 'application') errors.push('metadata.component.type must be "application"');
      if (!comp.name) errors.push('metadata.component.name is missing');
      if (!comp.version) errors.push('metadata.component.version is missing');
    }
  }

  const components = doc.components;
  if (!Array.isArray(components)) {
    errors.push('components must be an array');
    throw new SbomValidationError(errors.join('; '));
  }
  if (components.length < minComponents) {
    errors.push(`expected at least ${minComponents} component(s), got ${components.length}`);
  }

  const seen = new Set();
  components.forEach((c, i) => {
    const at = `components[${i}]`;
    if (!c || typeof c !== 'object') {
      errors.push(`${at} is not an object`);
      return;
    }
    if (c.type !== 'library') errors.push(`${at}.type must be "library"`);
    if (!c.name) errors.push(`${at}.name is missing`);
    if (!c.version) errors.push(`${at}.version is missing`);
    if (typeof c.purl !== 'string' || !NPM_PURL_RE.test(c.purl)) {
      errors.push(`${at}.purl is not a valid npm purl: ${JSON.stringify(c.purl)}`);
    } else {
      if (seen.has(c.purl)) errors.push(`${at}.purl duplicates ${c.purl}`);
      seen.add(c.purl);
      const atVersion = c.purl.slice(c.purl.lastIndexOf('@') + 1);
      try {
        if (decodeURIComponent(atVersion) !== c.version) {
          errors.push(`${at}.purl version (${atVersion}) does not match version (${c.version})`);
        }
      } catch {
        errors.push(`${at}.purl version is not URI-encoded correctly`);
      }
    }
    if (Array.isArray(c.hashes)) {
      c.hashes.forEach((h, j) => {
        const hat = `${at}.hashes[${j}]`;
        if (!h || typeof h !== 'object') {
          errors.push(`${hat} is not an object`);
          return;
        }
        if (!KNOWN_HASH_ALGS.has(h.alg)) errors.push(`${hat}.alg ${JSON.stringify(h.alg)} is not a known CycloneDX algorithm`);
        if (typeof h.content !== 'string' || h.content.length < 32 || !HEX_RE.test(h.content)) {
          errors.push(`${hat}.content must be lowercase hex`);
        }
      });
    } else if (requireHashes) {
      errors.push(`${at} has no hashes but --require-hashes was set`);
    }
  });

  if (errors.length > 0) {
    throw new SbomValidationError(
      `SBOM validation failed with ${errors.length} error(s):\n  - ${errors.join('\n  - ')}`,
    );
  }
  return { ok: true, components: components.length };
}

function parseArgs(argv) {
  const out = { positional: [], flags: {} };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--require-hashes') out.flags.requireHashes = true;
    else if (a === '--min-components') out.flags.minComponents = Number(argv[++i]);
    else out.positional.push(a);
  }
  return out;
}

function main(argv = process.argv.slice(2)) {
  const { positional, flags } = parseArgs(argv);
  const file = positional[0];
  if (!file) {
    console.error('Usage: node scripts/validate-sbom.js <sbom.json> [--require-hashes] [--min-components N]');
    return 2;
  }
  let doc;
  try {
    doc = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (err) {
    console.error(`SBOM validation failed: cannot read ${file}: ${err.message}`);
    return 1;
  }
  try {
    const r = validateSbom(doc, {
      requireHashes: Boolean(flags.requireHashes),
      minComponents: Number.isFinite(flags.minComponents) ? flags.minComponents : 1,
    });
    console.log(`SBOM valid: ${r.components} components (${file})`);
    return 0;
  } catch (err) {
    console.error(err.message);
    return 1;
  }
}

if (process.argv[1] === __filename) {
  process.exit(main());
}

export { validateSbom, main, SbomValidationError, NPM_PURL_RE, KNOWN_HASH_ALGS };
