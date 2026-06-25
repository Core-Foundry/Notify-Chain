#[cfg(test)]
mod metadata_integrity_tests {
    use crate::{AutoShareContract, AutoShareContractClient};
    use soroban_sdk::{testutils::Address as _, Address, Bytes, BytesN, Env};

    fn setup() -> (Env, Address) {
        let env = Env::default();
        env.mock_all_auths();
        let contract_id = env.register(AutoShareContract, ());
        let admin = Address::generate(&env);
        let client = AutoShareContractClient::new(&env, &contract_id);
        client.initialize_admin(&admin);
        (env, contract_id)
    }

    fn record_id(env: &Env, seed: u8) -> BytesN<32> {
        let mut buf = [0u8; 32];
        buf[0] = seed;
        BytesN::from_array(env, &buf)
    }

    fn metadata(env: &Env, content: &[u8]) -> Bytes {
        Bytes::from_slice(env, content)
    }

    #[test]
    fn store_and_verify_matching_metadata() {
        let (env, contract_id) = setup();
        let client = AutoShareContractClient::new(&env, &contract_id);

        let id = record_id(&env, 1);
        let data = metadata(&env, b"notification:id=1,channel=discord,recipient=GABC");

        client.store_integrity_proof(&id, &data);

        assert!(client.verify_integrity_proof(&id, &data));
    }

    #[test]
    fn tampered_metadata_fails_verification() {
        let (env, contract_id) = setup();
        let client = AutoShareContractClient::new(&env, &contract_id);

        let id = record_id(&env, 2);
        let original = metadata(&env, b"notification:id=2,channel=discord");
        let tampered = metadata(&env, b"notification:id=2,channel=email");

        client.store_integrity_proof(&id, &original);

        assert!(!client.verify_integrity_proof(&id, &tampered));
    }

    #[test]
    fn verify_without_stored_proof_returns_false() {
        let (env, contract_id) = setup();
        let client = AutoShareContractClient::new(&env, &contract_id);

        let id = record_id(&env, 3);
        let data = metadata(&env, b"notification:id=3");

        assert!(!client.verify_integrity_proof(&id, &data));
    }

    #[test]
    fn get_proof_returns_none_when_not_stored() {
        let (env, contract_id) = setup();
        let client = AutoShareContractClient::new(&env, &contract_id);

        let id = record_id(&env, 4);
        assert!(client.get_integrity_proof(&id).is_none());
    }

    #[test]
    fn get_proof_returns_proof_after_store() {
        let (env, contract_id) = setup();
        let client = AutoShareContractClient::new(&env, &contract_id);

        let id = record_id(&env, 5);
        let data = metadata(&env, b"notification:id=5,recipient=GDEF");

        client.store_integrity_proof(&id, &data);

        let proof = client.get_integrity_proof(&id);
        assert!(proof.is_some());
    }

    #[test]
    fn overwriting_proof_reflects_new_metadata() {
        let (env, contract_id) = setup();
        let client = AutoShareContractClient::new(&env, &contract_id);

        let id = record_id(&env, 6);
        let original = metadata(&env, b"v1:channel=discord");
        let updated = metadata(&env, b"v2:channel=discord,priority=high");

        client.store_integrity_proof(&id, &original);
        client.store_integrity_proof(&id, &updated);

        // Old metadata no longer matches
        assert!(!client.verify_integrity_proof(&id, &original));
        // New metadata matches
        assert!(client.verify_integrity_proof(&id, &updated));
    }

    #[test]
    fn empty_metadata_is_hashable_and_verifiable() {
        let (env, contract_id) = setup();
        let client = AutoShareContractClient::new(&env, &contract_id);

        let id = record_id(&env, 7);
        let empty = metadata(&env, b"");

        client.store_integrity_proof(&id, &empty);
        assert!(client.verify_integrity_proof(&id, &empty));
    }
}
