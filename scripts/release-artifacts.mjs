#!/usr/bin/env node
/**
 * Signed release artifact manifest generator + verifier (#1003).
 *
 * Establishes a verifiable release process: every published artifact gets a
 * SHA-256 checksum recorded in a deterministic manifest, the manifest can be
 * signed with an Ed25519 key (detached, offline-verifiable), and an in-toto /
 * SLSA-style signed attestation binds the manifest's subject digests to a
 * builder. Verification needs nothing but Node's built-in `crypto` module — no
 * external tooling, no network access — so end users can check integrity and
 * provenance with a single command.
 *
 * Zero external dependencies (node:crypto / node:fs only).
 *
 * Design notes:
 * - Deterministic manifests: artifacts are sorted by logical path and the
 *   timestamp comes from `--timestamp` / `SOURCE_DATE_EPOCH`, so the same inputs
 *   produce byte-identical output.
 * - Signatures cover a *canonical* JSON serialisation (recursively sorted keys)
 *   of the manifest payload with `signature`/`attestation` stripped, so signing
 *   and verification are independent of key ordering or whitespace.
 * - `keyId` is the first 32 hex chars of the SHA-256 of the public key's SPKI
 *   DER encoding — stable across PEM formatting differences.
 * - Verification never throws for "artifact is bad"; it returns a structured
 *   report and the CLI maps that to an exit code so CI can gate on it. Structural
 *   problems (malformed manifest) throw `ReleaseVerificationError`.
 *
 * CLI:
 *   node scripts/release-artifacts.mjs generate \
 *     --artifacts dist/notify-chain.tar.gz,dist/checksums.txt \
 *     --name notify-chain --version 1.2.3 \
 *     --out release/manifest.json \
 *     --private-key release-signing.key.pem \
 *     --attestation-out release/attestation.json
 *
 *   node scripts/release-artifacts.mjs verify \
 *     --manifest release/manifest.json \
 *     --base-dir . \
 *     --public-key release-signing.pub.pem \
 *     --require-signature \
 *     --attestation release/attestation.json --require-attestation
 *
 * Exit codes: 0 = verified, 1 = verification failed, 2 = usage/IO error.
 *
 * See docs/RELEASE_ARTIFACT_VERIFICATION.md for end-user instructions.
 */

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

export const MANIFEST_SCHEMA_VERSION = '1.0';
export const IN_TOTO_STATEMENT_TYPE = 'https://in-toto.io/Statement/v0.1';
export const DEFAULT_PREDICATE_TYPE = 'https://slsa.dev/provenance/v0.2';
export const DSSE_PAYLOAD_TYPE = 'application/vnd.in-toto+json';
export const SIGNATURE_ALGORITHM = 'ed25519';

/** Thrown for structural problems (bad manifest, bad args) — not for a failed check. */
export class ReleaseVerificationError extends Error {
  constructor(message, code = 'RELEASE_VERIFICATION_ERROR') {
    super(message);
    this.name = 'ReleaseVerificationError';
    this.code = code;
  }
}

/* ------------------------------------------------------------------ *
 * Hashing
 * ------------------------------------------------------------------ */

/** SHA-256 hex digest of a Buffer/string. */
export function sha256Buffer(data) {
  return crypto.createHash('sha256').update(data).digest('hex');
}

/** SHA-256 hex digest of a file's contents (streamed). */
export function sha256File(filePath) {
  return sha256Buffer(fs.readFileSync(filePath));
}

/* ------------------------------------------------------------------ *
 * Canonical JSON
 * ------------------------------------------------------------------ */

/** Recursively sort object keys so serialisation is order-independent. */
export function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === 'object') {
    const out = {};
    for (const key of Object.keys(value).sort()) out[key] = canonicalize(value[key]);
    return out;
  }
  return value;
}

/** Deterministic JSON string used for signing/verifying. */
export function canonicalJson(value) {
  return JSON.stringify(canonicalize(value));
}

/* ------------------------------------------------------------------ *
 * Keys + signatures (Ed25519)
 * ------------------------------------------------------------------ */

