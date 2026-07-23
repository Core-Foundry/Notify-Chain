# Notification Template System API Documentation

## Overview

The Notification Template System provides a complete, secure templating engine with full CRUD capabilities, dynamic placeholder rendering, and strict validation. It allows you to store notification templates with variable placeholders that can be dynamically rendered at runtime.

## Features

- **Full CRUD Operations**: Create, Read, Update, and Delete notification templates
- **Dynamic Rendering**: Use Mustache-like `{{variable}}` syntax for placeholders
- **Multi-Channel Support**: EMAIL, SMS, DISCORD, PUSH, WEBHOOK
- **Strict Validation**: Syntax checking, security scanning, channel-specific rules
- **Usage Analytics**: Track template usage and performance
- **Safe Rendering**: XSS protection, injection prevention, missing variable handling

## Database Schema

The system uses two main tables:

### `notification_templates`
- `id`: Primary key
- `unique_key`: Unique identifier (e.g., 'welcome_email')
- `name`: Human-readable name
- `description`: Template purpose
- `channel_type`: EMAIL, SMS, DISCORD, PUSH, WEBHOOK
- `subject_template`: Optional subject line (for EMAIL, PUSH)
- `body_template`: Main content with `{{placeholders}}`
- `variables`: JSON array of required variable names
- `default_values`: JSON object with defaults for optional variables
- `is_active`: Boolean activation status
- `version`: Template version number
- `created_at`, `updated_at`: Timestamps
- `created_by`: Creator identifier
- `last_validated_at`, `validation_status`: Validation metadata

### `template_usage_log`
- `id`: Primary key
- `template_id`: Foreign key to templates
- `rendered_at`: Timestamp
- `context_hash`: Hash of render context
- `success`: Boolean success status
- `error_message`: Error details if failed
- `render_duration_ms`: Performance metric

## API Endpoints

### 1. Create Template

**Endpoint**: `POST /api/templates`

**Description**: Create a new notification template with validation.

**Request Body**:
```json
{
  "uniqueKey": "welcome_email",
  "name": "Welcome Email",
  "description": "Sent to new users upon registration",
  "channelType": "EMAIL",
  "subjectTemplate": "Welcome to {{app_name}}, {{user_name}}!",
  "bodyTemplate": "Hello {{user_name}},\n\nWelcome to {{app_name}}! Your account has been created successfully.\n\nBest regards,\nThe Team",
  "variables": ["user_name", "app_name"],
  "defaultValues": {
    "app_name": "NotifyChain"
  },
  "createdBy": "admin@example.com"
}
```

**Response** (201 Created):
```json
{
  "id": 1,
  "uniqueKey": "welcome_email"
}
```

**Error Responses**:
- `400 Bad Request`: Missing required fields or validation errors
- `409 Conflict`: Template with unique key already exists
- `500 Internal Server Error`: Server error

**Example**:
```bash
curl -X POST http://localhost:3000/api/templates \
  -H "Content-Type: application/json" \
  -d '{
    "uniqueKey": "welcome_email",
    "name": "Welcome Email",
    "channelType": "EMAIL",
    "bodyTemplate": "Hello {{user_name}}!",
    "variables": ["user_name"]
  }'
```

---

### 2. List Templates

**Endpoint**: `GET /api/templates`

**Description**: Retrieve all templates with optional filtering.

**Query Parameters**:
- `channelType` (optional): Filter by channel type (EMAIL, SMS, etc.)
- `activeOnly` (optional): Set to `true` to return only active templates

**Response** (200 OK):
```json
{
  "count": 2,
  "templates": [
    {
      "id": 1,
      "uniqueKey": "welcome_email",
      "name": "Welcome Email",
      "description": "Sent to new users upon registration",
      "channelType": "EMAIL",
      "subjectTemplate": "Welcome to {{app_name}}, {{user_name}}!",
      "bodyTemplate": "Hello {{user_name}}...",
      "variables": ["user_name", "app_name"],
      "defaultValues": { "app_name": "NotifyChain" },
      "isActive": true,
      "version": 1,
      "createdAt": "2026-06-19T10:00:00Z",
      "updatedAt": "2026-06-19T10:00:00Z"
    }
  ]
}
```

**Example**:
```bash
# Get all templates
curl http://localhost:3000/api/templates

# Get only EMAIL templates
curl http://localhost:3000/api/templates?channelType=EMAIL

# Get only active templates
curl http://localhost:3000/api/templates?activeOnly=true
```

---

### 3. Get Template by ID

**Endpoint**: `GET /api/templates/:id`

**Description**: Retrieve a specific template by its numeric ID.

