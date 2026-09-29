import {
  ProviderCapability,
  ProviderMetadata,
  NotificationProvider,
  DeliveryPayload,
  DeliveryResult,
} from '../../types/provider-capabilities';
import { sendWebhook, WebhookSendOptions } from '../webhook-sender';
import logger from '../../utils/logger';

/**
 * Optional configuration for the webhook provider.
 */
export interface WebhookProviderConfig {
  /** Enable only for receivers implementing docs/WEBHOOK_IDEMPOTENCY.md. */
  receiverSupportsIdempotency?: boolean;
  /** Request timeout in milliseconds (default: 5 000). */
  timeoutMs?: number;
  /**
   * Static headers added to every outgoing request.
   * Useful for Authorization tokens, custom content-type overrides, etc.
   */
  defaultHeaders?: Record<string, string>;
}

/**
 * Capabilities declared by the generic HTTP Webhook provider.
 *
 * Generic webhooks are essentially plain JSON POSTs, so only a small
 * set of capabilities is meaningful:
 *
 * - ATTACHMENTS: callers can embed base64-encoded binary data in the JSON
 *   payload and the provider will forward it as-is.
 *
 * What webhooks do NOT support natively:
 * - RICH_FORMATTING — the receiving endpoint decides how to render the JSON;
 *   the provider itself imposes no formatting conventions.
 * - MESSAGE_UPDATES — HTTP POST semantics don't include editing sent messages.
 * - THREADING — no conversation model.
 * - INTERACTIVE_COMPONENTS — not applicable to generic HTTP.
 * - NATIVE_SCHEDULING — handled by the pipeline, not the endpoint.
 */
const WEBHOOK_CAPABILITIES = new Set<ProviderCapability>([
  ProviderCapability.ATTACHMENTS,
]);

/**
 * Generic HTTP Webhook notification provider.
 *
 * POSTs the notification payload as JSON to `DeliveryPayload.targetRecipient`
 * (the full URL). Any `requestedFeatures` that are not in
 * `WEBHOOK_CAPABILITIES` are silently skipped and reported back in
 * `DeliveryResult.degradedCapabilities`.
 */
export class WebhookNotificationProvider implements NotificationProvider {
  readonly requiresDeliveryKey: boolean;
  readonly metadata: ProviderMetadata = {
    id: 'webhook',
    name: 'HTTP Webhook',
    version: '1.0.0',
    capabilities: WEBHOOK_CAPABILITIES,
  };

  private readonly config: Required<WebhookProviderConfig>;

  constructor(config: WebhookProviderConfig = {}) {
    this.config = {
      timeoutMs: config.timeoutMs ?? 5_000,
      defaultHeaders: { ...(config.defaultHeaders ?? {}) },
      receiverSupportsIdempotency: config.receiverSupportsIdempotency ?? false,
    };
    this.requiresDeliveryKey = this.config.receiverSupportsIdempotency;
    if (
      this.requiresDeliveryKey &&
      Object.keys(this.config.defaultHeaders).some(header => header.toLowerCase() === 'idempotency-key')
    ) {
      throw new Error('Idempotency-Key must come from the persisted notification, not defaultHeaders');
    }
  }

  hasCapability(capability: ProviderCapability): boolean {
    return this.metadata.capabilities.has(capability);
  }

  async deliver(payload: DeliveryPayload): Promise<DeliveryResult> {
    const { payload: body, targetRecipient, requestedFeatures, requestId } = payload;

    // Collect features that were requested but are not supported.
    const degradedCapabilities: ProviderCapability[] = [];
    if (requestedFeatures) {
      for (const feature of requestedFeatures) {
        if (!this.hasCapability(feature)) {
          degradedCapabilities.push(feature);
          logger.warn('Webhook provider: requested feature not supported — skipping', {
            requestId,
            feature,
            provider: this.metadata.id,
          });
        }
      }
    }

    const opts: WebhookSendOptions = {
      timeoutMs: this.config.timeoutMs,
      headers: { ...this.config.defaultHeaders },
    };

    if (this.requiresDeliveryKey) {
      if (!payload.deliveryKey || !/^[A-Za-z0-9._:-]{1,255}$/.test(payload.deliveryKey)) {
        return {
          success: false,
          degradedCapabilities,
          errorMessage: 'Idempotent webhook delivery requires a valid persisted delivery key',
        };
      }
      opts.headers!['Idempotency-Key'] = payload.deliveryKey;
    }

    try {
      const response = await sendWebhook(targetRecipient, body, opts);

      if (!response.ok) {
        const errorText = await response.text().catch(() => '');
        logger.warn('Webhook provider: endpoint responded with non-OK status', {
          requestId,
          targetRecipient,
          status: response.status,
          body: errorText,
        });
        return {
          success: false,
          degradedCapabilities,
          errorMessage: `HTTP ${response.status}: ${errorText}`,
        };
      }

      logger.info('Webhook provider: payload delivered', { requestId, targetRecipient });
      return { success: true, degradedCapabilities };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error('Webhook provider: delivery error', {
        requestId,
        targetRecipient,
        error: errorMessage,
      });
      return { success: false, degradedCapabilities, errorMessage };
    }
  }
}
