/**
 * Subscription types for notification channel management.
 * 
 * Subscriptions allow users to explicitly opt-in to specific notification channels.
 * Unlike preferences (which toggle existing subscriptions), subscriptions represent
 * active registrations that can be created, queried, and removed.
 */

export interface Subscription {
  id: string;
  userId: string;
  channel: string; // 'discord', 'email', 'telegram', etc.
  createdAt: number;
  active: boolean;
}

export interface SubscribeInput {
  userId: string;
  channel: string;
}

export interface SubscribeResult {
  success: boolean;
  subscription: Subscription | null;
  error?: 'DUPLICATE_SUBSCRIPTION' | 'INVALID_INPUT';
  message?: string;
}
