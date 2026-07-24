# Notification Template System - Complete Guide

## Overview

The Notification Template System provides a secure, flexible way to decouple notification content from application logic using reusable templates with dynamic variable interpolation.

**Status**: ✅ **FULLY IMPLEMENTED**  
**Tech Stack**: Node.js/TypeScript, SQLite3, Mustache-like syntax  
**Template Syntax**: `{{variable_name}}`

---

## Quick Start

### 1. Create a Template

```bash
curl -X POST http://localhost:3000/api/templates \
  -H "Content-Type: application/json" \
  -d '{
    "uniqueKey": "welcome_email",
    "name": "Welcome Email",
    "description": "Sent to new users upon registration",
    "channelType": "EMAIL",
    "subjectTemplate": "Welcome to {{app_name}}, {{user_name}}!",
    "bodyTemplate": "Hi {{user_name}},\n\nWelcome to {{app_name}}! Your account has been created successfully.\n\nBest regards,\n{{app_name}} Team",
    "variables": ["user_name", "app_name"],
    "defaultValues": {"app_name": "Notify-Chain"}
  }'
```

### 2. Render a Template

```bash
curl -X POST http://localhost:3000/api/templates/render \
  -H "Content-Type: application/json" \
  -d '{
    "template": "welcome_email",
    "context": {
      "user_name": "John Doe"
    }
  }'
```

**Response**:
```json
{
  "rendered": {
    "subject": "Welcome to Notify-Chain, John Doe!",
    "body": "Hi John Doe,\n\nWelcome to Notify-Chain! Your account has been created successfully.\n\nBest regards,\nNotify-Chain Team"
  }
}
```

---

## Architecture

```
┌─────────────────────────────────────────────────────┐
│              REST API Layer                          │
│  /api/templates (CRUD endpoints)                     │
└──────────────────┬──────────────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────────────┐
│           Template Service (Business Logic)          │
│  - Orchestrates validation, rendering, CRUD          │
└──────────────┬───────────────────┬──────────────────┘
               │                   │
      ┌────────▼─────────┐  ┌─────▼──────────┐
      │ Template         │  │ Template       │
      │ Validator        │  │ Renderer       │
      │ - Syntax check   │  │ - Variable     │
      │ - Security scan  │  │   interpolation│
      └──────────────────┘  │ - HTML escape  │
                            └────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────────────┐
│         Template Repository (Data Layer)             │
└──────────────────┬──────────────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────────────┐
│              SQLite Database                         │
│  - notification_templates                            │
│  - template_usage_log                                │
└─────────────────────────────────────────────────────┘
```

---

## Database Schema

### notification_templates


| Column | Type | Description |
|--------|------|-------------|
| `id` | INTEGER | Primary key |
| `unique_key` | VARCHAR(100) | Unique identifier (e.g., 'welcome_email') |
| `name` | VARCHAR(255) | Human-readable name |
| `description` | TEXT | Purpose/usage description |
| `channel_type` | VARCHAR(50) | EMAIL, SMS, DISCORD, PUSH, WEBHOOK |
| `subject_template` | TEXT | Optional subject with {{placeholders}} |
| `body_template` | TEXT | Main template content (REQUIRED) |
| `variables` | TEXT | JSON array of required variables |
| `default_values` | TEXT | JSON object with fallback values |
| `is_active` | BOOLEAN | Active status (1=active, 0=inactive) |
| `version` | INTEGER | Template version number |
| `created_at` | DATETIME | Creation timestamp |
| `updated_at` | DATETIME | Last update timestamp |
| `created_by` | VARCHAR(100) | User/system that created |
| `updated_by` | VARCHAR(100) | User/system that updated |

### template_usage_log

| Column | Type | Description |
|--------|------|-------------|
| `id` | INTEGER | Primary key |
| `template_id` | INTEGER | Foreign key to notification_templates |
| `rendered_at` | DATETIME | When template was rendered |
| `context_hash` | VARCHAR(64) | Hash of context data (for deduplication) |
| `success` | BOOLEAN | Rendering success status |
| `error_message` | TEXT | Error message if failed |
| `render_duration_ms` | INTEGER | Rendering duration |

---

## API Endpoints

### Create Template

**POST** `/api/templates`


**Request Body**:
```json
{
  "uniqueKey": "welcome_email",
  "name": "Welcome Email",
  "description": "Optional description",
  "channelType": "EMAIL",
  "subjectTemplate": "Welcome {{user_name}}!",
  "bodyTemplate": "Hi {{user_name}}, welcome to {{app_name}}!",
  "variables": ["user_name", "app_name"],
  "defaultValues": {"app_name": "MyApp"},
  "isActive": true,
  "createdBy": "admin"
}
```

