# Compatibility Matrix for Notification Consumers

This document provides a machine-readable compatibility matrix for Notify-Chain notification consumers. It identifies supported payload versions, delivery adapters, and consumer-facing compatibility expectations.

## Payload Version Compatibility

| Payload Version | Release Date | Status | Supported Adapters | Breaking Changes |
|-----------------|--------------|--------|-------------------|------------------|
| v1.0.0 | 2026-01-15 | Stable | Webhook, Email, SMS, Push | Initial release |
| v1.1.0 | 2026-03-20 | Stable | Webhook, Email, SMS, Push | Added retry metadata |
| v1.2.0 | 2026-06-10 | Stable | Webhook, Email, SMS, Push, Discord | Added Discord adapter, added event source field |
| v2.0.0 | 2026-09-01 | Beta | Webhook, Email, SMS, Push, Discord | **Breaking**: Renamed `notification_id` to `id`, moved `payload` to top level |

## Delivery Adapter Compatibility

| Adapter | Minimum Payload Version | Maximum Payload Version | Features | Notes |
|---------|------------------------|-------------------------|----------|-------|
| Webhook | v1.0.0 | v2.0.0 | Signature verification, retry, rate limiting | Supports custom headers |
| Email | v1.0.0 | v2.0.0 | HTML templates, attachments, BCC | Uses SMTP or SendGrid |
| SMS | v1.0.0 | v2.0.0 | Character limit checking, Unicode support | Uses Twilio or Termii |
| Push | v1.1.0 | v2.0.0 | FCM, APNs, silent notifications | Requires device token |
| Discord | v1.2.0 | v2.0.0 | Embeds, buttons, webhook URLs | Requires bot token or webhook URL |

## Consumer Integration Compatibility

| Integration Type | Minimum Notify-Chain Version | Supported SDKs | Documentation |
|------------------|------------------------------|----------------|---------------|
| Direct API | v1.0.0 | REST, GraphQL | [API Reference](./api-versioning.md) |
| Webhook Consumer | v1.0.0 | Any HTTP client | [Webhook Guide](./NOTIFICATION-FLOW.md) |
| Email Client | v1.0.0 | SMTP, SendGrid | [Email Setup](./LISTENER-CONFIGURATION.md) |
| SMS Client | v1.0.0 | Twilio, Termii | [SMS Setup](./LISTENER-CONFIGURATION.md) |
| Push Client | v1.1.0 | FCM, APNs | [Push Setup](./LISTENER-CONFIGURATION.md) |
| Discord Bot | v1.2.0 | Discord.js, discord.py | [Discord Setup](./LISTENER-CONFIGURATION.md) |

## Migration Guide

### v1.x → v2.0.0 Breaking Changes

1. **Payload structure**: Moved `payload` from nested to top level
2. **Field renaming**: `notification_id` → `id`
3. **Required fields**: Added `version` field to all payloads
4. **Adapter endpoints**: Updated webhook URL format from `/api/v1/notify` to `/api/v2/notify`

### Migration Steps

1. Update your consumer to handle both v1.x and v2.0.0 payloads
2. Check the `version` field in the payload
3. Map `notification_id` to `id` if using v1.x
4. Update your webhook endpoint URL to v2 if available
5. Test with the v2.0.0 beta payload before full migration

## CI Validation

This compatibility matrix is validated by CI to ensure:
- All listed payload versions match the implementation
- All adapter versions match the adapter capabilities
- All documentation links are valid
- No breaking changes are introduced without a major version bump

## Support Policy

- **Stable versions**: Supported for 12 months after release
- **Beta versions**: Supported for 3 months after release
- **End-of-life versions**: No longer supported, consumers should upgrade

## Questions?

For questions about compatibility, please:
1. Check the [FAQ](./FAQ.md)
2. Review the [API Reference](./api-versioning.md)
3. Open an issue in the repository
