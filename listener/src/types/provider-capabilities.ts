/**
 * Provider Capability Declaration System
 *
 * Providers declare which optional features they support by including
 * values from this enum in their `capabilities` set. The pipeline
 * queries these capabilities at runtime and degrades gracefully when a
 * requested feature is not supported.
 */
export enum ProviderCapability {
  /**
   * Provider can render rich visual formatting such as Discord embeds,
   * HTML email bodies, or Slack Block Kit blocks.
   */
  RICH_FORMATTING = 'RICH_FORMATTING',

  /**
   * Provider can carry binary or structured file attachments alongside
   * the notification body (e.g. image uploads, file attachments).
   */
  ATTACHMENTS = 'ATTACHMENTS',

  /**
   * Provider supports editing / replacing a previously sent message
   * (e.g. Discord message edits, Slack message updates).
   */
  MESSAGE_UPDATES = 'MESSAGE_UPDATES',

  /**
   * Provider supports threaded / nested replies within a conversation
   * (e.g. Discord thread replies, Slack thread messages).
   */
  THREADING = 'THREADING',

  /**
   * Provider supports user-facing action buttons or interactive
   * components (e.g. Slack interactive messages, Discord components).
   */
  INTERACTIVE_COMPONENTS = 'INTERACTIVE_COMPONENTS',

  /**
   * Provider supports scheduling a message to be delivered at a later
   * time natively (distinct from the pipeline-level scheduler).
   */
  NATIVE_SCHEDULING = 'NATIVE_SCHEDULING',
}

/**
 * Metadata that describes a provider and the features it supports.
 */
export interface ProviderMetadata {
  /** Human-readable name, e.g. "Discord Webhook". */
  readonly name: string;

  /**
   * Short identifier matching `NotificationType`, e.g. "discord",
   * "webhook". Used by the registry to key providers.
   */
  readonly id: string;

  /** Version string for the provider implementation. */
  readonly version: string;

  /** Set of optional capabilities this provider supports. */
  readonly capabilities: ReadonlySet<ProviderCapability>;
}

/**
 * The payload passed to `NotificationProvider.deliver()`.
 * Carries both the raw JSON payload and the full notification record
 * so providers can inspect scheduling metadata if needed.
 */
export interface DeliveryPayload {
  /** Parsed notification body. */
  payload: Record<string, unknown>;

  /** Destination address (webhook URL, email address, phone number, etc.). */
  targetRecipient: string;

  /** Notification type string, e.g. "discord". */
  notificationType: string;

  /**
   * Optional set of features the caller wants to use for this delivery.
   * When set, the provider SHOULD attempt to apply them. If a requested
   * feature is not listed in the provider's capabilities, the provider
   * MUST degrade gracefully (deliver without that feature) rather than
   * fail. Use `hasCapability()` to gate feature-specific code paths.
   */
  requestedFeatures?: Set<ProviderCapability>;

  /** Optional correlation ID for structured logging. */
  requestId?: string;
}

/**
 * Result returned by `NotificationProvider.deliver()`.
 */
export interface DeliveryResult {
  /** Whether the notification was accepted by the upstream service. */
  success: boolean;

  /**
   * Capabilities that were requested but not supported by the provider
   * and therefore silently skipped during this delivery.
   */
  degradedCapabilities: ProviderCapability[];

  /**
   * Human-readable reason for failure. Only present when `success` is
   * `false`.
   */
  errorMessage?: string;
}

/**
 * Contract that every notification provider must implement.
 *
 * The pipeline only depends on this interface — it never imports a
 * concrete provider class directly. New providers (email, Telegram,
 * Slack, …) are added by implementing this interface and registering
 * the implementation with the `ProviderRegistry`.
 */
export interface NotificationProvider {
  /**
   * Metadata describing the provider and its capabilities.
   * This property must be stable and inexpensive to read (no I/O).
   */
  readonly metadata: ProviderMetadata;

  /**
   * Returns `true` if this provider supports the given capability.
   * Convenience wrapper around `metadata.capabilities.has(capability)`.
   */
  hasCapability(capability: ProviderCapability): boolean;

  /**
   * Deliver a notification.
   *
   * Implementations MUST:
   * - Return `{ success: true }` when the upstream service accepted the
   *   message (even if features were degraded).
   * - Return `{ success: false, errorMessage }` instead of throwing for
   *   expected delivery failures (HTTP errors, invalid recipients, etc.).
   * - List any requested-but-unsupported features in `degradedCapabilities`.
   *
   * Implementations MAY throw for truly unexpected, unrecoverable errors
   * (programming errors, corrupt state). The scheduler will catch these
   * and record them as failures.
   */
  deliver(payload: DeliveryPayload): Promise<DeliveryResult>;
}