**Success Response** (201):
```json
{
  "id": 1,
  "message": "Template created successfully",
  "validation": {
    "isValid": true,
    "errors": [],
    "warnings": [],
    "detectedVariables": ["user_name", "app_name"]
  }
}
```

**Validation Error** (400):
```json
{
  "error": "Template validation failed",
  "validation": {
    "isValid": false,
    "errors": [
      "Mismatched brackets: 1 opening '{{' but 0 closing '}}'",
      "Variable name contains spaces: 'user name'"
    ],
    "warnings": []
  }
}
```

---

### List Templates

**GET** `/api/templates?channelType=EMAIL&isActive=true&limit=10&offset=0`

**Query Parameters**:
- `channelType` (optional): Filter by channel (EMAIL, SMS, DISCORD, PUSH, WEBHOOK)
- `isActive` (optional): Filter by active status (true/false)
- `limit` (optional): Maximum results
- `offset` (optional): Pagination offset

**Response** (200):
```json
{
  "count": 2,
  "templates": [
    {
      "id": 1,
      "uniqueKey": "welcome_email",
      "name": "Welcome Email",
      "channelType": "EMAIL",
      "bodyTemplate": "Hi {{user_name}}!",
      "variables": ["user_name"],
      "isActive": true
    }
  ]
}
```

---

### Get Template by ID

**GET** `/api/templates/:id`

**Response** (200):
```json
{
  "id": 1,
  "uniqueKey": "welcome_email",
  "name": "Welcome Email",
  "description": "Sent to new users",
  "channelType": "EMAIL",
  "subjectTemplate": "Welcome {{user_name}}!",
  "bodyTemplate": "Hi {{user_name}}, welcome!",
  "variables": ["user_name"],
  "defaultValues": {},
  "isActive": true,
  "version": 1,
  "createdAt": "2026-06-20T10:00:00Z",
  "updatedAt": "2026-06-20T10:00:00Z"
}
```

---

### Update Template

**PUT** `/api/templates/:id`

**Request Body** (partial update):
```json
{
  "name": "Updated Name",
  "bodyTemplate": "New body with {{new_variable}}",
  "variables": ["new_variable"],
  "updatedBy": "admin"
}
```

**Response** (200):
```json
{
  "message": "Template updated successfully",
  "validation": {
    "isValid": true,
    "errors": []
  }
}
```

---

### Delete/Deactivate Template

**DELETE** `/api/templates/:id?hard=false`

- `hard=false` (default): Soft delete (marks as inactive)
- `hard=true`: Permanent deletion

**Response** (200):
```json
{
  "message": "Template deactivated"
}
```

---

### Render Template

**POST** `/api/templates/render`

**Request Body**:
```json
{
  "template": "welcome_email",
  "context": {
    "user_name": "John Doe",
    "app_name": "Notify-Chain"
  }
}
```


**Success Response** (200):
```json
{
  "rendered": {
    "subject": "Welcome John Doe!",
    "body": "Hi John Doe, welcome!",
    "variables": {
      "user_name": "John Doe",
      "app_name": "Notify-Chain"
    }
  }
}
```

**Missing Variables Error** (400):
```json
{
  "error": "Missing required variables",
  "missingVariables": ["user_name"]
}
```

---

### Get Template Statistics

**GET** `/api/templates/:id/stats`

**Response** (200):
```json
{
  "totalUses": 150,
  "successCount": 148,
  "failureCount": 2,
  "lastUsed": "2026-06-20T15:30:00Z"
}
```

---

### Get Overview Statistics

**GET** `/api/templates/stats`

**Response** (200):
```json
{
  "totalTemplates": 25,
  "activeTemplates": 20,
  "inactiveTemplates": 5,
  "byChannel": {
    "EMAIL": 12,
    "SMS": 5,
    "DISCORD": 3
  }
}
```

---

## Template Syntax

### Basic Variables

```
Hello {{name}}!
```

**Context**: `{ name: "John" }`  
**Output**: `Hello John!`

### Nested Properties

```
Welcome {{user.first_name}} {{user.last_name}}!
```

**Context**: `{ user: { first_name: "John", last_name: "Doe" } }`  
**Output**: `Welcome John Doe!`

### Multiple Variables

```
Subject: Order {{order_id}} Confirmation
Body: Hi {{customer_name}}, your order {{order_id}} totaling ${{total}} has been confirmed.
```

### Default Values

If a variable is missing, default values are used:

**Template**: `Hello {{name}}!`  
**Default Values**: `{ name: "Guest" }`  
**Context**: `{}`  
**Output**: `Hello Guest!`

---

## Validation Rules

### ✅ Valid Variable Names

```
{{user_name}}      ✅ Alphanumeric + underscore
{{user.name}}      ✅ Nested property (dot notation)
{{order_123}}      ✅ Numbers allowed
{{_private}}       ✅ Leading underscore
```

### ❌ Invalid Variable Names

```
{{user-name}}      ❌ Hyphens not allowed
{{user name}}      ❌ Spaces not allowed
{{user@email}}     ❌ Special characters not allowed
{{}}               ❌ Empty variable
```


### Syntax Errors

```
{{name!            ❌ Unclosed bracket
{name}}            ⚠️  Single bracket (warning)
{{user{{name}}}}   ❌ Nested brackets
```

### Security Restrictions

```
<script>alert()</script>           ❌ Script tags blocked
javascript:void(0)                 ❌ JavaScript protocol blocked
<iframe src="..."></iframe>        ❌ Iframe tags blocked
onclick="malicious()"              ❌ Event handlers blocked
{{__proto__}}                      ❌ Prototype pollution blocked
```

---

## Security Features

### 1. HTML Escaping (Default)

All rendered values are HTML-escaped by default to prevent XSS attacks:

**Input**: `{ name: "<script>alert('xss')</script>" }`  
**Output**: `Hello &lt;script&gt;alert('xss')&lt;/script&gt;!`

### 2. Template Content Validation

Templates are scanned for:
- Script tags
- JavaScript protocols
- Event handlers
- Iframes
- Prototype pollution attempts

### 3. Variable Name Validation

Only safe characters allowed in variable names:
- Alphanumeric: `a-zA-Z0-9`
- Underscore: `_`
- Dot (for nesting): `.`

### 4. Injection Prevention

The renderer validates variable paths against a strict pattern to prevent:
- Command injection
- Property access manipulation
- Prototype pollution

---

## Channel-Specific Validation

### EMAIL

**Requirements**:
- Subject template recommended
- Body length warning at >5000 chars

**Example**:
```json
{
  "channelType": "EMAIL",
  "subjectTemplate": "Order {{order_id}} Confirmed",
  "bodyTemplate": "Dear {{customer_name}},\n\nYour order has been confirmed..."
}
```

### SMS

**Requirements**:
- Body length warning at >160 chars (SMS split)
- Subject not typical for SMS

**Example**:
```json
{
  "channelType": "SMS",
  "bodyTemplate": "Hi {{name}}, your code is {{code}}. Valid for 5 mins."
}
```

### DISCORD

**Requirements**:
- Body hard limit at 2000 chars

**Example**:
```json
{
  "channelType": "DISCORD",
  "bodyTemplate": "**{{event_type}}** alert: {{message}}"
}
```


### PUSH

**Requirements**:
- Subject (title) should be <50 chars
- Body recommended <200 chars

**Example**:
```json
{
  "channelType": "PUSH",
  "subjectTemplate": "New Message from {{sender}}",
  "bodyTemplate": "{{message_preview}}"
}
```

### WEBHOOK

**Requirements**:
- Flexible, minimal validation
- Can contain JSON structures

---

## TypeScript Usage

### Creating a Template

```typescript
import { TemplateService } from './services/template-service';
import { TemplateRepository } from './services/template-repository';
import { TemplateChannelType } from './types/notification-template';
import { Database } from './database/database';

const db = new Database('./data/notifications.db');
await db.initialize();

const repository = new TemplateRepository(db);
const service = new TemplateService(repository);

const result = await service.createTemplate({
  uniqueKey: 'password_reset',
  name: 'Password Reset',
  channelType: TemplateChannelType.EMAIL,
  subjectTemplate: 'Reset Your Password',
  bodyTemplate: `Hi {{user_name}},

Click the link below to reset your password:
{{reset_link}}

This link expires in {{expiry_hours}} hours.`,
  variables: ['user_name', 'reset_link', 'expiry_hours'],
  defaultValues: { expiry_hours: '24' }
});

if (!result.success) {
  console.error('Validation failed:', result.validation?.errors);
} else {
  console.log('Template created:', result.templateId);
}
```

### Rendering a Template

```typescript
const renderResult = await service.renderTemplate('password_reset', {
  user_name: 'John Doe',
  reset_link: 'https://example.com/reset?token=abc123',
  expiry_hours: '24'
});

if (renderResult.success) {
  console.log('Subject:', renderResult.rendered?.subject);
  console.log('Body:', renderResult.rendered?.body);
} else {
  console.error('Render error:', renderResult.error);
  console.error('Missing vars:', renderResult.missingVariables);
}
```