function toPublicKey(publicKey) {
  if (publicKey && typeof publicKey === 'object' && publicKey.type === 'public') return publicKey;
  try {
    return crypto.createPublicKey(publicKey);
  } catch (err) {
    throw new ReleaseVerificationError(`invalid public key: ${err.message}`, 'KEY_INVALID');
  }
}

function toPrivateKey(privateKey) {
  if (privateKey && typeof privateKey === 'object' && privateKey.type === 'private') return privateKey;
  try {
    return crypto.createPrivateKey(privateKey);
  } catch (err) {
    throw new ReleaseVerificationError(`invalid private key: ${err.message}`, 'KEY_INVALID');
  }
}

/** Stable key identifier: SHA-256(SPKI DER) truncated to 32 hex chars. */
export function keyIdFromPublicKey(publicKey) {
  const key = toPublicKey(publicKey);
  const der = key.export({ type: 'spki', format: 'der' });
  return sha256Buffer(der).slice(0, 32);
}

/** Sign bytes with an Ed25519 private key (PEM string or KeyObject); returns base64. */
export function signBytes(data, privateKey) {
  const key = toPrivateKey(privateKey);
  return crypto.sign(null, Buffer.from(data), key).toString('base64');
}

/** Verify an Ed25519 base64 signature. Returns false (never throws) on mismatch. */
export function verifyBytes(data, signatureB64, publicKey) {
  let key;
  try {
    key = toPublicKey(publicKey);
  } catch {
    return false;
  }
  if (typeof signatureB64 !== 'string' || signatureB64.length === 0) return false;
  try {
    return crypto.verify(null, Buffer.from(data), key, Buffer.from(signatureB64, 'base64'));
  } catch {
    return false;
  }
}

/* ------------------------------------------------------------------ *
 * Manifest build / sign
 * ------------------------------------------------------------------ */

function resolveArtifactPath(artifactPath, baseDir) {
  const abs = path.isAbsolute(artifactPath) ? artifactPath : path.resolve(baseDir, artifactPath);
  const rel = path.relative(baseDir, abs);
  const logical = (rel === '' || rel.startsWith('..') ? path.basename(abs) : rel).split(path.sep).join('/');
  return { abs, logical };
}

/**
 * Build an unsigned manifest. `artifacts` may be strings or `{ path }` objects.
 * Throws if required metadata is missing, the artifact list is empty, a file is
 * unreadable, or a logical path is duplicated.
 */
export function buildManifest({ artifacts, name, version, createdAt, baseDir = process.cwd() } = {}) {
  if (typeof name !== 'string' || name.trim() === '') {
    throw new ReleaseVerificationError('manifest requires a non-empty "name"', 'MANIFEST_INVALID');
  }
  if (typeof version !== 'string' || version.trim() === '') {
    throw new ReleaseVerificationError('manifest requires a non-empty "version"', 'MANIFEST_INVALID');
  }
  if (!Array.isArray(artifacts) || artifacts.length === 0) {
    throw new ReleaseVerificationError('manifest requires at least one artifact', 'MANIFEST_EMPTY');
  }

  const seen = new Set();
  const entries = [];
  for (const artifact of artifacts) {
    const raw = typeof artifact === 'string' ? artifact : artifact && artifact.path;
    if (typeof raw !== 'string' || raw.trim() === '') {
      throw new ReleaseVerificationError(`invalid artifact entry: ${JSON.stringify(artifact)}`, 'MANIFEST_INVALID');
    }
    const { abs, logical } = resolveArtifactPath(raw, baseDir);
    if (seen.has(logical)) {
      throw new ReleaseVerificationError(`duplicate artifact path: ${logical}`, 'MANIFEST_INVALID');
    }
    seen.add(logical);
    let stat;
    try {
      stat = fs.statSync(abs);
    } catch (err) {
      throw new ReleaseVerificationError(`cannot read artifact ${raw}: ${err.code || err.message}`, 'ARTIFACT_UNREADABLE');
    }
    if (!stat.isFile()) {
      throw new ReleaseVerificationError(`artifact is not a regular file: ${raw}`, 'ARTIFACT_UNREADABLE');
    }
    entries.push({ path: logical, size: stat.size, sha256: sha256File(abs) });
  }
  entries.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));

  const stamp = createdAt ?? resolveCreatedAt();
  return {
    schemaVersion: MANIFEST_SCHEMA_VERSION,
    name,
    version,
    createdAt: stamp,
    artifacts: entries,
  };
}

