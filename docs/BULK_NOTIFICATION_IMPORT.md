# Bulk Notification Import

Administrators can import multiple notifications from structured JSON or CSV
files via `POST /api/notifications/import`.

## Endpoint

```
POST /api/notifications/import
Content-Type: application/json | text/csv
X-API-Key: <admin-key>   # required when apiKeys are configured
```

## Accepted formats

### JSON

Array of records, or `{ "notifications": [ ... ] }`:

```json
{
  "notifications": [
    {
      "id": "n1",
      "recipient": "https://discord.com/api/webhooks/...",
      "channel": "discord",
      "message": "Hello",
      "executeAt": "2026-07-27T12:00:00.000Z"
    }
  ]
}
```

### CSV

Header row required. Recognized columns:

`id`, `recipient` / `target_recipient`, `channel` / `type`, `message`,
`execute_at` / `executeAt`

```csv
id,recipient,channel,message,execute_at
n1,https://hooks.example/1,webhook,Ping,2026-07-27T12:00:00.000Z
```

## Behaviour

- Valid records are scheduled via the normal scheduler API.
- Invalid records are **skipped** (not fatal); processing continues.
- Response always includes an import **summary**.

```json
{
  "total": 3,
  "imported": 2,
  "skipped": 1,
  "importedIds": [101, 102],
  "skippedRecords": [
    { "index": 1, "reason": "Invalid channel: carrier-pigeon" }
  ],
  "format": "json",
  "durationMs": 45
}
```

## Channels

`discord`, `webhook`, `email`, `sms`