### Direct Rendering (Without Service)

```typescript
import { TemplateRenderer } from './services/template-renderer';

const template = 'Hello {{name}}, your balance is ${{balance}}!';
const context = { name: 'John', balance: 100.50 };

const output = TemplateRenderer.render(template, context, {
  htmlEscape: true,    // Enable HTML escaping (default)
  strictMode: false,   // Don't throw on missing vars (default)
  missingPrefix: '[',  // Prefix for missing vars
  missingSuffix: ']'   // Suffix for missing vars
});

console.log(output);
// Output: Hello John, your balance is $100.5!
```


### Manual Validation

```typescript
import { TemplateValidator } from './services/template-validator';

const validation = TemplateValidator.validate(
  'Hello {{name}}!',
  'Welcome Subject',
  TemplateChannelType.EMAIL
);

if (validation.isValid) {
  console.log('Template is valid!');
  console.log('Variables:', validation.detectedVariables);
} else {
  console.error('Errors:', validation.errors);
  console.warn('Warnings:', validation.warnings);
}
```

---

## Common Use Cases

### 1. Welcome Email

```json
{
  "uniqueKey": "welcome_email",
  "name": "Welcome Email",
  "channelType": "EMAIL",
  "subjectTemplate": "Welcome to {{app_name}}, {{user.first_name}}!",
  "bodyTemplate": "Hi {{user.first_name}},\n\nThank you for joining {{app_name}}!\n\nYour account email: {{user.email}}\nAccount created: {{created_at}}\n\nGet started: {{app_url}}\n\nBest regards,\n{{app_name}} Team",
  "variables": ["user.first_name", "user.email", "created_at", "app_name", "app_url"],
  "defaultValues": {
    "app_name": "Notify-Chain",
    "app_url": "https://notify-chain.com"
  }
}
```

### 2. Password Reset

```json
{
  "uniqueKey": "password_reset",
  "name": "Password Reset",
  "channelType": "EMAIL",
  "subjectTemplate": "Reset Your Password - {{app_name}}",
  "bodyTemplate": "Hi {{user_name}},\n\nYou requested a password reset. Click the link below:\n\n{{reset_link}}\n\nThis link expires in {{expiry_minutes}} minutes.\n\nIf you didn't request this, please ignore this email.",
  "variables": ["user_name", "reset_link", "expiry_minutes"],
  "defaultValues": {
    "app_name": "Notify-Chain",
    "expiry_minutes": "15"
  }
}
```

### 3. Order Confirmation

```json
{
  "uniqueKey": "order_confirmation",
  "name": "Order Confirmation",
  "channelType": "EMAIL",
  "subjectTemplate": "Order #{{order_id}} Confirmed",
  "bodyTemplate": "Hi {{customer.name}},\n\nThank you for your order!\n\nOrder ID: {{order_id}}\nTotal: ${{order.total}}\nItems: {{order.item_count}}\n\nEstimated delivery: {{delivery_date}}\n\nTrack your order: {{tracking_url}}",
  "variables": ["customer.name", "order_id", "order.total", "order.item_count", "delivery_date", "tracking_url"]
}
```

### 4. SMS Verification Code

```json
{
  "uniqueKey": "sms_verification",
  "name": "SMS Verification",
  "channelType": "SMS",
  "bodyTemplate": "Your {{app_name}} verification code is: {{code}}. Valid for {{expiry_minutes}} minutes.",
  "variables": ["code", "app_name", "expiry_minutes"],
  "defaultValues": {
    "app_name": "App",
    "expiry_minutes": "5"
  }
}
```


### 5. Discord Webhook Alert

```json
{
  "uniqueKey": "discord_alert",
  "name": "Discord Alert",
  "channelType": "DISCORD",
  "bodyTemplate": "**{{alert_type}} Alert**\n\n**Event:** {{event_name}}\n**Contract:** `{{contract_address}}`\n**Status:** {{status}}\n**Time:** {{timestamp}}\n\n{{additional_info}}",
  "variables": ["alert_type", "event_name", "contract_address", "status", "timestamp"],
  "defaultValues": {
    "alert_type": "System",
    "additional_info": ""
  }
}
```

---

## Error Handling

### Validation Errors