function resolveCreatedAt() {
  const epoch = process.env.SOURCE_DATE_EPOCH;
  if (epoch && /^\d+$/.test(epoch)) return new Date(Number(epoch) * 1000).toISOString();
  return new Date().toISOString();
}

/** The bytes that signatures cover: manifest minus its own signature/attestation. */
export function manifestPayload(manifest) {
  const { signature, attestation, ...payload } = manifest || {};
  return payload;
}

/** Attach an Ed25519 signature over the canonical manifest payload. */
export function signManifest(manifest, privateKey) {
  const payload = manifestPayload(manifest);
  const keyId = keyIdFromPublicKey(crypto.createPublicKey(toPrivateKey(privateKey)));
  return {
    ...payload,
    signature: {
      algorithm: SIGNATURE_ALGORITHM,
      keyId,
      signature: signBytes(canonicalJson(payload), privateKey),
    },
  };
}

/* ------------------------------------------------------------------ *
 * Attestation (in-toto Statement wrapped in a DSSE envelope)
 * ------------------------------------------------------------------ */

/** Create a signed in-toto/SLSA-style attestation whose subjects are the manifest artifacts. */
export function createAttestation(manifest, { privateKey, predicateType = DEFAULT_PREDICATE_TYPE, predicate = {} } = {}) {
  if (!manifest || !Array.isArray(manifest.artifacts)) {
    throw new ReleaseVerificationError('createAttestation requires a manifest with artifacts', 'MANIFEST_INVALID');
  }
  if (!privateKey) {
    throw new ReleaseVerificationError('createAttestation requires a private key', 'KEY_INVALID');
  }
  const statement = {
    _type: IN_TOTO_STATEMENT_TYPE,
    predicateType,
    subject: manifest.artifacts.map((a) => ({ name: a.path, digest: { sha256: a.sha256 } })),
    predicate,
  };
  const payloadBytes = Buffer.from(canonicalJson(statement));
  const keyId = keyIdFromPublicKey(crypto.createPublicKey(toPrivateKey(privateKey)));
  return {
    payloadType: DSSE_PAYLOAD_TYPE,
    payload: payloadBytes.toString('base64'),
    signatures: [{ keyid: keyId, sig: signBytes(payloadBytes, privateKey) }],
  };
}

/**
 * Verify a DSSE attestation envelope. Returns `{ valid, reason, statement? }`.
 * When `manifest` is supplied, every artifact digest must match a subject.
 */
export function verifyAttestation(envelope, { publicKey = null, manifest = null } = {}) {
  if (!envelope || typeof envelope !== 'object') return { valid: false, reason: 'attestation is not an object' };
  if (envelope.payloadType !== DSSE_PAYLOAD_TYPE) {
    return { valid: false, reason: `unexpected payloadType: ${envelope.payloadType}` };
  }
  if (typeof envelope.payload !== 'string' || envelope.payload === '') {
    return { valid: false, reason: 'missing payload' };
  }
  const signatures = Array.isArray(envelope.signatures) ? envelope.signatures : [];
  if (signatures.length === 0) return { valid: false, reason: 'no signatures' };
  if (!publicKey) return { valid: false, reason: 'no public key provided' };

  const payloadBytes = Buffer.from(envelope.payload, 'base64');
  const signatureOk = signatures.some(
    (s) => s && typeof s.sig === 'string' && verifyBytes(payloadBytes, s.sig, publicKey)
  );
  if (!signatureOk) return { valid: false, reason: 'attestation signature invalid' };

  let statement;
  try {
    statement = JSON.parse(payloadBytes.toString('utf8'));
  } catch {
    return { valid: false, reason: 'payload is not valid JSON' };
  }
  if (!statement || statement._type !== IN_TOTO_STATEMENT_TYPE) {
    return { valid: false, reason: `unexpected statement type: ${statement && statement._type}` };
  }

  if (manifest) {
    const subjects = Array.isArray(statement.subject) ? statement.subject : [];
    for (const entry of manifest.artifacts || []) {
      const subject = subjects.find((s) => s && s.name === entry.path);
      if (!subject) return { valid: false, reason: `attestation subject missing for ${entry.path}` };
      if (!subject.digest || subject.digest.sha256 !== entry.sha256) {
        return { valid: false, reason: `attestation subject digest mismatch for ${entry.path}` };
      }
    }
  }
  return { valid: true, reason: 'ok', statement };
}

