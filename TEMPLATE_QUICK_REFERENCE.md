# Template System - Quick Reference Card

## 🚀 Quick Start (30 seconds)

```bash
# 1. Create template
curl -X POST http://localhost:3000/api/templates -H "Content-Type: application/json" -d '{"uniqueKey":"test","name":"Test","channelType":"EMAIL","bodyTemplate":"Hello {{name}}!"}'

# 2. Render template
curl -X POST http://localhost:3000/api/templates/render -H "Content-Type: application/json" -d '{"template":"test","context":{"name":"John"}}'
```

---

## 📋 API Endpoints Cheatsheet

| Method | Endpoint | Purpose |
|--------|----------|---------|
| `POST` | `/api/templates` | Create template |
| `GET` | `/api/templates` | List all templates |
| `GET` | `/api/templates/:id` | Get template by ID |
| `PUT` | `/api/templates/:id` | Update template |
| `DELETE` | `/api/templates/:id` | Delete (soft) |
| `DELETE` | `/api/templates/:id?hard=true` | Delete (permanent) |
| `POST` | `/api/templates/render` | Render template |
| `GET` | `/api/templates/stats` | Overview stats |
| `GET` | `/api/templates/:id/stats` | Template usage stats |

---

## 💬 Template Syntax

```
{{variable}}              Simple variable
{{user.name}}             Nested property
{{order.items.0.name}}    Array access
```

**Valid**: `{{user_name}}` `{{order_123}}` `{{_private}}`  
**Invalid**: `{{user-name}}` `{{user name}}` `{{}}` `{{__proto__}}`

---

## ✅ Validation Rules

| Rule | Example | Status |
|------|---------|--------|
| Brackets must match | `{{name!` | ❌ |
| No spaces in names | `{{user name}}` | ❌ |
| No hyphens | `{{user-name}}` | ❌ |
| No special chars | `{{user@email}}` | ❌ |
| No script tags | `<script>` | ❌ |
| No __proto__ | `{{__proto__}}` | ❌ |
| Alphanumeric + _ + . | `{{user_name}}` | ✅ |

---

## 🔒 Security Features

- ✅ HTML escaping (default)
- ✅ Script tag blocking
- ✅ XSS prevention
- ✅ Prototype pollution protection
- ✅ Variable name validation

---

## 📊 Channel Types

| Channel | Max Length | Subject? | Notes |
|---------|------------|----------|-------|
| `EMAIL` | 10,000 | Yes | Recommended |
| `SMS` | ⚠️ 160 | No | Warns >160 |
| `DISCORD` | **2,000** | Optional | Hard limit |
| `PUSH` | 200 | <50 chars | Recommended |
| `WEBHOOK` | 10,000 | Optional | Flexible |

---

## 🎯 TypeScript Quick Examples

### Create
```typescript
const result = await templateService.createTemplate({
  uniqueKey: 'welcome',
  name: 'Welcome',
  channelType: TemplateChannelType.EMAIL,
  bodyTemplate: 'Hello {{name}}!',
  variables: ['name']
});
```

### Render
```typescript
const result = await templateService.renderTemplate('welcome', {
  name: 'John'
});
console.log(result.rendered?.body); // "Hello John!"
```

### List
```typescript
const templates = await templateService.listTemplates({
  channelType: TemplateChannelType.EMAIL,
  isActive: true
});
```

---

## 🛠️ Common Patterns

### With Defaults
```typescript
{
  bodyTemplate: "Hello {{name}}!",
  defaultValues: { name: "Guest" }
}
// Context: {} → Output: "Hello Guest!"
```

### Nested Objects
```typescript
{
  bodyTemplate: "Order {{order.id}} for {{user.name}}",
  context: {
    order: { id: "12345" },
    user: { name: "John" }
  }
}
```

### Multiple Variables
```typescript
{
  subjectTemplate: "Order {{id}} Confirmed",
  bodyTemplate: "Hi {{name}}, total: ${{total}}",
  variables: ["id", "name", "total"]
}
```

---

## ⚡ Quick Troubleshooting

| Error | Cause | Fix |
|-------|-------|-----|
| "Mismatched brackets" | Unclosed `{{` | Check bracket pairs |
| "Invalid variable name" | Special chars | Use only a-z0-9_. |
| "Missing required variables" | Context incomplete | Provide all vars or defaults |
| "dangerous content" | Script tags | Remove `<script>` etc. |
| "already exists" | Duplicate uniqueKey | Use different key |
| "Template is inactive" | Soft deleted | Reactivate or use active template |

---

## 📝 Request/Response Examples

### Create Template
```json
// Request
{
  "uniqueKey": "order_confirm",
  "name": "Order Confirmation",
  "channelType": "EMAIL",
  "subjectTemplate": "Order {{id}}",
  "bodyTemplate": "Hi {{name}}, order {{id}} confirmed!",
  "variables": ["id", "name"]
}

// Response (201)
{
  "id": 1,
  "message": "Template created successfully",
  "validation": {
    "isValid": true,
    "errors": [],
    "detectedVariables": ["id", "name"]
  }
}
```

### Render Template
```json
// Request
{
  "template": "order_confirm",
  "context": {
    "id": "12345",
    "name": "John Doe"
  }
}

// Response (200)
{
  "rendered": {
    "subject": "Order 12345",
    "body": "Hi John Doe, order 12345 confirmed!"
  }
}
```

### Error Response
```json
// Response (400)
{
  "error": "Template validation failed",
  "validation": {
    "isValid": false,
    "errors": [
      "Mismatched brackets: 1 opening '{{' but 0 closing '}}'",
      "Variable name contains spaces: 'user name'"
    ]
  }
}
```

---

## 🧪 Testing Commands

```bash
# Run all tests
npm test -- template-system.test.ts

# Run API tests
npm test -- template-api-integration.test.ts

# Run specific test
npm test -- -t "should render simple variable"
```

---

## 📚 Full Documentation

- **Complete Guide**: TEMPLATE_SYSTEM_GUIDE.md (500+ lines)
- **Implementation Summary**: TEMPLATE_SYSTEM_SUMMARY.md
- **Code**: `listener/src/services/template-*.ts`
- **Tests**: `listener/src/tests/template-*.test.ts`

---

## 🎓 Best Practices (One-Liners)

✅ Use snake_case for uniqueKey  
✅ Document variables in description  
✅ Set defaults for optional vars  
✅ Test with real data first  
✅ Soft delete instead of hard  
❌ Don't store secrets in templates  
❌ Don't skip validation  
❌ Don't bypass HTML escaping  

---

**Quick Help**: `TEMPLATE_SYSTEM_GUIDE.md` | **Status**: ✅ Production Ready
