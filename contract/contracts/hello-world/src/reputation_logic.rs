use crate::base::events::{NotificationCategory, NotificationPriority, ReputationUpdated, ReputationTierChanged};
use crate::base::reputation::{SenderReputation, INITIAL_REPUTATION_SCORE};
use soroban_sdk::{Address, Env, Symbol, storage::Persistent, String as SorobanString, Error};

const REPUTATION_KEY_PREFIX: &str = "reputation_";

/// Get the storage key for a sender's reputation.
fn reputation_key(sender: &Address) -> SorobanString {
    let key_str = format!("{}{}", REPUTATION_KEY_PREFIX, sender);
    SorobanString::from_small_str(&key_str)
}

/// Initialize or get a sender's reputation record.
pub fn get_or_create_reputation(env: &Env, sender: &Address) -> Result<SenderReputation, Error> {
    let key = reputation_key(sender);

    match env.storage().persistent().get::<_, SenderReputation>(&key) {
        Some(rep) => Ok(rep),
        None => {
            let current_time = env.ledger().timestamp();
            let new_rep = SenderReputation::new(sender.clone(), current_time);
            Ok(new_rep)
        }
    }
}

/// Record a successful notification delivery and update reputation.
pub fn record_successful_delivery(
    env: &Env,
    sender: &Address,
) -> Result<(), Error> {
    let mut reputation = get_or_create_reputation(env, sender)?;
    let old_tier = reputation.get_tier();
    let current_time = env.ledger().timestamp();

    reputation.record_successful_delivery(current_time);
    let new_tier = reputation.get_tier();

    // Save updated reputation
    let key = reputation_key(sender);
    env.storage().persistent().set(&key, &reputation);

    // Emit reputation update event
    env.events().publish(
        ("rep_update",),
        ReputationUpdated {
            sender: sender.clone(),
            category: NotificationCategory::Notification,
            priority: NotificationPriority::Medium,
            new_score: reputation.reputation_score,
            successful_count: reputation.successful_deliveries,
            failed_count: reputation.failed_deliveries,
        },
    );

    // Emit tier change event if tier changed
    if old_tier != new_tier {
        env.events().publish(
            ("rep_tier_change",),
            ReputationTierChanged {
                sender: sender.clone(),
                category: NotificationCategory::Notification,
                priority: NotificationPriority::High,
                old_tier: old_tier as u32,
                new_tier: new_tier as u32,
                reputation_score: reputation.reputation_score,
            },
        );
    }

    Ok(())
}

/// Record a failed notification delivery and update reputation.
pub fn record_failed_delivery(
    env: &Env,
    sender: &Address,
) -> Result<(), Error> {
    let mut reputation = get_or_create_reputation(env, sender)?;
    let old_tier = reputation.get_tier();
    let current_time = env.ledger().timestamp();

    reputation.record_failed_delivery(current_time);
    let new_tier = reputation.get_tier();

    // Save updated reputation
    let key = reputation_key(sender);
    env.storage().persistent().set(&key, &reputation);

    // Emit reputation update event
    env.events().publish(
        ("rep_update",),
        ReputationUpdated {
            sender: sender.clone(),
            category: NotificationCategory::Notification,
            priority: NotificationPriority::Medium,
            new_score: reputation.reputation_score,
            successful_count: reputation.successful_deliveries,
            failed_count: reputation.failed_deliveries,
        },
    );

    // Emit tier change event if tier changed
    if old_tier != new_tier {
        env.events().publish(
            ("rep_tier_change",),
            ReputationTierChanged {
                sender: sender.clone(),
                category: NotificationCategory::Notification,
                priority: NotificationPriority::High,
                old_tier: old_tier as u32,
                new_tier: new_tier as u32,
                reputation_score: reputation.reputation_score,
            },
        );
    }

    Ok(())
}

/// Get the current reputation score for a sender.
pub fn get_reputation_score(env: &Env, sender: &Address) -> Result<i64, Error> {
    let reputation = get_or_create_reputation(env, sender)?;
    Ok(reputation.reputation_score)
}

/// Get the complete reputation record for a sender.
pub fn get_reputation(env: &Env, sender: &Address) -> Result<SenderReputation, Error> {
    get_or_create_reputation(env, sender)
}

/// Get the reputation tier for a sender.
pub fn get_reputation_tier(env: &Env, sender: &Address) -> Result<u32, Error> {
    let reputation = get_or_create_reputation(env, sender)?;
    Ok(reputation.get_tier() as u32)
}

#[cfg(test)]
mod tests {
    use super::*;

    // Note: Full contract testing requires soroban testing framework
    // These are placeholder tests for documentation
    #[test]
    fn test_reputation_key_generation() {
        // Test that reputation keys are generated consistently
        let addr_str = "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF";
        // Key should be formatted as "reputation_<address>"
    }
}
