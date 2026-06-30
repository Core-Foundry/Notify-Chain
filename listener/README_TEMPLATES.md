# Notification Template System

## Overview

The Template System allows you to create reusable notification templates with dynamic variables instead of hardcoding messages in your application.

## Quick Start

```bash
# Run migrations
npm run migrate

# (Optional) Seed sample templates
npm run migrate:templates

# Start server
npm run dev
```

## Basic Usage

### Create a Template
```bash
curl -X POST http://localhost:3000/api/templates \
  -H "Content-Type: application/json" \
  -d '{
    "uniqueKey": "welcome_email",
    "name": "Welcome Email",
    "channelType": "EMAIL",
    "subjectTemplate": "Welcome {{user_name}}!",
    "bodyTemplate": "Hello {{user_name}}, welcome to {{app_name}}!",
    "variables": ["user_name", "app_name"]
  }'
```

### Render a Template
```bash
curl -X POST http://localhost:3000/api/templates/render \
  -H "Content-Type: application/json" \
  -d '{
    "uniqueKey": "welcome_email",
    "context": {
      "user_name": "Alice",
      "app_name": "NotifyChain"
    }
  }'
```

**Result:**
```json
{
  "subject": "Welcome Alice!",
  "body": "Hello Alice, welcome to NotifyChain!",
  "templateId": 1,
  "channelType": "EMAIL"
}
```

## Features

- ✅ **Full CRUD API** - Create, read, update, delete templates
- ✅ **Multi-Channel** - EMAIL, SMS, DISCORD, PUSH, WEBHOOK
- ✅ **Dynamic Variables** - Mustache-like `{{variable}}` syntax
- ✅ **Security** - XSS prevention, injection protection
- ✅ **Validation** - Syntax checking, channel-specific rules
- ✅ **Analytics** - Usage tracking and statistics

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/templates` | Create template |
| GET | `/api/templates` | List templates |
| GET | `/api/templates/:id` | Get template |
| PUT | `/api/templates/:id` | Update template |
| DELETE | `/api/templates/:id` | Delete template |
| POST | `/api/templates/render` | Render template |
| GET | `/api/templates/stats` | Get statistics |

## Template Syntax

### Basic Variables
```
Hello {{user_name}}!
```

### Nested Properties
```
Welcome {{user.first_name}} {{user.last_name}}!
```

### Default Values
```json
{
  "bodyTemplate": "Welcome to {{app_name}}!",
  "defaultValues": {
    "app_name": "NotifyChain"
  }
}
```

## Channel Types

| Channel | Max Body | Subject? |
|---------|----------|----------|
| EMAIL | 50,000 chars | Required |
| SMS | 1,600 chars | Not allowed |
| DISCORD | 4,000 chars | Optional |
| PUSH | 1,000 chars | Optional |
| WEBHOOK | 100,000 chars | Optional |

## Security

- **XSS Prevention**: All variables are HTML-escaped
- **Injection Protection**: Script tags and SQL patterns blocked
- **Validation**: Syntax checked before save
- **Safe Rendering**: No code execution, no eval()

## Documentation

- 📘 **Full API Reference**: [docs/TEMPLATE_API.md](./docs/TEMPLATE_API.md)
- 🚀 **Quick Start Guide**: [docs/TEMPLATE_QUICKSTART.md](./docs/TEMPLATE_QUICKSTART.md)
- ✅ **Integration Checklist**: [TEMPLATE_SYSTEM_CHECKLIST.md](./TEMPLATE_SYSTEM_CHECKLIST.md)

## Testing

```bash
npm test -- template-system.test
```

## Examples

### Email Confirmation
```javascript
{
  "uniqueKey": "order_confirmation",
  "channelType": "EMAIL",
  "subjectTemplate": "Order #{{order_id}} Confirmed",
  "bodyTemplate": "Dear {{customer_name}},\n\nYour order #{{order_id}} for ${{total}} has been confirmed.",
  "variables": ["customer_name", "order_id", "total"]
}
```

### SMS Verification
```javascript
{
  "uniqueKey": "sms_verify",
  "channelType": "SMS",
  "bodyTemplate": "Your verification code: {{code}}. Valid for {{minutes}} minutes.",
  "variables": ["code", "minutes"]
}
```

### Discord Alert
```javascript
{
  "uniqueKey": "system_alert",
  "channelType": "DISCORD",
  "bodyTemplate": "🚨 **{{alert_type}}**\n\n{{message}}\n\nTime: {{timestamp}}",
  "variables": ["alert_type", "message", "timestamp"]
}
```

## Common Operations

```bash
# List all templates
curl http://localhost:3000/api/templates

# Get by unique key
curl http://localhost:3000/api/templates/by-key/welcome_email

# Update template
curl -X PUT http://localhost:3000/api/templates/1 \
  -H "Content-Type: application/json" \
  -d '{"bodyTemplate": "Updated: Hello {{name}}!"}'

# Deactivate template
curl -X DELETE http://localhost:3000/api/templates/1

# Get usage statistics
curl http://localhost:3000/api/templates/stats
```

## Troubleshooting

### Templates not found
```bash
# Check if migrations ran
npm run migrate

# Verify tables exist
sqlite3 ./data/notifications.db ".tables"
```

### Validation errors
Templates are validated for:
- Unclosed brackets: `{{variable` ❌
- Invalid names: `{{123invalid}}` ❌
- Script tags: `<script>` ❌

Check error messages for specific issues.

### Rendering errors
Ensure all required variables are provided:
```json
{
  "error": "Missing required variables: user_name"
}
```

---

**See full documentation in [docs/TEMPLATE_API.md](./docs/TEMPLATE_API.md)**