**Response** (200 OK):
```json
{
  "id": 1,
  "uniqueKey": "welcome_email",
  "name": "Welcome Email",
  "channelType": "EMAIL",
  "bodyTemplate": "Hello {{user_name}}!",
  "variables": ["user_name"],
  "isActive": true
}
```

**Error Responses**:
- `400 Bad Request`: Invalid ID format
- `404 Not Found`: Template not found
- `500 Internal Server Error`: Server error

**Example**:
```bash
curl http://localhost:3000/api/templates/1
```

---

### 4. Get Template by Unique Key

**Endpoint**: `GET /api/templates/by-key/:uniqueKey`

**Description**: Retrieve a specific template by its unique key.

**Response** (200 OK):
```json
{
  "id": 1,
  "uniqueKey": "welcome_email",
  "name": "Welcome Email",
  "channelType": "EMAIL",
  "bodyTemplate": "Hello {{user_name}}!",
  "variables": ["user_name"]
}
```

**Error Responses**:
- `404 Not Found`: Template not found
- `500 Internal Server Error`: Server error

**Example**:
```bash
curl http://localhost:3000/api/templates/by-key/welcome_email
```

---

### 5. Update Template

**Endpoint**: `PUT /api/templates/:id`

**Description**: Update an existing template. All fields are optional; only provided fields will be updated. Template is re-validated on update.

**Request Body**:
```json
{
  "name": "Updated Welcome Email",
  "bodyTemplate": "Hi {{user_name}}, welcome aboard!",
  "isActive": true
}
```

**Response** (200 OK):
```json
{
  "id": 1,
  "message": "Template updated successfully"
}
```

**Error Responses**:
- `400 Bad Request`: Invalid ID or validation errors
- `404 Not Found`: Template not found
- `500 Internal Server Error`: Server error

**Example**:
```bash
curl -X PUT http://localhost:3000/api/templates/1 \
  -H "Content-Type: application/json" \
  -d '{"bodyTemplate": "Hi {{user_name}}, welcome!"}'
```

---

### 6. Delete Template

**Endpoint**: `DELETE /api/templates/:id`

**Description**: Delete or deactivate a template.

**Query Parameters**:
- `hard` (optional): Set to `true` to permanently delete. Default is soft delete (deactivation).

**Response** (200 OK):
```json
{
  "id": 1,
  "message": "Template deactivated"
}
```

**Error Responses**:
- `400 Bad Request`: Invalid ID format
- `404 Not Found`: Template not found
- `500 Internal Server Error`: Server error

**Example**:
```bash
# Soft delete (deactivate)
curl -X DELETE http://localhost:3000/api/templates/1

# Hard delete (permanent)
curl -X DELETE "http://localhost:3000/api/templates/1?hard=true"
```

---

### 7. Render Template

**Endpoint**: `POST /api/templates/render`

**Description**: Render a template with provided context data. Returns both subject and body with variables replaced.

**Request Body**:
```json
{
  "templateId": 1,
  "context": {
    "user_name": "John Doe",
    "app_name": "NotifyChain"
  }
}
```

**Alternative using unique key**:
```json
{
  "uniqueKey": "welcome_email",
  "context": {
    "user_name": "John Doe"
  }
}
```

**Response** (200 OK):
```json
{
  "subject": "Welcome to NotifyChain, John Doe!",
  "body": "Hello John Doe,\n\nWelcome to NotifyChain! Your account has been created successfully.\n\nBest regards,\nThe Team",
  "templateId": 1,
  "channelType": "EMAIL"
}
```

**Error Responses**:
- `400 Bad Request`: Missing required fields, missing required variables, or validation errors
- `404 Not Found`: Template not found
- `500 Internal Server Error`: Server error

**Example**:
```bash
curl -X POST http://localhost:3000/api/templates/render \
  -H "Content-Type: application/json" \
  -d '{
    "uniqueKey": "welcome_email",
    "context": {
      "user_name": "Alice Smith"
    }
  }'
```

---

### 8. Get Template Statistics

**Endpoint**: `GET /api/templates/stats`

**Description**: Get usage statistics for templates.

**Query Parameters**:
- `templateId` (optional): Get stats for a specific template

**Response** (200 OK):
```json
{
  "totalTemplates": 5,
  "activeTemplates": 4,
  "totalUsage": 1250,
  "channelBreakdown": {
    "EMAIL": 3,
    "SMS": 1,
    "DISCORD": 1
  },
  "recentUsage": [
    {
      "templateId": 1,
      "name": "Welcome Email",
      "usageCount": 450,
      "lastUsed": "2026-06-19T09:30:00Z",
      "avgRenderTime": 12
    }
  ]
}
```

