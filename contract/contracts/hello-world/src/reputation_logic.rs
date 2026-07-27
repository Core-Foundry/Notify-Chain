use crate::base::events::{NotificationCategory, NotificationPriority, ReputationUpdated, ReputationTierChanged};
use crate::base::reputation::SenderReputation;
use soroban_sdk::{Address, Env, Symbol, Error};

/// Build the persistent storage key for a sender's reputation record.
fn reputation_key(env: &Env, sender: &Address) -> (Symbol, Address) {
    (Symbol::new(env, "reputation"), sender.clone())
}

/// Initialize or get a sender's reputation record.
pub fn get_or_create_reputation(env: &Env, sender: &Address) -> Result<SenderReputation, Error> {
    let key = reputation_key(env, sender);

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
    let key = reputation_key(env, sender);
    env.storage().persistent().set(&key, &reputation);

    // Emit reputation update event
    ReputationUpdated {
        sender: sender.clone(),
        category: NotificationCategory::Notification,
        priority: NotificationPriority::Medium,
        new_score: reputation.reputation_score,
        successful_count: reputation.successful_deliveries,
        failed_count: reputation.failed_deliveries,
    }
    .publish(env);

    // Emit tier change event if tier changed
    if old_tier != new_tier {
        ReputationTierChanged {
            sender: sender.clone(),
            category: NotificationCategory::Notification,
            priority: NotificationPriority::High,
            old_tier: old_tier as u32,
            new_tier: new_tier as u32,
            reputation_score: reputation.reputation_score,
        }
        .publish(env);
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
    let key = reputation_key(env, sender);
    env.storage().persistent().set(&key, &reputation);

    // Emit reputation update event
    ReputationUpdated {
        sender: sender.clone(),
        category: NotificationCategory::Notification,
        priority: NotificationPriority::Medium,
        new_score: reputation.reputation_score,
        successful_count: reputation.successful_deliveries,
        failed_count: reputation.failed_deliveries,
    }
    .publish(env);

    // Emit tier change event if tier changed
    if old_tier != new_tier {
        ReputationTierChanged {
            sender: sender.clone(),
            category: NotificationCategory::Notification,
            priority: NotificationPriority::High,
            old_tier: old_tier as u32,
            new_tier: new_tier as u32,
            reputation_score: reputation.reputation_score,
        }
        .publish(env);
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
    use super::reputation_key;
    use soroban_sdk::{testutils::Address as _, Address, Env};

    #[test]
    fn test_reputation_key_is_stable_per_sender() {
        let env = Env::default();
        let sender = Address::generate(&env);

        assert_eq!(reputation_key(&env, &sender), reputation_key(&env, &sender));
    }

    #[test]
    fn test_reputation_key_differs_across_senders() {
        let env = Env::default();
        let sender_a = Address::generate(&env);
        let sender_b = Address::generate(&env);

        assert_ne!(reputation_key(&env, &sender_a), reputation_key(&env, &sender_b));
    }
}
