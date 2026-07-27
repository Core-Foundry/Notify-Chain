# Template System Quick Start Guide

## What is the Template System?

The Notification Template System allows you to create reusable notification templates with dynamic variables instead of hardcoding messages in your application code.

**Before** (hardcoded):
```typescript
const message = `Hello ${userName}, welcome to ${appName}!`;
```

**After** (template-based):
```typescript
// Create template once
POST /api/templates
{
  "uniqueKey": "welcome_msg",
  "bodyTemplate": "Hello {{user_name}}, welcome to {{app_name}}!"
}

// Render anywhere with different data
POST /api/templates/render
{
  "uniqueKey": "welcome_msg",
  "context": { "user_name": "Alice", "app_name": "NotifyChain" }
}
```

## Quick Setup (2 minutes)

### 1. Run Migrations
```bash
cd listener
npm run migrate          # Creates template tables
npm run migrate:templates # Seeds sample templates (optional)
```

### 2. Start the Server
```bash
npm run dev
```

### 3. Test It
```bash
# List templates
curl http://localhost:3000/api/templates

# Render a template
curl -X POST http://localhost:3000/api/templates/render \
  -H "Content-Type: application/json" \
  -d '{
    "uniqueKey": "user_welcome",
    "context": {
      "user_name": "Alice",
      "app_name": "NotifyChain"
    }
  }'
```

## Common Use Cases

### 1. Welcome Emails
```bash
curl -X POST http://localhost:3000/api/templates \
  -H "Content-Type: application/json" \
  -d '{
    "uniqueKey": "welcome_email",
    "name": "Welcome Email",
    "channelType": "EMAIL",
    "subjectTemplate": "Welcome to {{app_name}}!",
    "bodyTemplate": "Hi {{user_name}},\n\nThanks for joining {{app_name}}!\n\nBest,\nThe Team",
    "variables": ["user_name", "app_name"],
    "defaultValues": {
      "app_name": "NotifyChain"
    }
  }'
```

### 2. Order Confirmations
```bash
curl -X POST http://localhost:3000/api/templates \
  -H "Content-Type: application/json" \
  -d '{
    "uniqueKey": "order_confirmation",
    "name": "Order Confirmation",
    "channelType": "EMAIL",
    "subjectTemplate": "Order #{{order_id}} Confirmed",
    "bodyTemplate": "Dear {{customer_name}},\n\nYour order #{{order_id}} for ${{total}} has been confirmed.\n\nThank you!",
    "variables": ["customer_name", "order_id", "total"]
  }'
```

### 3. Discord Alerts
```bash
curl -X POST http://localhost:3000/api/templates \
  -H "Content-Type: application/json" \
  -d '{
    "uniqueKey": "system_alert",
    "name": "System Alert",
    "channelType": "DISCORD",
    "bodyTemplate": "🚨 **{{alert_type}}**\n\n{{message}}\n\nTime: {{timestamp}}",
    "variables": ["alert_type", "message", "timestamp"]
  }'
```

### 4. SMS Verification
```bash
curl -X POST http://localhost:3000/api/templates \
  -H "Content-Type: application/json" \
  -d '{
    "uniqueKey": "sms_verification",
    "name": "SMS Verification Code",
    "channelType": "SMS",
    "bodyTemplate": "Your verification code is: {{code}}. Valid for {{validity_minutes}} minutes.",
    "variables": ["code", "validity_minutes"]
  }'
```

## Template Syntax

### Basic Variables
```
Hello {{user_name}}!
```

### Nested Properties
```
{{user.first_name}} {{user.last_name}}
```

### With Default Values
When creating a template, specify defaults:
```json
{
  "bodyTemplate": "Welcome to {{app_name}}!",
  "defaultValues": {
    "app_name": "NotifyChain"
  }
}
```

Now `app_name` is optional when rendering.

## Channel Types

| Channel | Subject? | Max Body Length | Notes |
|---------|----------|----------------|-------|
| EMAIL | Required | 50,000 chars | HTML supported |
| SMS | Not allowed | 1,600 chars | Plain text only |
| DISCORD | Optional (embed title) | 4,000 chars | Markdown supported |
| PUSH | Optional (notification title) | 1,000 chars | Plain text |
| WEBHOOK | Optional | 100,000 chars | JSON payloads |

## Common Operations

### List All Templates
```bash
curl http://localhost:3000/api/templates
```

### Get Specific Template
```bash
curl http://localhost:3000/api/templates/by-key/welcome_email
```

