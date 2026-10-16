// Type declarations for scripts/release-artifacts.mjs (#1003).
// Lets the jest suite import the ESM release tooling with full type checking.

export declare const MANIFEST_SCHEMA_VERSION: string;
export declare const IN_TOTO_STATEMENT_TYPE: string;
export declare const DEFAULT_PREDICATE_TYPE: string;
export declare const DSSE_PAYLOAD_TYPE: string;
export declare const SIGNATURE_ALGORITHM: string;

export interface ArtifactEntry {
  path: string;
  size: number;
  sha256: string;
}

export interface ManifestSignature {
  algorithm: string;
  keyId: string;
  signature: string;
}

export interface Manifest {
  schemaVersion: string;
  name: string;
  version: string;
  createdAt: string;
  artifacts: ArtifactEntry[];
  signature?: ManifestSignature;
  attestation?: unknown;
}

export interface DsseSignature {
  keyid: string;
  sig: string;
}

export interface AttestationEnvelope {
  payloadType: string;
  payload: string;
  signatures: DsseSignature[];
}

export interface VerifyOptions {
  baseDir?: string;
  publicKey?: string | import('crypto').KeyObject | null;
  requireSignature?: boolean;
  attestation?: AttestationEnvelope | null;
  attestationPublicKey?: string | import('crypto').KeyObject | null;
  requireAttestation?: boolean;
}

export interface ArtifactResult {
  path: string;
  ok: boolean;
  expected: string;
  actual: string | null;
  reason: string;
}

export interface VerificationReport {
  ok: boolean;
  errors: string[];
  artifacts: ArtifactResult[];
  signature: { present: boolean; valid: boolean; keyId: string | null; reason: string };
  attestation: { present: boolean; valid: boolean; reason: string };
}

export declare class ReleaseVerificationError extends Error {
  code: string;
  constructor(message: string, code?: string);
}

export declare function sha256Buffer(data: Buffer | string): string;
export declare function sha256File(filePath: string): string;
export declare function canonicalize(value: unknown): unknown;
export declare function canonicalJson(value: unknown): string;
export declare function keyIdFromPublicKey(
  publicKey: string | import('crypto').KeyObject
): string;
export declare function signBytes(data: Buffer | string, privateKey: string | import('crypto').KeyObject): string;
export declare function verifyBytes(
  data: Buffer | string,
  signatureB64: string,
  publicKey: string | import('crypto').KeyObject
): boolean;
export declare function buildManifest(options: {
  artifacts: Array<string | { path: string }>;
  name: string;
  version: string;
  createdAt?: string;
  baseDir?: string;
}): Manifest;
export declare function manifestPayload(manifest: Manifest): Omit<Manifest, 'signature' | 'attestation'>;
export declare function signManifest(
  manifest: Manifest,
  privateKey: string | import('crypto').KeyObject
): Manifest;
export declare function createAttestation(
  manifest: Manifest,
  options: {
    privateKey: string | import('crypto').KeyObject;
    predicateType?: string;
    predicate?: Record<string, unknown>;
  }
): AttestationEnvelope;
export declare function verifyAttestation(
  envelope: AttestationEnvelope,
  options?: {
    publicKey?: string | import('crypto').KeyObject | null;
    manifest?: Manifest | null;
  }
): { valid: boolean; reason: string; statement?: unknown };
export declare function verifyManifest(manifest: Manifest, options?: VerifyOptions): VerificationReport;
export declare function parseArgs(argv: string[]): Record<string, unknown>;
export declare function main(
  argv: string[],
  io?: { stdout?: { write(s: string): unknown }; stderr?: { write(s: string): unknown } }
): number;