```typescript
try {
  const result = await service.createTemplate(input);
  
  if (!result.success) {
    if (result.validation) {
      // Template syntax/content errors
      console.error('Validation errors:', result.validation.errors);
      console.warn('Warnings:', result.validation.warnings);
    } else {
      // Business logic errors (duplicate key, etc.)
      console.error('Error:', result.error);
    }
  }
} catch (error) {
  // Database or system errors
  console.error('System error:', error);
}
```

### Rendering Errors

```typescript
const renderResult = await service.renderTemplate('my_template', context);

if (!renderResult.success) {
  if (renderResult.missingVariables) {
    console.error('Missing required variables:', renderResult.missingVariables);
    // Prompt user to provide missing values
  } else {
    console.error('Render error:', renderResult.error);
    // Template not found, inactive, or other error
  }
}
```

---

## Testing

### Running Tests

```bash
cd listener
npm test -- template-system.test.ts
```

### Test Coverage

The test suite includes:
- ✅ Variable interpolation (simple, nested, multiple)
- ✅ HTML escaping and XSS prevention
- ✅ Missing variable handling
- ✅ Default values
- ✅ Syntax validation (brackets, variable names)
- ✅ Security validation (script injection, prototype pollution)
- ✅ Channel-specific validation
- ✅ CRUD operations (create, read, update, delete)
- ✅ Rendering integration
- ✅ Usage logging and statistics

### Example Test

```typescript
test('should render template with nested properties', async () => {
  await service.createTemplate({
    uniqueKey: 'test_nested',
    name: 'Test Nested',
    channelType: TemplateChannelType.EMAIL,
    bodyTemplate: 'Hello {{user.name}}, your order {{order.id}} is ready!'
  });

  const result = await service.renderTemplate('test_nested', {
    user: { name: 'John' },
    order: { id: '12345' }
  });

  expect(result.success).toBe(true);
  expect(result.rendered?.body).toBe('Hello John, your order 12345 is ready!');
});
```

---

## Performance Considerations

### Caching

Consider caching frequently-used templates in memory:

```typescript
class TemplateCache {
  private cache = new Map<string, NotificationTemplate>();

  async get(uniqueKey: string): Promise<NotificationTemplate | null> {
    if (this.cache.has(uniqueKey)) {
      return this.cache.get(uniqueKey)!;
    }

    const template = await repository.getByUniqueKey(uniqueKey);
    if (template) {
      this.cache.set(uniqueKey, template);
    }

    return template;
  }

  clear() {
    this.cache.clear();
  }
}
```


### Batch Rendering

For bulk operations, render multiple templates efficiently:

```typescript
async function renderBulkNotifications(
  templateKey: string,
  recipients: Array<{ email: string; name: string }>
) {
  const template = await service.getTemplate(templateKey);
  if (!template) throw new Error('Template not found');

  const results = await Promise.all(
    recipients.map(async (recipient) => {
      const result = await service.renderTemplate(templateKey, {
        name: recipient.name,
        email: recipient.email
      });

      return {
        email: recipient.email,
        ...result
      };
    })
  );

  return results;
}
```

### Database Optimization

For high-volume systems:
1. Add indexes on frequently queried fields (channel_type, is_active)
2. Use connection pooling
3. Consider read replicas for template queries
4. Archive old template_usage_log entries

---

## Migration Guide

### From Hardcoded Messages

**Before** (hardcoded):
```typescript
function sendWelcomeEmail(user: User) {
  const subject = `Welcome to ${APP_NAME}, ${user.firstName}!`;
  const body = `Hi ${user.firstName},\n\nThank you for joining!`;
  
  emailService.send(user.email, subject, body);
}
```

**After** (template-based):
```typescript
async function sendWelcomeEmail(user: User) {
  const result = await templateService.renderTemplate('welcome_email', {
    user_first_name: user.firstName,
    app_name: APP_NAME
  });

  if (result.success) {
    await emailService.send(
      user.email,
      result.rendered!.subject!,
      result.rendered!.body
    );
  }
}
```

### Migration Steps

1. **Identify all hardcoded messages** in your codebase
2. **Create templates** for each message type
3. **Update code** to use template service
4. **Test rendering** with sample data
5. **Deploy templates** to production
6. **Monitor usage** via template_usage_log

---

## Best Practices

### ✅ DO

1. **Use descriptive unique keys**: `order_confirmation` not `template1`
2. **Document variables**: Use description field to explain context
3. **Set meaningful defaults**: Provide fallbacks for optional variables
4. **Version templates**: Track changes through version field
5. **Test before deploying**: Validate with real data
6. **Log usage**: Monitor which templates are most/least used
7. **Use soft delete**: Deactivate instead of hard deleting
8. **Sanitize inputs**: Template system escapes HTML, but validate context data

