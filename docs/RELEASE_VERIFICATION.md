# Verifying a Release Artifact

Every Notify-Chain release publishes a **manifest** (`release/manifest.json`), an
optional detached **signature** (`release/manifest.sig.json`) and an **attestation**
(`release/attestation.json`). Together they let anyone check that a downloaded
artifact is byte-for-byte what the project built, and that it was produced by the
expected builder.

Verification uses only Node's built-in `crypto` module — **no extra tooling, no
network access**.

## 1. Download the artifacts

Take the release files and the three metadata files from the same release page.
Put them in one directory, keeping the artifact paths recorded in the manifest
(e.g. `dist/notify-chain.tar.gz`).

## 2. Verify checksums, signature and attestation

```bash
node scripts/release-artifacts.mjs verify \
  --manifest release/manifest.json \
  --base-dir . \
  --public-key release-signing.pub.pem \
  --require-signature
```

Exit codes: `0` = the release is valid, `1` = a check failed, `2` = the manifest
itself is malformed. CI gates on this, so a `0` here means the same checks the
build ran have passed on your copy.

The command reports, per artifact:

- the recorded `sha256` matches the file you have (tampering or a partial
  download both fail here);
- the manifest signature verifies against the project public key;
- the attestation's subject digests match the manifest's artifact digests, and
  the attestation signature is valid.

## 3. Check the signing key id (optional)

The manifest records a `keyId`: the first 32 hex characters of the SHA-256 of the
public key's SPKI DER encoding. It is stable across PEM formatting, so you can
confirm you are verifying against the key the project publishes:

```bash
node -e "const c=require('crypto'),f=require('fs');\
const d=c.createPublicKey(f.readFileSync('release-signing.pub.pem')).export({type:'spki',format:'der'});\
console.log(c.createHash('sha256').update(d).digest('hex').slice(0,32))"
```

## Generating a release (maintainers)

```bash
node scripts/release-artifacts.mjs generate \
  --artifacts dist/notify-chain.tar.gz,dist/checksums.txt \
  --name notify-chain --version 1.2.3 \
  --out release/manifest.json \
  --private-key release-signing.key.pem \
  --attestation-out release/attestation.json
```

The manifest is deterministic: artifact entries are sorted by logical path and the
timestamp comes from `--timestamp` / `SOURCE_DATE_EPOCH`, so rebuilding from the
same inputs produces byte-identical output.

## Validating the release workflow itself

```bash
node scripts/verify-release-workflow.mjs
```

This is the CI entry point. It runs the full generate → sign → attest → verify
pipeline offline with an ephemeral Ed25519 key, and asserts that verification
**rejects** a tampered artifact, an unsigned manifest when a signature is
required, and an attestation signed by a different key. A regression in the
release tooling therefore fails the build instead of shipping an unverifiable
release.
