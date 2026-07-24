use crate::events;
use crate::storage;
use crate::types::{ApiCredential, ApiCredentialRotation, Error};
use soroban_sdk::{Address, BytesN, Env, String, Vec};

fn load_credentials(env: &Env, organization: &Address) -> Vec<ApiCredential> {
    storage::get_api_credentials(env, organization)
}

fn save_credentials(env: &Env, organization: &Address, credentials: &Vec<ApiCredential>) {
    storage::set_api_credentials(env, organization, credentials);
}

fn save_history(
    env: &Env,
    organization: &Address,
    history: &Vec<ApiCredentialRotation>,
) {
    storage::set_api_rotation_history(env, organization, history);
}

fn has_active_fingerprint(credentials: &Vec<ApiCredential>, fingerprint: &BytesN<32>) -> bool {
    for credential in credentials.iter() {
        if credential.is_active && credential.fingerprint == *fingerprint {
            return true;
        }
    }
    false
}

fn rebuild_with_primary(
    env: &Env,
    credentials: &Vec<ApiCredential>,
    primary_id: u64,
) -> Vec<ApiCredential> {
    let mut rebuilt = Vec::new(env);

    for credential in credentials.iter() {
        let mut next = credential.clone();
        next.is_primary = next.is_active && next.id == primary_id;
        rebuilt.push_back(next);
    }

    rebuilt
}

pub fn register_api_key(
    env: Env,
    organization: Address,
    label: String,
    fingerprint: BytesN<32>,
) -> Result<u64, Error> {
    organization.require_auth();

    let credentials = load_credentials(&env, &organization);
    if has_active_fingerprint(&credentials, &fingerprint) {
        return Err(Error::ApiKeyAlreadyExists);
    }

    let key_id = storage::increment_api_key_counter(&env);
    let is_primary = !credentials.iter().any(|credential| credential.is_active);
    let credential = ApiCredential {
        id: key_id,
        organization: organization.clone(),
        label,
        fingerprint: fingerprint.clone(),
        created_at: env.ledger().timestamp(),
        is_active: true,
        is_primary,
        previous_credential_id: 0,
    };

    let mut updated = credentials;
    updated.push_back(credential.clone());
    save_credentials(&env, &organization, &updated);
    events::emit_api_key_registered(&env, &credential);
    Ok(key_id)
}

pub fn rotate_api_key(
    env: Env,
    organization: Address,
    current_credential_id: u64,
    new_label: String,
    new_fingerprint: BytesN<32>,
    reason: String,
) -> Result<u64, Error> {
    organization.require_auth();

    let credentials = load_credentials(&env, &organization);
    let mut current_found = false;

    for credential in credentials.iter() {
        if credential.id == current_credential_id {
            current_found = true;
            if !credential.is_active || credential.organization != organization {
                return Err(Error::UnauthorizedApiKeyAction);
            }
        }
    }

    if !current_found {
        return Err(Error::ApiKeyNotFound);
    }

    if has_active_fingerprint(&credentials, &new_fingerprint) {
        return Err(Error::ApiKeyAlreadyExists);
    }

    let new_credential_id = storage::increment_api_key_counter(&env);
    let new_credential = ApiCredential {
        id: new_credential_id,
        organization: organization.clone(),
        label: new_label,
        fingerprint: new_fingerprint,
        created_at: env.ledger().timestamp(),
        is_active: true,
        is_primary: true,
        previous_credential_id: current_credential_id,
    };

    let mut updated = Vec::new(&env);
    for credential in credentials.iter() {
        let mut next = credential.clone();
        if next.id == current_credential_id {
            next.is_primary = false;
        }
        updated.push_back(next);
    }
    updated.push_back(new_credential.clone());
    updated = rebuild_with_primary(&env, &updated, new_credential_id);
    save_credentials(&env, &organization, &updated);

    let mut history = storage::get_api_rotation_history(&env, &organization);
    let rotation = ApiCredentialRotation {
        organization: organization.clone(),
        old_credential_id: current_credential_id,
        new_credential_id,
        actor: organization.clone(),
        reason,
        rotated_at: env.ledger().timestamp(),
    };
    history.push_back(rotation.clone());
    save_history(&env, &organization, &history);

    events::emit_api_key_rotated(&env, &rotation);
    Ok(new_credential_id)
}

pub fn revoke_api_key(
    env: Env,
    organization: Address,
    credential_id: u64,
) -> Result<(), Error> {
    organization.require_auth();

    let credentials = load_credentials(&env, &organization);
    let mut found = false;
    let mut next_primary_id = 0u64;
    let mut updated = Vec::new(&env);

    for credential in credentials.iter() {
        let mut next = credential.clone();
        if next.id == credential_id {
            if next.organization != organization {
                return Err(Error::UnauthorizedApiKeyAction);
            }
            next.is_active = false;
            next.is_primary = false;
            found = true;
        }

        if next.is_active && next_primary_id == 0 {
            next_primary_id = next.id;
        }

        updated.push_back(next);
    }

    if !found {
        return Err(Error::ApiKeyNotFound);
    }

    if next_primary_id != 0 {
        updated = rebuild_with_primary(&env, &updated, next_primary_id);
    }

    save_credentials(&env, &organization, &updated);
    events::emit_api_key_revoked(&env, &organization, credential_id);
    Ok(())
}

pub fn get_active_api_keys(env: Env, organization: Address) -> Vec<ApiCredential> {
    let credentials = load_credentials(&env, &organization);
    let mut active = Vec::new(&env);

    for credential in credentials.iter() {
        if credential.is_active {
            active.push_back(credential.clone());
        }
    }

    active
}

pub fn get_api_key_rotation_history(
    env: Env,
    organization: Address,
) -> Vec<ApiCredentialRotation> {
    storage::get_api_rotation_history(&env, &organization)
}

pub fn is_api_key_active(
    env: Env,
    organization: Address,
    fingerprint: BytesN<32>,
) -> bool {
    let credentials = load_credentials(&env, &organization);
    has_active_fingerprint(&credentials, &fingerprint)
}