### ❌ DON'T

1. **Don't use sensitive data in templates**: No API keys, passwords, tokens
2. **Don't skip validation**: Always validate before saving
3. **Don't nest too deeply**: Limit to 2-3 levels (user.profile.name)
4. **Don't use special characters in unique keys**: Stick to lowercase, numbers, underscore, hyphen
5. **Don't hardcode URLs**: Use variables for links
6. **Don't ignore warnings**: Channel-specific warnings are helpful
7. **Don't bypass HTML escaping**: Unless you absolutely trust the data
8. **Don't create duplicate templates**: Use unique_key to prevent duplicates

---

## Troubleshooting

### Template Not Rendering

**Problem**: Rendered output shows `{{variable}}` instead of value

**Solutions**:
1. Check variable name matches exactly (case-sensitive)
2. Verify variable exists in context object
3. Check for typos in variable path
4. Ensure template is active (`is_active = 1`)

### Validation Failing

**Problem**: Template creation/update rejected

**Solutions**:
1. Check for unclosed brackets: `{{name`
2. Validate variable names (only alphanumeric, underscore, dot)
3. Remove dangerous content (script tags, javascript:)
4. Check channel-specific limits (SMS: 160 chars, Discord: 2000 chars)

### Missing Variables Error

**Problem**: `Missing required variables` when rendering

**Solutions**:
1. Provide all variables listed in template.variables
2. Use defaultValues for optional variables
3. Check context object structure for nested properties


### HTML Escaped Characters in Output

**Problem**: Output shows `&lt;` instead of `<`

**Explanation**: This is intentional HTML escaping for security

**Solution**: If you need raw HTML (⚠️ dangerous), disable escaping:
```typescript
TemplateRenderer.render(template, context, { htmlEscape: false });
```

---

## Advanced Features

### Conditional Rendering (Workaround)

Templates don't support native conditionals, but you can pre-process context:

```typescript
const context = {
  user_name: user.name,
  greeting: user.isPremium ? 'Dear Premium Member' : 'Hello',
  special_offer: user.isPremium ? '' : 'Upgrade to Premium for 20% off!'
};

await templateService.renderTemplate('email_template', context);
```

### Multi-Language Support

Create separate templates per language:

```typescript
// English
await service.createTemplate({
  uniqueKey: 'welcome_email_en',
  name: 'Welcome Email (English)',
  bodyTemplate: 'Hello {{name}}, welcome!'
});

// Spanish
await service.createTemplate({
  uniqueKey: 'welcome_email_es',
  name: 'Welcome Email (Spanish)',
  bodyTemplate: '¡Hola {{name}}, bienvenido!'
});

// Usage
const templateKey = `welcome_email_${user.language}`;
await service.renderTemplate(templateKey, context);
```

### Template Versioning

Track template changes using version field:

```typescript
// When updating bodyTemplate, version auto-increments
await service.updateTemplate(templateId, {
  bodyTemplate: 'Updated content {{variable}}'
});

// Version goes from 1 → 2

// Query templates by version
const template = await repository.getById(templateId);
console.log('Current version:', template.version);
```

### A/B Testing

Create multiple versions of a template:

```typescript
await service.createTemplate({
  uniqueKey: 'welcome_email_v1',
  name: 'Welcome Email - Version A',
  bodyTemplate: 'Short welcome message'
});

await service.createTemplate({
  uniqueKey: 'welcome_email_v2',
  name: 'Welcome Email - Version B',
  bodyTemplate: 'Longer welcome message with more details'
});

// Randomly select version
const version = Math.random() < 0.5 ? 'v1' : 'v2';
await service.renderTemplate(`welcome_email_${version}`, context);
```

---

## Integration Examples

### With Email Service

```typescript
import { TemplateService } from './services/template-service';
import { EmailService } from './services/email-service';

async function sendTemplatedEmail(
  templateKey: string,
  recipient: string,
  context: Record<string, any>
) {
  const renderResult = await templateService.renderTemplate(templateKey, context);

  if (!renderResult.success) {
    throw new Error(`Failed to render template: ${renderResult.error}`);
  }

  await emailService.send({
    to: recipient,
    subject: renderResult.rendered!.subject || 'Notification',
    body: renderResult.rendered!.body
  });
}

// Usage
await sendTemplatedEmail('order_confirmation', 'customer@example.com', {
  order_id: '12345',
  customer_name: 'John Doe',
  order_total: '99.99'
});
```

### With Scheduled Notifications

