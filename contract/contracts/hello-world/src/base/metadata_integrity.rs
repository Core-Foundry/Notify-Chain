use soroban_sdk::{contracttype, crypto::Hash, Bytes, BytesN, Env};

/// A stored integrity proof binding a record ID to a SHA-256 hash of its metadata.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct IntegrityProof {
    /// SHA-256 hash of the canonical metadata bytes at the time the proof was recorded.
    pub hash: BytesN<32>,
    /// Ledger timestamp when the proof was stored.
    pub recorded_at: u64,
}

/// Storage key for integrity proofs, keyed by the record identifier.
#[contracttype]
pub enum IntegrityKey {
    Proof(BytesN<32>),
}

/// Compute a SHA-256 hash of `data` and return it as a `BytesN<32>`.
pub fn hash_metadata(env: &Env, data: &Bytes) -> BytesN<32> {
    env.crypto().sha256(data)
}

/// Store an integrity proof for `record_id` using the SHA-256 hash of `metadata`.
///
/// Overwrites any existing proof for the same `record_id`, which allows the
/// proof to be refreshed after an authorised update.
pub fn store_proof(env: &Env, record_id: BytesN<32>, metadata: &Bytes) {
    let hash = hash_metadata(env, metadata);
    let proof = IntegrityProof {
        hash,
        recorded_at: env.ledger().timestamp(),
    };
    env.storage()
        .persistent()
        .set(&IntegrityKey::Proof(record_id), &proof);
}

/// Verify that `metadata` matches the stored integrity proof for `record_id`.
///
/// Returns `true` when the proof exists and the hash matches, `false` when the
/// proof exists but the hash does not (tampered), and `false` when no proof is
/// stored (unverifiable).
pub fn verify_integrity(env: &Env, record_id: BytesN<32>, metadata: &Bytes) -> bool {
    let proof: Option<IntegrityProof> = env
        .storage()
        .persistent()
        .get(&IntegrityKey::Proof(record_id));

    match proof {
        None => false,
        Some(p) => {
            let current_hash = hash_metadata(env, metadata);
            p.hash == current_hash
        }
    }
}

/// Retrieve the stored `IntegrityProof` for `record_id`, if any.
pub fn get_proof(env: &Env, record_id: BytesN<32>) -> Option<IntegrityProof> {
    env.storage()
        .persistent()
        .get(&IntegrityKey::Proof(record_id))
}

/// Remove the integrity proof for `record_id` (e.g. when a record is deleted).
pub fn remove_proof(env: &Env, record_id: BytesN<32>) {
    env.storage()
        .persistent()
        .remove(&IntegrityKey::Proof(record_id));
}
