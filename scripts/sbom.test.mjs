/**
 * #1002 - SBOM generation + validation tests.
 *
 * Run with: node --test scripts/
 * (Also picked up by CI before the artifact upload, so a regression in either
 * script fails the workflow visibly.)
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

import { parseLockfile, buildSbom, main, npmPurl, parseIntegrity, toCycloneDxHash, serialNumberFor, SbomGenerationError } from './generate-sbom.mjs';
import { validateSbom, SbomValidationError } from './validate-sbom.mjs';

const LOCK_V3 = {
  name: 'listener',
  version: '1.2.3',
  lockfileVersion: 3,
  packages: {
    '': { name: 'listener', version: '1.2.3' },
    'node_modules/foo': {
      version: '2.0.1',
      resolved: 'https://registry.npmjs.org/foo/-/foo-2.0.1.tgz',
      integrity: 'sha512-QUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQQ==',
      license: 'MIT',
    },
    'node_modules/@scope/bar': {
      version: '0.4.0',
      resolved: 'https://registry.npmjs.org/@scope/bar/-/bar-0.4.0.tgz',
      integrity: 'sha1-deadbeef0000000000000000000=',
      dev: true,
    },
    'node_modules/dup': {
      version: '1.0.0',
      resolved: 'https://registry.npmjs.org/dup/-/dup-1.0.0.tgz',
      integrity: 'sha256-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa=',
    },
    // duplicate name@version under another path
    'node_modules/nested/node_modules/dup': {
      version: '1.0.0',
      resolved: 'https://registry.npmjs.org/dup/-/dup-1.0.0.tgz',
      integrity: 'sha256-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa=',
    },
    'node_modules/linked-workspace': { resolved: 'packages/x', link: true },
  },
};

test('parseLockfile: parses lockfileVersion 3 and dedupes by purl', () => {
  const { root, components, skippedLink } = parseLockfile(LOCK_V3);
  assert.equal(root.name, 'listener');
  assert.equal(root.version, '1.2.3');
  // foo, @scope/bar, dup (deduped), linked-workspace skipped
  assert.equal(components.length, 3);
  assert.equal(skippedLink, 1);
  const purls = components.map((c) => c.purl);
  assert.deepEqual([...purls].sort(), purls, 'components must be sorted by purl');
});

test('parseLockfile: carries integrity, license, resolved and dev scope', () => {
  const { components } = parseLockfile(LOCK_V3);
  const foo = components.find((c) => c.name === 'foo');
  assert.equal(foo.version, '2.0.1');
  assert.equal(foo.hashes[0].alg, 'SHA-512');
  assert.match(foo.hashes[0].content, /^[0-9a-f]{128}$/);
  assert.equal(foo.licenses[0].license.id, 'MIT');
  assert.equal(foo.externalReferences[0].url, 'https://registry.npmjs.org/foo/-/foo-2.0.1.tgz');
  const bar = components.find((c) => c.name === '@scope/bar');
  assert.equal(bar.properties[0].value, 'development');
  assert.equal(bar.hashes[0].alg, 'SHA-1');
});

test('parseLockfile: rejects unsupported lockfileVersion', () => {
  assert.throws(() => parseLockfile({ lockfileVersion: 1, packages: {} }), SbomGenerationError);
  assert.throws(() => parseLockfile({ packages: {} }), SbomGenerationError);
});

test('parseLockfile: rejects a lockfile with no packages map', () => {
  assert.throws(() => parseLockfile({ lockfileVersion: 3 }), /no "packages" map/);
});

test('parseLockfile: rejects a lockfile yielding zero components', () => {
  assert.throws(
    () => parseLockfile({ lockfileVersion: 3, packages: { '': {} } }),
    /zero dependency components/,
  );
});

test('parseLockfile: refuses to silently drop an entry missing name/version', () => {
  assert.throws(
    () =>
      parseLockfile({
        lockfileVersion: 3,
        packages: { '': {}, 'node_modules/broken': { resolved: 'x' } },
      }),
    /missing name or version/,
  );
});

test('npmPurl encodes scoped and unscoped names', () => {
  assert.equal(npmPurl('foo', '1.0.0'), 'pkg:npm/foo@1.0.0');
  assert.equal(npmPurl('@scope/bar', '0.4.0'), 'pkg:npm/@scope/bar@0.4.0');
  assert.equal(npmPurl('foo', '1.0.0-beta.1'), 'pkg:npm/foo@1.0.0-beta.1');
});

test('parseIntegrity takes the first SRI hash and rejects junk', () => {
  assert.deepEqual(parseIntegrity('sha512-QUFfoh9O=='), { alg: 'sha512', content: 'QUFfoh9O==' });
  // multiple hashes: the first one wins
  assert.deepEqual(parseIntegrity('sha512-QUFfoh9O== sha1-zzzz'), { alg: 'sha512', content: 'QUFfoh9O==' });
  assert.equal(parseIntegrity(undefined), null);
  assert.equal(parseIntegrity('nodash'), null);
});

test('toCycloneDxHash maps SRI to canonical alg + lowercase hex', () => {
  const h = toCycloneDxHash('sha512-AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8gISIjJCUmJygpKissLS4vMDEyMzQ1Njc4OTo7PD0+Pw==');
  assert.equal(h.alg, 'SHA-512');
  assert.match(h.content, /^[0-9a-f]{128}$/, 'sha512 digest must be 128 hex chars');
  assert.equal(h.content, Buffer.from('AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8gISIjJCUmJygpKissLS4vMDEyMzQ1Njc4OTo7PD0+Pw==', 'base64').toString('hex'));
  assert.equal(toCycloneDxHash('sha1-' + Buffer.alloc(20).toString('base64')).alg, 'SHA-1');
  assert.equal(toCycloneDxHash('crc32-' + Buffer.alloc(4).toString('base64')), null, 'unknown alg dropped');
  assert.equal(toCycloneDxHash('sha256-' + Buffer.alloc(2).toString('base64')), null, 'too-short digest dropped');
  assert.equal(toCycloneDxHash(undefined), null);
});

test('buildSbom emits a valid, deterministic CycloneDX 1.5 document', () => {
  const parsed = parseLockfile(LOCK_V3);
  const ts = 1760000000;
  const a = buildSbom(parsed, { timestamp: ts });
  const b = buildSbom(parseLockfile(LOCK_V3), { timestamp: ts });
  assert.equal(a.bomFormat, 'CycloneDX');
  assert.equal(a.specVersion, '1.5');
  assert.equal(a.metadata.timestamp, new Date(ts * 1000).toISOString());
  assert.equal(a.metadata.component.type, 'application');
  assert.equal(a.metadata.tools[0].name, 'generate-sbom');
  assert.equal(JSON.stringify(a), JSON.stringify(b), 'must be byte-identical for the same input');
  assert.equal(a.serialNumber, serialNumberFor(ts, a.components));
});

test('buildSbom: serial number changes when the timestamp changes', () => {
  const parsed = parseLockfile(LOCK_V3);
  const s1 = buildSbom(parsed, { timestamp: 1760000000 }).serialNumber;
  const s2 = buildSbom(parsed, { timestamp: 1760000001 }).serialNumber;
  assert.notEqual(s1, s2);
});

test('validateSbom: accepts a freshly built document', () => {
  const doc = buildSbom(parseLockfile(LOCK_V3), { timestamp: 1760000000 });
  const r = validateSbom(doc);
  assert.equal(r.ok, true);
  assert.equal(r.components, 3);
});

test('validateSbom: rejects the wrong format/spec/version', () => {
  const doc = buildSbom(parseLockfile(LOCK_V3), { timestamp: 1760000000 });
  assert.throws(() => validateSbom({ ...doc, bomFormat: 'SPDX' }), /bomFormat/);
  assert.throws(() => validateSbom({ ...doc, specVersion: '1.4' }), /specVersion/);
  assert.throws(() => validateSbom({ ...doc, version: 2 }), /version must be 1/);
});

test('validateSbom: rejects a malformed serial number', () => {
  const doc = buildSbom(parseLockfile(LOCK_V3), { timestamp: 1760000000 });
  assert.throws(() => validateSbom({ ...doc, serialNumber: 'not-a-urn' }), /serialNumber/);
});

test('validateSbom: rejects bad metadata.timestamp and missing component', () => {
  const doc = buildSbom(parseLockfile(LOCK_V3), { timestamp: 1760000000 });
  assert.throws(() => validateSbom({ ...doc, metadata: { ...doc.metadata, timestamp: 'x' } }), /timestamp/);
  assert.throws(() => validateSbom({ ...doc, metadata: { timestamp: doc.metadata.timestamp } }), /component/);
});

test('validateSbom: rejects empty components and enforces minComponents', () => {
  const doc = buildSbom(parseLockfile(LOCK_V3), { timestamp: 1760000000 });
  assert.throws(() => validateSbom({ ...doc, components: [] }), /at least 1/);
  assert.throws(() => validateSbom(doc, { minComponents: 100 }), /at least 100/);
  assert.throws(() => validateSbom({ ...doc, components: 'nope' }), /must be an array/);
});

test('validateSbom: rejects duplicate purls and mismatched purl/version', () => {
  const doc = buildSbom(parseLockfile(LOCK_V3), { timestamp: 1760000000 });
  const dup = { ...doc, components: [...doc.components, { ...doc.components[0] }] };
  assert.throws(() => validateSbom(dup), /duplicates/);
  const mismatch = { ...doc, components: doc.components.map((c, i) => (i === 0 ? { ...c, version: '9.9.9' } : c)) };
  assert.throws(() => validateSbom(mismatch), /does not match version/);
});

test('validateSbom: rejects unknown hash algorithms and non-hex content', () => {
  const doc = buildSbom(parseLockfile(LOCK_V3), { timestamp: 1760000000 });
  const badAlg = { ...doc, components: doc.components.map((c) => ({ ...c, hashes: [{ alg: 'CRC32', content: 'a'.repeat(64) }] })) };
  assert.throws(() => validateSbom(badAlg), /not a known CycloneDX algorithm/);
  const badHex = { ...doc, components: doc.components.map((c) => ({ ...c, hashes: [{ alg: 'SHA-256', content: 'ZZZZ'.repeat(16) }] })) };
  assert.throws(() => validateSbom(badHex), /lowercase hex/);
});

test('validateSbom: --require-hashes flags components without hashes', () => {
  const doc = buildSbom(parseLockfile(LOCK_V3), { timestamp: 1760000000 });
  const noHash = {
    ...doc,
    components: doc.components.map((c) => ({ type: c.type, name: c.name, version: c.version, purl: c.purl })),
  };
  assert.throws(() => validateSbom(noHash, { requireHashes: true }), /require-hashes/);
  assert.equal(validateSbom(noHash).ok, true, 'optional by default');
});

test('validateSbom: rejects a non-object document', () => {
  assert.throws(() => validateSbom(null), SbomValidationError);
  assert.throws(() => validateSbom([]), SbomValidationError);
});

test('end-to-end: generate + validate the real listener lockfile', () => {
  const lockPath = path.join(__dirname, '..', 'listener', 'package-lock.json');
  if (!fs.existsSync(lockPath)) {
    // lockfile not present in a sparse checkout; nothing to verify
    return;
  }
  const parsed = parseLockfile(JSON.parse(fs.readFileSync(lockPath, 'utf8')));
  assert.ok(parsed.components.length > 100, `expected a populated lockfile, got ${parsed.components.length}`);
  const doc = buildSbom(parsed, { timestamp: 1760000000 });
  const r = validateSbom(doc, { requireHashes: false });
  assert.equal(r.ok, true);
  assert.equal(r.components, parsed.components.length);
});

test('main(): exits non-zero for a missing or invalid lockfile', () => {
  const origWrite = process.stderr.write;
  process.stderr.write = () => true; // silence expected CLI errors
  try {
    assert.equal(main([]), 2, 'no args');
    assert.equal(main(['/nonexistent/package-lock.json']), 1, 'missing file');
    assert.equal(main([path.join(__dirname, '..', 'README.md')]), 1, 'invalid JSON');
    assert.equal(main([path.join(__dirname, '..', 'package.json')]), 1, 'not a lockfile');
  } finally {
    process.stderr.write = origWrite;
  }
});