```typescript
import { ScheduledNotificationRepository } from './services/scheduled-notification-repository';

async function scheduleTemplatedNotification(
  templateKey: string,
  context: Record<string, any>,
  executeAt: Date,
  recipient: string
) {
  // Render template
  const renderResult = await templateService.renderTemplate(templateKey, context);

  if (!renderResult.success) {
    throw new Error('Template rendering failed');
  }

  // Schedule notification
  const notificationId = await scheduledNotificationRepo.create({
    payload: {
      template: templateKey,
      rendered: renderResult.rendered,
      context
    },
    notificationType: NotificationType.EMAIL,
    targetRecipient: recipient,
    executeAt,
    maxRetries: 3
  });

  return notificationId;
}
```


### With Discord Webhook

```typescript
import { DiscordNotificationService } from './services/discord-notification';

async function sendTemplatedDiscordNotification(
  templateKey: string,
  context: Record<string, any>,
  webhookUrl: string
) {
  const renderResult = await templateService.renderTemplate(templateKey, context);

  if (!renderResult.success) {
    throw new Error('Template rendering failed');
  }

  await discordService.sendWebhook(webhookUrl, {
    content: renderResult.rendered!.body
  });
}

// Usage
await sendTemplatedDiscordNotification('blockchain_alert', {
  event_name: 'Token Transfer',
  contract_address: '0x123...',
  amount: '1000',
  timestamp: new Date().toISOString()
}, process.env.DISCORD_WEBHOOK_URL);
```

---

## Security Considerations

### Input Validation

Always validate context data before passing to templates:

```typescript
function validateContext(context: Record<string, any>): boolean {
  // Check for dangerous patterns
  const dangerous = ['<script', 'javascript:', 'onerror=', '__proto__'];
  
  const values = JSON.stringify(context);
  for (const pattern of dangerous) {
    if (values.toLowerCase().includes(pattern)) {
      return false;
    }
  }
  
  return true;
}

// Usage
if (!validateContext(context)) {
  throw new Error('Context contains potentially dangerous content');
}

await templateService.renderTemplate(templateKey, context);
```

### Rate Limiting

Prevent abuse of template rendering:

```typescript
class RateLimiter {
  private requests = new Map<string, number[]>();

  isAllowed(identifier: string, maxRequests: number, windowMs: number): boolean {
    const now = Date.now();
    const userRequests = this.requests.get(identifier) || [];
    
    // Remove old requests outside window
    const recentRequests = userRequests.filter(time => now - time < windowMs);
    
    if (recentRequests.length >= maxRequests) {
      return false;
    }
    
    recentRequests.push(now);
    this.requests.set(identifier, recentRequests);
    
    return true;
  }
}

const rateLimiter = new RateLimiter();

// In API handler
if (!rateLimiter.isAllowed(req.ip, 100, 60000)) {
  return sendJSON(res, 429, { error: 'Rate limit exceeded' });
}
```

### Access Control

Implement role-based access for template management:

```typescript
enum TemplatePermission {
  CREATE = 'template:create',
  UPDATE = 'template:update',
  DELETE = 'template:delete',
  RENDER = 'template:render'
}

function checkPermission(user: User, permission: TemplatePermission): boolean {
  // Implement your authorization logic
  return user.permissions.includes(permission);
}

// In API handler
if (!checkPermission(req.user, TemplatePermission.CREATE)) {
  return sendJSON(res, 403, { error: 'Insufficient permissions' });
}
```

---

## Monitoring & Analytics

### Template Usage Dashboard

Track which templates are used most:

```sql
SELECT 
  t.unique_key,
  t.name,
  COUNT(ul.id) as total_uses,
  SUM(CASE WHEN ul.success = 1 THEN 1 ELSE 0 END) as success_count,
  MAX(ul.rendered_at) as last_used
FROM notification_templates t
LEFT JOIN template_usage_log ul ON t.id = ul.template_id
WHERE t.is_active = 1
GROUP BY t.id
ORDER BY total_uses DESC
LIMIT 10;
```

### Error Tracking

Monitor failed renders:

```sql
SELECT 
  t.unique_key,
  t.name,
  COUNT(ul.id) as failure_count,
  ul.error_message,
  MAX(ul.rendered_at) as last_failure
FROM notification_templates t
JOIN template_usage_log ul ON t.id = ul.template_id
WHERE ul.success = 0
GROUP BY t.id, ul.error_message
ORDER BY failure_count DESC;
```

### Performance Metrics

