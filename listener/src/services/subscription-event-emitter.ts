/**
 * SubscriptionEventEmitter — Issue #372
 *
 * Emits a `subscription_updated` event into the EventRegistry whenever a
 * user's notification preferences (their "subscription") are updated.
 *
 * Design notes:
 * - The EventRegistry is injected rather than imported directly so tests can
 *   supply an isolated instance and verify emitted events without side-effects
 *   on the global singleton.
 * - Event fields match the DisplayEvent / RegistryEventInput shape exactly:
 *     eventId         — deterministic: "subscription_updated:<userId>:<timestamp>"
 *     contractAddress — empty string; subscriptions are off-chain preference
 *                       records with no on-chain contract address
 *     eventName       — "subscription_updated" (snake_case, matches naming
 *                       convention of notification_scheduled / notification_expired)
 *     ledger          — 0; no on-chain ledger for preference updates
 *     type            — "subscription"
 *     topic           — ["subscription_updated", userId]
 *     value           — JSON-encoded summary of what changed (updatedCategories)
 *     txHash          — undefined; no transaction
 *     receivedAt      — set by EventRegistry.addFromInput() via Date.now()
 */

import * as StellarSDK from '@stellar/stellar-sdk';
import { EventRegistry } from '../store/event-registry';
import { UserPreferences } from '../types/preferences';

export interface SubscriptionUpdatedPayload {
  /** The user ID whose preferences were updated. */
  subscriptionId: string;
  /** Epoch-ms timestamp at which the update was applied. */
  updatedAt: number;
  /**
   * The category map as it stands after the update.
   * Capturing the full updated state (rather than just the diff) lets consumers
   * reconstruct current state without replaying history.
   */
  updatedCategories: Record<string, boolean>;
  /**
   * Contract address associated with the subscription, if any.
   * Preference updates are off-chain, so this is null unless explicitly supplied.
   */
  contractAddress: string | null;
}

export class SubscriptionEventEmitter {
  constructor(private readonly registry: EventRegistry) {}

  /**
   * Emit a `subscription_updated` event for the given preference update result.
   *
   * Call this immediately after `PreferenceStore.update()` returns so the event
   * carries the post-update state.
   *
   * @param updated   The UserPreferences object returned by PreferenceStore.update()
   * @param contractAddress  Optional contract address to associate with the event.
   */
  emitSubscriptionUpdated(
    updated: UserPreferences,
    contractAddress: string | null = null
  ): void {
    const payload: SubscriptionUpdatedPayload = {
      subscriptionId: updated.userId,
      updatedAt: updated.updatedAt,
      updatedCategories: { ...updated.categories },
      contractAddress,
    };

    const eventId = `subscription_updated:${updated.userId}:${updated.updatedAt}`;
    const valueJson = JSON.stringify(payload);

    this.registry.addFromInput({
      eventId,
      contractAddress: contractAddress ?? '',
      eventName: 'subscription_updated',
      ledger: 0,
      type: 'subscription',
      // topic: symbol ScVals matching the eventName and userId so matchesEventFilter works
      topic: [
        StellarSDK.xdr.ScVal.scvSymbol('subscription_updated'),
        StellarSDK.xdr.ScVal.scvSymbol(updated.userId),
      ],
      value: StellarSDK.xdr.ScVal.scvString(valueJson),
    });
  }
}
