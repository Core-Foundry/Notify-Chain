# 🩺 Notification Provider Health Checks

This document details the independent provider-level health checking system implemented in NotifyChain (Issue #709).

---

## 1. Overview & Motivation

Operators must be able to distinguish between an internal application failure and an unreachable third-party notification destination (e.g. Discord rate limits, Webhook server downtime) without exposing credentials.

---

## 2. Health Check Capabilities

* **Independent Inspection**: Each provider (Discord, Webhooks, Telegram, Stellar RPC) is evaluated in isolation with independent latency timers.
* **Credential Redaction**: Destination tokens, passwords, and webhook keys are automatically masked (`[REDACTED_TOKEN]`) in health reports and logs.
* **Non-blocking Timeout**: Health checks utilize abort controllers with customizable timeouts (default: 5,000ms).

---

## 3. Health Report Structure

```json
{
  "status": "healthy",
  "timestamp": "2026-08-29T12:00:00.000Z",
  "providers": {
    "Discord": {
      "providerName": "Discord",
      "status": "healthy",
      "latencyMs": 42,
      "lastCheckedAt": "2026-08-29T12:00:00.000Z",
      "sanitizedTarget": "https://discord.com/api/webhooks/123/[REDACTED_TOKEN]"
    },
    "CustomWebhook": {
      "providerName": "CustomWebhook",
      "status": "healthy",
      "latencyMs": 88,
      "lastCheckedAt": "2026-08-29T12:00:00.000Z",
      "sanitizedTarget": "https://api.example.com/notifications"
    }
  }
}
```