```typescript
async function renderWithTiming(
  templateKey: string,
  context: Record<string, any>
) {
  const startTime = Date.now();
  
  const result = await templateService.renderTemplate(templateKey, context);
  
  const duration = Date.now() - startTime;
  
  // Log slow renders
  if (duration > 100) {
    logger.warn('Slow template render', {
      templateKey,
      duration,
      variableCount: Object.keys(context).length
    });
  }
  
  return result;
}
```

---

## FAQ

### Q: Can I use loops in templates?

**A**: No, the template system doesn't support loops. Pre-process data before rendering:

```typescript
const items = ['Item 1', 'Item 2', 'Item 3'];
const context = {
  items_list: items.map((item, index) => `${index + 1}. ${item}`).join('\n')
};
// Template: {{items_list}}
```

### Q: How do I handle dates/times?

**A**: Format dates before passing to template:

```typescript
const context = {
  created_at: new Date().toLocaleDateString(),
  time: new Date().toLocaleTimeString()
};
```


### Q: Can I use HTML in email templates?

**A**: Yes, but be cautious:

1. **For user-provided content**: Always keep HTML escaping enabled
2. **For trusted HTML**: You can disable escaping (⚠️ risky)

```typescript
// Safe: HTML structure in template, user data escaped
const template = '<h1>Hello {{name}}</h1><p>{{message}}</p>';
const context = { name: 'John', message: '<script>alert("xss")</script>' };
// Output: <h1>Hello John</h1><p>&lt;script&gt;alert("xss")&lt;/script&gt;</p>
```

### Q: What's the maximum template size?

**A**: 
- Body template: 10,000 characters
- Subject template: 500 characters
- Variable name: 100 characters
- Unique key: 255 characters

### Q: How do I test templates before deploying?

**A**: Use the render endpoint with test data:

```bash
curl -X POST http://localhost:3000/api/templates/render \
  -H "Content-Type: application/json" \
  -d '{
    "template": "my_template",
    "context": {"test_var": "test_value"}
  }'
```

### Q: Can I import templates from a file?

**A**: Yes, create a migration script:

```typescript
import * as fs from 'fs';
import * as path from 'path';

async function importTemplates(filePath: string) {
  const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  
  for (const template of data.templates) {
    await templateService.createTemplate(template);
  }
}

// templates.json
{
  "templates": [
    {
      "uniqueKey": "welcome_email",
      "name": "Welcome Email",
      "channelType": "EMAIL",
      "bodyTemplate": "..."
    }
  ]
}
```

### Q: How do I backup templates?

**A**: Export from database:

```bash
sqlite3 notifications.db ".dump notification_templates" > templates_backup.sql
```

Or via API:

```typescript
async function exportTemplates() {
  const templates = await templateService.listTemplates();
  fs.writeFileSync('templates.json', JSON.stringify(templates, null, 2));
}
```

---

## Roadmap

### Planned Features

- [ ] **Template Inheritance**: Base templates with overrides
- [ ] **Template Macros**: Reusable template snippets
- [ ] **Rich Text Editor**: Web UI for template editing
- [ ] **Template Preview**: Live preview with sample data
- [ ] **Approval Workflow**: Require approval before activating templates
- [ ] **Template Analytics Dashboard**: Usage trends, performance metrics
- [ ] **Multi-tenancy**: Isolate templates by organization
- [ ] **Template Marketplace**: Share templates across organizations

### Contributing

To contribute template system enhancements:

1. Read existing code in `listener/src/services/template-*`
2. Add tests to `listener/src/tests/template-system.test.ts`
3. Update this guide with new features
4. Submit pull request with detailed description

---

## References

### Files

- **Types**: `listener/src/types/notification-template.ts`
- **Renderer**: `listener/src/services/template-renderer.ts`
- **Validator**: `listener/src/services/template-validator.ts`
- **Repository**: `listener/src/services/template-repository.ts`
- **Service**: `listener/src/services/template-service.ts`
- **API**: `listener/src/api/template-api.ts`
- **Tests**: `listener/src/tests/template-system.test.ts`
- **Schema**: `listener/src/database/schema.sql` (lines 85-145)

### Related Documentation

- **Telemetry System**: `TELEMETRY_BUG_ANALYSIS.md`
- **Monitoring Integration**: `docs/MONITORING_INTEGRATION.md`
- **Architecture**: `ARCHITECTURE_DIAGRAM.md`

---

## Support

For issues or questions:
- Review test cases for examples
- Check validation errors for specific guidance
- Consult TypeScript definitions for method signatures
- Review source code comments for implementation details

---

**Last Updated**: June 20, 2026  
**Version**: 1.0  
**Status**: Production Ready