### Update Template
```bash
curl -X PUT http://localhost:3000/api/templates/1 \
  -H "Content-Type: application/json" \
  -d '{"bodyTemplate": "Updated message: Hello {{user_name}}!"}'
```

### Deactivate Template
```bash
curl -X DELETE http://localhost:3000/api/templates/1
```

### Permanently Delete
```bash
curl -X DELETE "http://localhost:3000/api/templates/1?hard=true"
```

### Get Usage Stats
```bash
curl http://localhost:3000/api/templates/stats
```

## Validation Errors

The system validates templates before saving:

### ❌ Unclosed Brackets
```
"Hello {{user_name"  # Error: Unclosed bracket
```

### ❌ Invalid Variable Names
```
"Hello {{user-name}}"  # Error: Hyphens not allowed
"Hello {{123user}}"    # Error: Can't start with number
```

### ❌ Script Injection
```
"<script>alert(1)</script>"  # Error: Script tags not allowed
```

### ✅ Valid Syntax
```
"Hello {{user_name}}!"
"Welcome {{user.first_name}}"
"Code: {{verification_code}}"
```

## Security Features

### Auto HTML Escaping
Variables are automatically escaped to prevent XSS:
```
Context: { "user_name": "<script>alert(1)</script>" }
Output: "&lt;script&gt;alert(1)&lt;/script&gt;"
```

### Injection Prevention
Templates are scanned for:
- Script tags
- SQL injection patterns
- Command injection attempts
- Prototype pollution

### Safe Rendering
- Missing required variables → 400 error
- Missing optional variables → use defaults or empty string
- Invalid syntax → rejected at creation time

## Integration Example

### TypeScript/Node.js
```typescript
import fetch from 'node-fetch';

// Create template
async function createTemplate() {
  const response = await fetch('http://localhost:3000/api/templates', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      uniqueKey: 'welcome_email',
      name: 'Welcome Email',
      channelType: 'EMAIL',
      subjectTemplate: 'Welcome {{user_name}}!',
      bodyTemplate: 'Hello {{user_name}}, welcome to {{app_name}}!',
      variables: ['user_name', 'app_name']
    })
  });
  return response.json();
}

// Render template
async function sendWelcomeEmail(userName: string) {
  const response = await fetch('http://localhost:3000/api/templates/render', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      uniqueKey: 'welcome_email',
      context: {
        user_name: userName,
        app_name: 'NotifyChain'
      }
    })
  });
  
  const result = await response.json();
  console.log('Subject:', result.subject);
  console.log('Body:', result.body);
  
  // Send via email service...
}
```

### Python
```python
import requests

# Create template
def create_template():
    response = requests.post('http://localhost:3000/api/templates', json={
        'uniqueKey': 'welcome_email',
        'name': 'Welcome Email',
        'channelType': 'EMAIL',
        'subjectTemplate': 'Welcome {{user_name}}!',
        'bodyTemplate': 'Hello {{user_name}}, welcome to {{app_name}}!',
        'variables': ['user_name', 'app_name']
    })
    return response.json()

# Render template
def send_welcome_email(user_name):
    response = requests.post('http://localhost:3000/api/templates/render', json={
        'uniqueKey': 'welcome_email',
        'context': {
            'user_name': user_name,
            'app_name': 'NotifyChain'
        }
    })
    
    result = response.json()
    print(f"Subject: {result['subject']}")
    print(f"Body: {result['body']}")
```

## Troubleshooting

### Templates Not Found
```bash
# Check if migrations ran
npm run migrate

# List all templates
curl http://localhost:3000/api/templates
```

### Validation Errors
Check the error message for specific issues:
```json
{
  "error": "Template validation failed: Unclosed bracket in template at position 10"
}
```

### Missing Variables
Ensure all required variables are provided:
```json
{
  "error": "Missing required variables: user_name"
}
```

### Server Not Starting
Check if template service is enabled in config:
```typescript
// In index.ts, template service initializes with scheduler
if (config.scheduler?.enabled) {
  // Template service starts here
}
```

## Next Steps

1. **Read Full Documentation**: See [TEMPLATE_API.md](./TEMPLATE_API.md) for complete API reference
2. **Run Tests**: `npm test -- template-system.test`
3. **Explore Samples**: Check sample templates created by `npm run migrate:templates`
4. **Create Your Templates**: Start building templates for your use cases

## Need Help?

- 📖 [Full API Documentation](./TEMPLATE_API.md)
- 🧪 [Test Suite](../src/tests/template-system.test.ts)
- 💬 [Contributing Guidelines](../../CONTRIBUTING.md)
