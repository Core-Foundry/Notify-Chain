# Notification Export Format

Users can export filtered notification search results from the dashboard
**Notification Search** page via the **Export** button.

## Behaviour

- Export uses the **currently applied filters** (query, sender, tx hash, event
  ID, status, type, date range).
- All matching rows are fetched (paginated under the hood) and downloaded.
- Supported formats: **JSON** and **CSV**.

## JSON

```json
{
  "exportedAt": "2026-07-26T15:00:00.000Z",
  "format": "json",
  "filters": {
    "status": "COMPLETED",
    "type": "discord",
    "q": "billing"
  },
  "total": 1,
  "notifications": [
    {
      "id": 42,
      "source": "scheduled",
      "eventId": null,
      "txHash": null,
      "contractAddress": null,
      "notificationType": "discord",
      "targetRecipient": "https://discord.com/api/webhooks/...",
      "status": "COMPLETED",
      "createdAt": "2026-07-26T14:00:00.000Z",
      "payload": "{\"message\":\"...\"}"
    }
  ]
}
```

## CSV

Header:

```
id,source,eventId,txHash,contractAddress,notificationType,targetRecipient,status,createdAt,payload
```

- Commas / quotes / newlines inside fields are escaped per RFC 4180-style rules.
- Filters are applied by row selection (only matching notifications appear).

## Implementation

- UI: `dashboard/src/pages/NotificationSearchPage.tsx`
- Helpers: `dashboard/src/utils/notificationExport.ts`
