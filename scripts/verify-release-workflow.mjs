#!/usr/bin/env node
/**
 * CI entry point for release artifact verification (#1003).
 *
 * `scripts/release-artifacts.mjs` is the tool; this script is what CI runs to
 * *validate the release workflow itself*. It proves, on every push/PR, that the
 * generate → sign → attest → verify pipeline still works and still detects
 * tampering — so a regression in the release tooling fails the build instead of
 * shipping an unverifiable release.
 *
 * It runs entirely offline with an ephemeral Ed25519 key in a temp directory,
 * then removes it. No secrets, no network, no external dependencies.
 *
 * Usage:
 *   node scripts/verify-release-workflow.mjs [--keep]
 *
 * Exit codes: 0 = release workflow valid, 1 = a check failed, 2 = unexpected error.
 */

import fs from 'fs';
import os from 'os';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

import {
  buildManifest,
  signManifest,
  createAttestation,
  verifyManifest,
  verifyAttestation,
  sha256Buffer,
} from './release-artifacts.mjs';

const results = [];

function check(name, fn) {
  try {
    fn();
    results.push({ name, ok: true });
  } catch (err) {
    results.push({ name, ok: false, error: err.message });
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function assertEqual(actual, expected, message) {
  if (actual !== expected) throw new Error(`${message}: expected ${expected}, got ${actual}`);
}

function run() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nc-release-ci-'));
  try {
    const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
    const privatePem = privateKey.export({ type: 'pkcs8', format: 'pem' });
    const publicPem = publicKey.export({ type: 'spki', format: 'pem' });

    const artifacts = [
      ['dist/app.tar.gz', 'notify-chain release payload'],
      ['dist/checksums.txt', 'placeholder checksums'],
    ];
    for (const [rel, body] of artifacts) {
      const full = path.join(dir, rel);
      fs.mkdirSync(path.dirname(full), { recursive: true });
      fs.writeFileSync(full, body);
    }

    const manifest = buildManifest({
      artifacts: artifacts.map(([p]) => p),
      name: 'notify-chain',
      version: '0.0.0-ci',
      createdAt: '1970-01-01T00:00:00.000Z',
      baseDir: dir,
    });

    check('manifest lists every artifact with a sha256 checksum', () => {
      assertEqual(manifest.artifacts.length, 2, 'artifact count');
      for (const entry of manifest.artifacts) {
        assert(/^[0-9a-f]{64}$/.test(entry.sha256), `bad sha256 for ${entry.path}`);
      }
    });

    check('manifest is deterministic for identical inputs', () => {
      const again = buildManifest({
        artifacts: artifacts.map(([p]) => p),
        name: 'notify-chain',
        version: '0.0.0-ci',
        createdAt: '1970-01-01T00:00:00.000Z',
        baseDir: dir,
      });
      assertEqual(JSON.stringify(again), JSON.stringify(manifest), 'determinism');
    });

    const signed = signManifest(manifest, privatePem);

    check('manifest is signed with a stable key id', () => {
      assertEqual(signed.signature.algorithm, 'ed25519', 'algorithm');
      assert(signed.signature.keyId.length === 32, 'key id length');
    });

    const attestation = createAttestation(signed, {
      privateKey: privatePem,
      predicate: { builder: { id: 'notify-chain/ci' } },
    });

    check('attestation binds artifact digests to the build', () => {
      const statement = JSON.parse(Buffer.from(attestation.payload, 'base64').toString('utf8'));
      assertEqual(statement.subject.length, 2, 'subject count');
      assertEqual(statement.subject[0].digest.sha256, manifest.artifacts[0].sha256, 'subject digest');
    });

    check('signed manifest + attestation verify cleanly', () => {
      const report = verifyManifest(signed, {
        baseDir: dir,
        publicKey: publicPem,
        requireSignature: true,
        attestation,
        requireAttestation: true,
      });
      assert(report.ok, `verification failed: ${report.errors.join('; ')}`);
    });

    check('verification rejects a tampered artifact', () => {
      fs.writeFileSync(path.join(dir, 'dist/app.tar.gz'), 'tampered');
      const report = verifyManifest(signed, { baseDir: dir, publicKey: publicPem, requireSignature: true });
      assert(!report.ok, 'tampering was not detected');
      // restore for any later check
      fs.writeFileSync(path.join(dir, 'dist/app.tar.gz'), 'notify-chain release payload');
    });

    check('verification rejects an unsigned manifest when a signature is required', () => {
      const report = verifyManifest(manifest, { baseDir: dir, publicKey: publicPem, requireSignature: true });
      assert(!report.ok, 'unsigned manifest accepted');
    });

    check('verification rejects an attestation signed by a different key', () => {
      const other = crypto.generateKeyPairSync('ed25519').publicKey.export({ type: 'spki', format: 'pem' });
      const result = verifyAttestation(attestation, { publicKey: other, manifest: signed });
      assert(!result.valid, 'foreign-key attestation accepted');
    });

    check('sha256 matches a known vector', () => {
      assertEqual(
        sha256Buffer('abc'),
        'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
        'sha256("abc")'
      );
    });
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

run();

const failed = results.filter((r) => !r.ok);
for (const r of results) {
  process.stdout.write(`  ${r.ok ? 'ok  ' : 'FAIL'} ${r.name}${r.ok ? '' : ` — ${r.error}`}\n`);
}
process.stdout.write(
  failed.length === 0
    ? `\nRelease workflow valid (${results.length} checks passed).\n`
    : `\nRelease workflow INVALID (${failed.length}/${results.length} checks failed).\n`
);

if (failed.length > 0) process.exit(1);