/* ------------------------------------------------------------------ *
 * Verification
 * ------------------------------------------------------------------ */

/**
 * Verify a manifest against the artifacts on disk.
 *
 * Returns `{ ok, errors, artifacts, signature, attestation }` — never throws for
 * a failed check (tampered/missing artifact, bad signature); only for a
 * structurally invalid manifest.
 */
export function verifyManifest(manifest, options = {}) {
  const {
    baseDir = process.cwd(),
    publicKey = null,
    requireSignature = false,
    attestation = null,
    attestationPublicKey = null,
    requireAttestation = false,
  } = options;

  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) {
    throw new ReleaseVerificationError('manifest must be an object', 'MANIFEST_INVALID');
  }
  if (manifest.schemaVersion !== MANIFEST_SCHEMA_VERSION) {
    throw new ReleaseVerificationError(
      `unsupported manifest schemaVersion: ${manifest.schemaVersion} (expected ${MANIFEST_SCHEMA_VERSION})`,
      'MANIFEST_SCHEMA_UNSUPPORTED'
    );
  }
  if (!Array.isArray(manifest.artifacts) || manifest.artifacts.length === 0) {
    throw new ReleaseVerificationError('manifest has no artifacts', 'MANIFEST_EMPTY');
  }

  const errors = [];
  const artifacts = [];
  for (const entry of manifest.artifacts) {
    if (!entry || typeof entry.path !== 'string' || !/^[0-9a-f]{64}$/.test(entry.sha256 || '')) {
      throw new ReleaseVerificationError(`invalid artifact entry: ${JSON.stringify(entry)}`, 'MANIFEST_INVALID');
    }
    const full = path.isAbsolute(entry.path) ? entry.path : path.join(baseDir, entry.path);
    let actual = null;
    let ok = false;
    let reason = 'ok';
    try {
      const stat = fs.statSync(full);
      actual = sha256File(full);
      if (actual !== entry.sha256) {
        reason = 'checksum mismatch';
      } else if (typeof entry.size === 'number' && stat.size !== entry.size) {
        reason = 'size mismatch';
      } else {
        ok = true;
      }
    } catch (err) {
      reason = `missing or unreadable (${err.code || err.message})`;
    }
    if (!ok) errors.push(`artifact ${entry.path}: ${reason}`);
    artifacts.push({ path: entry.path, ok, expected: entry.sha256, actual, reason });
  }

  const signature = { present: false, valid: false, keyId: null, reason: 'no signature' };
  if (manifest.signature) {
    signature.present = true;
    signature.keyId = manifest.signature.keyId ?? null;
    if (manifest.signature.algorithm !== SIGNATURE_ALGORITHM) {
      signature.reason = `unsupported algorithm: ${manifest.signature.algorithm}`;
    } else if (!publicKey) {
      signature.reason = 'no public key provided';
    } else {
      const valid = verifyBytes(
        canonicalJson(manifestPayload(manifest)),
        manifest.signature.signature,
        publicKey
      );
      signature.valid = valid;
      signature.reason = valid ? 'ok' : 'signature invalid';
    }
    if (!signature.valid) errors.push(`manifest signature: ${signature.reason}`);
  }
  if (requireSignature && !signature.valid) {
    errors.push(signature.present ? 'signature required but invalid' : 'signature required but missing');
  }

  const attestationResult = { present: false, valid: false, reason: 'no attestation' };
  if (attestation) {
    attestationResult.present = true;
    const result = verifyAttestation(attestation, {
      publicKey: attestationPublicKey ?? publicKey,
      manifest,
    });
    attestationResult.valid = result.valid;
    attestationResult.reason = result.reason;
    if (!result.valid) errors.push(`attestation: ${result.reason}`);
  }
  if (requireAttestation && !attestationResult.valid) {
    errors.push(attestationResult.present ? 'attestation required but invalid' : 'attestation required but missing');
  }

  return {
    ok: errors.length === 0,
    errors,
    artifacts,
    signature,
    attestation: attestationResult,
  };
}

