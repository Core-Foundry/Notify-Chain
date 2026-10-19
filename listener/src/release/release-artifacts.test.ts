/**
 * #1003 - Signed release artifact verification tests.
 *
 * Exercises the root ESM tooling (`scripts/release-artifacts.mjs`) from the
 * listener jest project. The `.mjs` module is transformed by @swc/jest (see
 * listener/jest.config.js) so the release scripts stay single-sourced and
 * dependency-free.
 *
 * Run with: cd listener && npx jest src/release/release-artifacts.test.ts
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import crypto from 'crypto';

import {
  MANIFEST_SCHEMA_VERSION,
  DSSE_PAYLOAD_TYPE,
  IN_TOTO_STATEMENT_TYPE,
  ReleaseVerificationError,
  sha256Buffer,
  sha256File,
  canonicalJson,
  canonicalize,
  keyIdFromPublicKey,
  signBytes,
  verifyBytes,
  buildManifest,
  manifestPayload,
  signManifest,
  createAttestation,
  verifyAttestation,
  verifyManifest,
  parseArgs,
  main,
} from '../../../scripts/release-artifacts.mjs';

const ABC_SHA256 = 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad';

let tmpDirs: string[] = [];

function makeTmpDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nc-release-'));
  tmpDirs.push(dir);
  return dir;
}

function writeArtifact(dir: string, name: string, contents: string): string {
  const full = path.join(dir, name);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, contents);
  return full;
}

function makeKeyPair() {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
  return {
    privatePem: privateKey.export({ type: 'pkcs8', format: 'pem' }) as string,
    publicPem: publicKey.export({ type: 'spki', format: 'pem' }) as string,
  };
}

function capture() {
  let out = '';
  let err = '';
  return {
    stdout: { write: (s: string) => ((out += s), true) },
    stderr: { write: (s: string) => ((err += s), true) },
    get out() {
      return out;
    },
    get err() {
      return err;
    },
  };
}

afterAll(() => {
  for (const dir of tmpDirs) fs.rmSync(dir, { recursive: true, force: true });
  tmpDirs = [];
});

describe('hashing and canonical JSON', () => {
  it('computes the known SHA-256 vector for "abc"', () => {
    expect(sha256Buffer(Buffer.from('abc'))).toBe(ABC_SHA256);
    expect(sha256Buffer('abc')).toBe(ABC_SHA256);
  });

  it('hashes a file identically to its in-memory bytes', () => {
    const dir = makeTmpDir();
    const file = writeArtifact(dir, 'blob.bin', 'abc');
    expect(sha256File(file)).toBe(ABC_SHA256);
  });

  it('canonicalizes objects with recursively sorted keys', () => {
    expect(canonicalJson({ b: 1, a: { d: 4, c: 3 } })).toBe('{"a":{"c":3,"d":4},"b":1}');
    expect(canonicalJson({ x: [3, { z: 1, y: 2 }] })).toBe('{"x":[3,{"y":2,"z":1}]}');
    expect(canonicalize([{ b: 1, a: 2 }])).toEqual([{ a: 2, b: 1 }]);
  });
});

describe('buildManifest', () => {
  it('records size and sha256 for each artifact, sorted by logical path', () => {
    const dir = makeTmpDir();
    writeArtifact(dir, 'b.txt', 'hello');
    writeArtifact(dir, 'a.txt', 'abc');
    const manifest = buildManifest({
      artifacts: ['b.txt', 'a.txt'],
      name: 'notify-chain',
      version: '1.2.3',
      createdAt: '2026-01-01T00:00:00.000Z',
      baseDir: dir,
    });
    expect(manifest.schemaVersion).toBe(MANIFEST_SCHEMA_VERSION);
    expect(manifest.artifacts.map((a) => a.path)).toEqual(['a.txt', 'b.txt']);
    expect(manifest.artifacts[0]).toEqual({ path: 'a.txt', size: 3, sha256: ABC_SHA256 });
    expect(manifest.createdAt).toBe('2026-01-01T00:00:00.000Z');
  });

  it('is deterministic across repeated builds with a pinned timestamp', () => {
    const dir = makeTmpDir();
    writeArtifact(dir, 'a.txt', 'abc');
    const opts = {
      artifacts: ['a.txt'],
      name: 'n',
      version: '1',
      createdAt: '2026-01-01T00:00:00.000Z',
      baseDir: dir,
    };
    expect(JSON.stringify(buildManifest(opts))).toBe(JSON.stringify(buildManifest(opts)));
  });

  it('honours SOURCE_DATE_EPOCH when createdAt is not given', () => {
    const dir = makeTmpDir();
    writeArtifact(dir, 'a.txt', 'abc');
    const prev = process.env.SOURCE_DATE_EPOCH;
    process.env.SOURCE_DATE_EPOCH = '1700000000';
    try {
      const manifest = buildManifest({ artifacts: ['a.txt'], name: 'n', version: '1', baseDir: dir });
      expect(manifest.createdAt).toBe(new Date(1700000000000).toISOString());
    } finally {
      if (prev === undefined) delete process.env.SOURCE_DATE_EPOCH;
      else process.env.SOURCE_DATE_EPOCH = prev;
    }
  });

  it('rejects empty artifact lists, missing metadata, and duplicate paths', () => {
    const dir = makeTmpDir();
    writeArtifact(dir, 'a.txt', 'abc');
    expect(() => buildManifest({ artifacts: [], name: 'n', version: '1', baseDir: dir })).toThrow(
      ReleaseVerificationError
    );
    expect(() => buildManifest({ artifacts: ['a.txt'], name: '', version: '1', baseDir: dir })).toThrow(
      ReleaseVerificationError
    );
    expect(() => buildManifest({ artifacts: ['a.txt'], name: 'n', version: '', baseDir: dir })).toThrow(
      /non-empty "version"/
    );
    expect(() => buildManifest({ artifacts: ['a.txt', 'a.txt'], name: 'n', version: '1', baseDir: dir })).toThrow(
      /duplicate artifact path/
    );
  });

  it('fails loudly when an artifact cannot be read', () => {
    const dir = makeTmpDir();
    expect(() => buildManifest({ artifacts: ['nope.bin'], name: 'n', version: '1', baseDir: dir })).toThrow(
      /cannot read artifact/
    );
  });
});

describe('signing and verification', () => {
  it('round-trips a signed manifest', () => {
    const dir = makeTmpDir();
    writeArtifact(dir, 'a.txt', 'abc');
    const { privatePem, publicPem } = makeKeyPair();
    const signed = signManifest(
      buildManifest({ artifacts: ['a.txt'], name: 'n', version: '1', createdAt: '2026-01-01T00:00:00.000Z', baseDir: dir }),
      privatePem
    );
    expect(signed.signature?.algorithm).toBe('ed25519');
    expect(signed.signature?.keyId).toBe(keyIdFromPublicKey(publicPem));

    const report = verifyManifest(signed, { baseDir: dir, publicKey: publicPem, requireSignature: true });
    expect(report.ok).toBe(true);
    expect(report.errors).toEqual([]);
    expect(report.signature.valid).toBe(true);
  });

  it('detects a tampered artifact (checksum mismatch)', () => {
    const dir = makeTmpDir();
    writeArtifact(dir, 'a.txt', 'abc');
    const manifest = buildManifest({
      artifacts: ['a.txt'],
      name: 'n',
      version: '1',
      createdAt: '2026-01-01T00:00:00.000Z',
      baseDir: dir,
    });
    fs.writeFileSync(path.join(dir, 'a.txt'), 'tampered');
    const report = verifyManifest(manifest, { baseDir: dir });
    expect(report.ok).toBe(false);
    expect(report.artifacts[0]).toMatchObject({ ok: false, reason: 'checksum mismatch' });
    expect(report.errors[0]).toMatch(/checksum mismatch/);
  });

  it('reports a missing artifact without throwing', () => {
    const dir = makeTmpDir();
    writeArtifact(dir, 'a.txt', 'abc');
    const manifest = buildManifest({
      artifacts: ['a.txt'],
      name: 'n',
      version: '1',
      createdAt: '2026-01-01T00:00:00.000Z',
      baseDir: dir,
    });
    fs.rmSync(path.join(dir, 'a.txt'));
    const report = verifyManifest(manifest, { baseDir: dir });
    expect(report.ok).toBe(false);
    expect(report.artifacts[0].ok).toBe(false);
    expect(report.artifacts[0].reason).toMatch(/missing or unreadable/);
  });

  it('rejects a signature from a different key', () => {
    const dir = makeTmpDir();
    writeArtifact(dir, 'a.txt', 'abc');
    const signer = makeKeyPair();
    const other = makeKeyPair();
    const signed = signManifest(
      buildManifest({ artifacts: ['a.txt'], name: 'n', version: '1', createdAt: '2026-01-01T00:00:00.000Z', baseDir: dir }),
      signer.privatePem
    );
    const report = verifyManifest(signed, { baseDir: dir, publicKey: other.publicPem, requireSignature: true });
    expect(report.ok).toBe(false);
    expect(report.signature.reason).toBe('signature invalid');
  });

  it('fails requireSignature when the manifest is unsigned', () => {
    const dir = makeTmpDir();
    writeArtifact(dir, 'a.txt', 'abc');
    const { publicPem } = makeKeyPair();
    const manifest = buildManifest({
      artifacts: ['a.txt'],
      name: 'n',
      version: '1',
      createdAt: '2026-01-01T00:00:00.000Z',
      baseDir: dir,
    });
    const report = verifyManifest(manifest, { baseDir: dir, publicKey: publicPem, requireSignature: true });
    expect(report.ok).toBe(false);
    expect(report.errors).toContain('signature required but missing');
  });

  it('detects a manifest edited after signing', () => {
    const dir = makeTmpDir();
    writeArtifact(dir, 'a.txt', 'abc');
    const { privatePem, publicPem } = makeKeyPair();
    const signed = signManifest(
      buildManifest({ artifacts: ['a.txt'], name: 'n', version: '1', createdAt: '2026-01-01T00:00:00.000Z', baseDir: dir }),
      privatePem
    );
    const tampered = { ...signed, version: '9.9.9' };
    const report = verifyManifest(tampered, { baseDir: dir, publicKey: publicPem, requireSignature: true });
    expect(report.ok).toBe(false);
    expect(report.signature.valid).toBe(false);
  });

  it('signs and verifies raw bytes, and rejects a bad signature', () => {
    const { privatePem, publicPem } = makeKeyPair();
    const sig = signBytes('payload', privatePem);
    expect(verifyBytes('payload', sig, publicPem)).toBe(true);
    expect(verifyBytes('other', sig, publicPem)).toBe(false);
    expect(verifyBytes('payload', 'not-base64!!', publicPem)).toBe(false);
  });

  it('throws on an unsupported manifest schema version', () => {
    const dir = makeTmpDir();
    writeArtifact(dir, 'a.txt', 'abc');
    const manifest = buildManifest({
      artifacts: ['a.txt'],
      name: 'n',
      version: '1',
      createdAt: '2026-01-01T00:00:00.000Z',
      baseDir: dir,
    });
    expect(() => verifyManifest({ ...manifest, schemaVersion: '99' }, { baseDir: dir })).toThrow(
      /unsupported manifest schemaVersion/
    );
  });
});

describe('attestation', () => {
  function signedManifestAndAttestation() {
    const dir = makeTmpDir();
    writeArtifact(dir, 'a.txt', 'abc');
    const { privatePem, publicPem } = makeKeyPair();
    const manifest = signManifest(
      buildManifest({ artifacts: ['a.txt'], name: 'n', version: '1', createdAt: '2026-01-01T00:00:00.000Z', baseDir: dir }),
      privatePem
    );
    const attestation = createAttestation(manifest, {
      privateKey: privatePem,
      predicate: { builder: { id: 'test' } },
    });
    return { dir, privatePem, publicPem, manifest, attestation };
  }

  it('produces a DSSE-wrapped in-toto statement binding artifact digests', () => {
    const { attestation, manifest } = signedManifestAndAttestation();
    expect(attestation.payloadType).toBe(DSSE_PAYLOAD_TYPE);
    const statement = JSON.parse(Buffer.from(attestation.payload, 'base64').toString('utf8'));
    expect(statement._type).toBe(IN_TOTO_STATEMENT_TYPE);
    expect(statement.subject).toEqual([{ name: 'a.txt', digest: { sha256: manifest.artifacts[0].sha256 } }]);
  });

  it('verifies a valid attestation against the manifest', () => {
    const { publicPem, manifest, attestation } = signedManifestAndAttestation();
    const result = verifyAttestation(attestation, { publicKey: publicPem, manifest });
    expect(result.valid).toBe(true);
    expect(result.reason).toBe('ok');
  });

  it('rejects an attestation with a tampered payload', () => {
    const { publicPem, manifest, attestation } = signedManifestAndAttestation();
    const forged = Buffer.from(JSON.stringify({ _type: IN_TOTO_STATEMENT_TYPE, subject: [] })).toString('base64');
    const result = verifyAttestation({ ...attestation, payload: forged }, { publicKey: publicPem, manifest });
    expect(result.valid).toBe(false);
    expect(result.reason).toBe('attestation signature invalid');
  });

  it('rejects an attestation signed by a different key', () => {
    const { manifest, attestation } = signedManifestAndAttestation();
    const other = makeKeyPair();
    const result = verifyAttestation(attestation, { publicKey: other.publicPem, manifest });
    expect(result.valid).toBe(false);
  });

  it('fails requireAttestation when none is supplied', () => {
    const { dir, publicPem, manifest } = signedManifestAndAttestation();
    const report = verifyManifest(manifest, { baseDir: dir, publicKey: publicPem, requireAttestation: true });
    expect(report.ok).toBe(false);
    expect(report.errors).toContain('attestation required but missing');
  });

  it('verifies a manifest together with its attestation', () => {
    const { dir, publicPem, manifest, attestation } = signedManifestAndAttestation();
    const report = verifyManifest(manifest, {
      baseDir: dir,
      publicKey: publicPem,
      requireSignature: true,
      attestation,
      requireAttestation: true,
    });
    expect(report.ok).toBe(true);
    expect(report.attestation.valid).toBe(true);
  });

  it('detects an attestation whose subject digest does not match the manifest', () => {
    const { publicPem, manifest, attestation } = signedManifestAndAttestation();
    const drifted = { ...manifest, artifacts: [{ ...manifest.artifacts[0], sha256: 'f'.repeat(64) }] };
    const result = verifyAttestation(attestation, { publicKey: publicPem, manifest: drifted });
    expect(result.valid).toBe(false);
    expect(result.reason).toMatch(/digest mismatch/);
  });
});

describe('manifestPayload', () => {
  it('strips signature and attestation so signing is stable', () => {
    const manifest = {
      schemaVersion: '1.0',
      name: 'n',
      version: '1',
      createdAt: 'x',
      artifacts: [],
      signature: { algorithm: 'ed25519', keyId: 'k', signature: 's' },
      attestation: { payload: 'p' },
    };
    const payload = manifestPayload(manifest) as Record<string, unknown>;
    expect(payload.signature).toBeUndefined();
    expect(payload.attestation).toBeUndefined();
    expect(payload.name).toBe('n');
  });
});

describe('parseArgs', () => {
  it('parses --key value, --key=value, flags, and repeated keys', () => {
    const args = parseArgs(['--manifest', 'm.json', '--require-signature', '--artifacts=a,b', '--artifacts', 'c']);
    expect(args.manifest).toBe('m.json');
    expect(args['require-signature']).toBe(true);
    expect(args.artifacts).toEqual(['a,b', 'c']);
  });

  it('rejects unexpected positional arguments', () => {
    expect(() => parseArgs(['stray'])).toThrow(ReleaseVerificationError);
  });
});

describe('CLI (generate + verify)', () => {
  it('generates a signed manifest + attestation, then verifies end to end', () => {
    const dir = makeTmpDir();
    writeArtifact(dir, 'dist/app.tar.gz', 'release-bytes');
    writeArtifact(dir, 'dist/checksums.txt', ABC_SHA256 + '  app.tar.gz\n');
    const { privatePem, publicPem } = makeKeyPair();
    const keyFile = path.join(dir, 'signing.key.pem');
    const pubFile = path.join(dir, 'signing.pub.pem');
    fs.writeFileSync(keyFile, privatePem);
    fs.writeFileSync(pubFile, publicPem);

    const manifestFile = path.join(dir, 'manifest.json');
    const attestationFile = path.join(dir, 'attestation.json');
    const gen = capture();
    const genCode = main(
      [
        'generate',
        '--artifacts',
        'dist/app.tar.gz,dist/checksums.txt',
        '--name',
        'notify-chain',
        '--version',
        '1.2.3',
        '--timestamp',
        '2026-01-01T00:00:00.000Z',
        '--base-dir',
        dir,
        '--out',
        manifestFile,
        '--private-key',
        keyFile,
        '--attestation-out',
        attestationFile,
      ],
      gen
    );
    expect(genCode).toBe(0);
    expect(fs.existsSync(manifestFile)).toBe(true);
    expect(fs.existsSync(attestationFile)).toBe(true);
    const manifest = JSON.parse(fs.readFileSync(manifestFile, 'utf8'));
    expect(manifest.signature.algorithm).toBe('ed25519');

    const ver = capture();
    const verCode = main(
      [
        'verify',
        '--manifest',
        manifestFile,
        '--base-dir',
        dir,
        '--public-key',
        pubFile,
        '--require-signature',
        '--attestation',
        attestationFile,
        '--require-attestation',
      ],
      ver
    );
    expect(verCode).toBe(0);
    expect(ver.out).toContain('VERIFIED');
    expect(ver.out).toContain('ok   dist/app.tar.gz');
  });

  it('exits non-zero when an artifact was tampered with after release', () => {
    const dir = makeTmpDir();
    writeArtifact(dir, 'dist/app.tar.gz', 'release-bytes');
    const manifestFile = path.join(dir, 'manifest.json');
    const gen = capture();
    expect(
      main(
        [
          'generate',
          '--artifacts',
          'dist/app.tar.gz',
          '--name',
          'notify-chain',
          '--version',
          '1.2.3',
          '--timestamp',
          '2026-01-01T00:00:00.000Z',
          '--base-dir',
          dir,
          '--out',
          manifestFile,
        ],
        gen
      )
    ).toBe(0);

    fs.writeFileSync(path.join(dir, 'dist/app.tar.gz'), 'malicious');
    const ver = capture();
    const code = main(['verify', '--manifest', manifestFile, '--base-dir', dir], ver);
    expect(code).toBe(1);
    expect(ver.out).toContain('VERIFICATION FAILED');
    expect(ver.err).toMatch(/checksum mismatch/);
  });

  it('prints usage and exits 2 for an unknown command', () => {
    const io = capture();
    expect(main(['frobnicate'], io)).toBe(2);
    expect(io.err).toContain('Usage:');
  });
});