**Example**:
```bash
# Get overall stats
curl http://localhost:3000/api/templates/stats

# Get stats for specific template
curl http://localhost:3000/api/templates/stats?templateId=1
```

---

## Template Syntax

### Basic Variable Substitution
```
Hello {{user_name}}!
```

### Nested Properties
```
Welcome {{user.first_name}} {{user.last_name}}!
```

### Missing Variables
- If a required variable is missing, rendering will fail with a 400 error
- If an optional variable is missing and has a default value, the default is used
- If an optional variable is missing without a default, it renders as empty string

### Special Characters
All variables are HTML-escaped by default to prevent XSS attacks:
- `<` becomes `&lt;`
- `>` becomes `&gt;`
- `&` becomes `&amp;`
- `"` becomes `&quot;`
- `'` becomes `&#x27;`

---

## Channel-Specific Validation

### EMAIL
- Must have `subjectTemplate`
- Subject max 200 characters
- Body max 50,000 characters
- No script tags allowed

### SMS
- No subject allowed
- Body max 1,600 characters
- Plain text only

### DISCORD
- Optional subject (becomes embed title)
- Body max 4,000 characters
- Subject max 256 characters

### PUSH
- Optional subject (notification title)
- Body max 1,000 characters
- Subject max 100 characters

### WEBHOOK
- No specific restrictions
- Body max 100,000 characters

---

## Security Features

### XSS Prevention
All rendered variables are HTML-escaped to prevent cross-site scripting attacks.

### Template Injection Prevention
Templates are validated to prevent:
- Script tag injection
- Prototype pollution attempts
- SQL injection patterns
- Command injection patterns

### Validation Rules
- Variable names must match `/^[a-zA-Z_][a-zA-Z0-9_\.]*$/`
- Unique keys must match `/^[a-zA-Z0-9_-]+$/`
- No unclosed brackets `{{variable`
- No malformed syntax

---

## Usage Examples

### Creating an Email Template
```javascript
const response = await fetch('http://localhost:3000/api/templates', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    uniqueKey: 'order_confirmation',
    name: 'Order Confirmation',
    channelType: 'EMAIL',
    subjectTemplate: 'Order #{{order_id}} Confirmed',
    bodyTemplate: `
      Dear {{customer_name}},
      
      Your order #{{order_id}} has been confirmed.
      Total: ${{order_total}}
      
      Thank you for your purchase!
    `,
    variables: ['customer_name', 'order_id', 'order_total']
  })
});
```

### Rendering a Template
```javascript
const response = await fetch('http://localhost:3000/api/templates/render', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    uniqueKey: 'order_confirmation',
    context: {
      customer_name: 'Jane Doe',
      order_id: '12345',
      order_total: '99.99'
    }
  })
});

const result = await response.json();
console.log(result.subject); // "Order #12345 Confirmed"
console.log(result.body);    // Full rendered body
```

---

## Setup and Migration

### 1. Run Database Migration
```bash
npm run migrate
```

This creates the `notification_templates` and `template_usage_log` tables.

### 2. Seed Sample Templates (Optional)
```bash
npm run migrate:templates
```

This creates sample templates for testing:
- `user_welcome` (EMAIL)
- `payment_success` (EMAIL)
- `discord_alert` (DISCORD)
- `sms_verification` (SMS)

### 3. Verify Installation
```bash
curl http://localhost:3000/api/templates
```

---

## Testing

Run the comprehensive test suite:
```bash
npm test -- template-system.test
```

Tests cover:
- Template CRUD operations
- Rendering with various contexts
- Validation (syntax, security, channel-specific)
- XSS prevention
- Missing variable handling
- Error cases

---

## Error Handling

All API endpoints return consistent error responses:

```json
{
  "error": "Descriptive error message"
}
```

Common error codes:
- `400`: Validation error, missing fields, invalid syntax
- `404`: Template not found
- `409`: Unique key conflict
- `500`: Internal server error

---

## Performance Considerations

- Templates are loaded from database on each render (consider adding caching for high-traffic scenarios)
- Usage logging is asynchronous and won't block render operations
- Indexes on `unique_key` and `channel_type` optimize common queries
- Render duration is tracked for performance monitoring

---

## Future Enhancements

Potential improvements:
- Template versioning with rollback
- A/B testing support
- Template preview functionality
- Rich text editor integration
- Template inheritance/composition
- Redis caching layer
- Bulk operations
- Template localization/i18n

---

## Support

For issues or questions:
1. Check the test suite for usage examples
2. Review validation error messages for specific guidance
3. Check logs for detailed error context
4. Consult the source code documentation