/* ------------------------------------------------------------------ *
 * CLI
 * ------------------------------------------------------------------ */

const USAGE = `release-artifacts — signed release artifact manifest generator + verifier

Usage:
  release-artifacts.mjs generate --artifacts <p[,p...]> --name <n> --version <v> [options]
  release-artifacts.mjs verify   --manifest <file> [options]

generate options:
  --artifacts <paths>       Comma-separated artifact paths (repeatable)
  --name <name>             Release name (required)
  --version <version>       Release version (required)
  --out <file>              Write manifest JSON here (default: stdout)
  --base-dir <dir>          Base directory for artifact paths (default: cwd)
  --private-key <pem>       Sign the manifest with this Ed25519 key
  --attestation-out <file>  Also write a signed in-toto attestation here
  --timestamp <iso|epoch>   Pin createdAt (default: SOURCE_DATE_EPOCH or now)

verify options:
  --manifest <file>         Manifest to verify (required)
  --base-dir <dir>          Directory artifacts are resolved against (default: cwd)
  --public-key <pem>        Ed25519 public key used to check the signature
  --require-signature       Fail unless a valid signature is present
  --attestation <file>      Attestation envelope to check
  --require-attestation     Fail unless a valid attestation is present
  --quiet                   Only print the final OK/FAIL line

Exit codes: 0 verified, 1 verification failed, 2 usage/IO error.`;

/** Minimal flag parser: `--key value`, `--key=value`, repeated keys collect into arrays. */
export function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith('--')) {
      throw new ReleaseVerificationError(`unexpected argument: ${token}`, 'USAGE');
    }
    let key = token.slice(2);
    let value;
    const eq = key.indexOf('=');
    if (eq !== -1) {
      value = key.slice(eq + 1);
      key = key.slice(0, eq);
    } else if (i + 1 < argv.length && !argv[i + 1].startsWith('--')) {
      value = argv[i + 1];
      i += 1;
    } else {
      value = true;
    }
    if (Object.prototype.hasOwnProperty.call(args, key)) {
      args[key] = [].concat(args[key], value);
    } else {
      args[key] = value;
    }
  }
  return args;
}

function asList(value) {
  if (value === undefined) return [];
  const items = Array.isArray(value) ? value : [value];
  return items
    .flatMap((item) => String(item).split(','))
    .map((s) => s.trim())
    .filter((s) => s !== '');
}

function readText(file) {
  try {
    return fs.readFileSync(file, 'utf8');
  } catch (err) {
    throw new ReleaseVerificationError(`cannot read ${file}: ${err.code || err.message}`, 'IO');
  }
}

function writeText(file, text) {
  const dir = path.dirname(file);
  if (dir && dir !== '.') fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(file, text);
}

function resolveTimestamp(value) {
  if (value === undefined || value === true) return undefined;
  const raw = String(value);
  if (/^\d+$/.test(raw)) return new Date(Number(raw) * 1000).toISOString();
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) {
    throw new ReleaseVerificationError(`invalid --timestamp: ${raw}`, 'USAGE');
  }
  return parsed.toISOString();
}

function cmdGenerate(args, stdout, stderr) {
  const baseDir = args['base-dir'] ? path.resolve(String(args['base-dir'])) : process.cwd();
  const artifacts = asList(args.artifacts);
  if (artifacts.length === 0) {
    throw new ReleaseVerificationError('generate requires --artifacts', 'USAGE');
  }
  let manifest = buildManifest({
    artifacts,
    name: args.name,
    version: args.version,
    createdAt: resolveTimestamp(args.timestamp),
    baseDir,
  });

  let privateKey = null;
  if (args['private-key']) {
    privateKey = readText(String(args['private-key']));
    manifest = signManifest(manifest, privateKey);
  }

  const out = args.out ? String(args.out) : null;
  const serialized = JSON.stringify(manifest, null, 2) + '\n';
  if (out) {
    writeText(out, serialized);
    stderr.write(`wrote manifest: ${out}\n`);
  } else {
    stdout.write(serialized);
  }

  if (args['attestation-out']) {
    if (!privateKey) {
      throw new ReleaseVerificationError('--attestation-out requires --private-key', 'USAGE');
    }
    const attestation = createAttestation(manifest, {
      privateKey,
      predicate: {
        builder: { id: 'notify-chain/release-workflow' },
        buildType: 'https://notify-chain.dev/release/v1',
        invocation: { name: manifest.name, version: manifest.version },
      },
    });
    const attOut = String(args['attestation-out']);
    writeText(attOut, JSON.stringify(attestation, null, 2) + '\n');
    stderr.write(`wrote attestation: ${attOut}\n`);
  }
  return 0;
}

function cmdVerify(args, stdout, stderr) {
  if (!args.manifest || args.manifest === true) {
    throw new ReleaseVerificationError('verify requires --manifest', 'USAGE');
  }
  const baseDir = args['base-dir'] ? path.resolve(String(args['base-dir'])) : process.cwd();
  const manifest = JSON.parse(readText(String(args.manifest)));
  const publicKey = args['public-key'] ? readText(String(args['public-key'])) : null;
  const attestation = args.attestation ? JSON.parse(readText(String(args.attestation))) : null;

  const report = verifyManifest(manifest, {
    baseDir,
    publicKey,
    requireSignature: Boolean(args['require-signature']),
    attestation,
    requireAttestation: Boolean(args['require-attestation']),
  });

  if (!args.quiet) {
    stdout.write(`release ${manifest.name} ${manifest.version}\n`);
    for (const artifact of report.artifacts) {
      stdout.write(`  ${artifact.ok ? 'ok  ' : 'FAIL'} ${artifact.path} (${artifact.reason})\n`);
    }
    stdout.write(`  signature: ${report.signature.present ? report.signature.reason : 'absent'}\n`);
    stdout.write(`  attestation: ${report.attestation.present ? report.attestation.reason : 'absent'}\n`);
    for (const error of report.errors) stderr.write(`error: ${error}\n`);
  }
  stdout.write(report.ok ? 'VERIFIED\n' : 'VERIFICATION FAILED\n');
  return report.ok ? 0 : 1;
}

/** CLI entry point. Returns an exit code instead of calling process.exit so it is testable. */
export function main(argv, io = {}) {
  const stdout = io.stdout ?? process.stdout;
  const stderr = io.stderr ?? process.stderr;
  try {
    const [command, ...rest] = argv;
    if (command === 'generate') return cmdGenerate(parseArgs(rest), stdout, stderr);
    if (command === 'verify') return cmdVerify(parseArgs(rest), stdout, stderr);
    stderr.write(USAGE + '\n');
    return 2;
  } catch (err) {
    stderr.write(`error: ${err.message}\n`);
    return err instanceof ReleaseVerificationError ? 1 : 2;
  }
}

function isMainModule() {
  try {
    if (!process.argv[1]) return false;
    return fs.realpathSync(process.argv[1]) === fs.realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
}

if (isMainModule()) {
  process.exit(main(process.argv.slice(2)));
}
