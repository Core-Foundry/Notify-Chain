# Template Preview System

## Overview

Comprehensive live preview system for notification templates that allows users to see exactly how their messages will appear before sending them. Supports real-time variable interpolation, missing variable detection, and channel-specific formatting.

## Problem Solved

Users configuring notification templates need to understand how messages will render before using them in production.

- ✅ **Preview updates in real-time** - Changes appear instantly
- ✅ **Supported variables render correctly** - {{variable}} syntax interpolation
- ✅ **Missing variables identified** - Clear warnings with variable names
- ✅ **No actual notifications sent** - Pure UI, no side effects

## Architecture

### Components

1. **TemplatePreview** - Core preview component
2. **TemplatePreviewWithVariables** - Preview with editable variables

### Utilities

- **templateUtils.ts** - Template processing and variable handling

### Styling

- **template-preview.css** - Comprehensive styling with dark mode support

## Implementation

### Basic Usage

```typescript
import { TemplatePreview } from './components/TemplatePreview';

export function TemplatesPage() {
  return (
    <TemplatePreview
      body="Hello {{name}}, welcome to {{platform}}!"
      subject="Welcome {{name}}"
      channelType="EMAIL"
      variables={{
        name: 'John Doe',
        platform: 'Notify-Chain',
      }}
    />
  );
}
```

### With Missing Variables

```typescript
<TemplatePreview
  body="Hello {{name}}, your balance is {{balance}}"
  channelType="EMAIL"
  variables={{
    name: 'John',
    // balance is missing!
  }}
  onVariablesDetected={(vars) => {
    console.log('Detected variables:', vars);
  }}
/>
```

### With Unsupported Variables

```typescript
<TemplatePreview
  body="User: {{username}}, Status: {{status}}"
  channelType="EMAIL"
  variables={{
    username: 'john_doe',
    status: 'active',
  }}
  supportedVariables={['username', 'email']}
  // 'status' will be flagged as unsupported
/>
```

### With Editable Variables

```typescript
function TemplateEditor() {
  const [variables, setVariables] = useState({
    name: 'John',
    email: 'john@example.com',
  });

  return (
    <TemplatePreviewWithVariables
      body="Name: {{name}}, Email: {{email}}"
      channelType="EMAIL"
      editableVariables={variables}
      onVariableChange={setVariables}
    />
  );
}
```

## Features

### Real-Time Updates

Changes to template body or variables are reflected instantly:

```typescript
const [body, setBody] = useState('Hello {{name}}');
const [variables, setVariables] = useState({ name: 'John' });

// Preview updates whenever body or variables change
<TemplatePreview
  body={body}
  variables={variables}
  channelType="EMAIL"
/>
```

### Variable Detection

Automatically detects all variables in template:

```typescript
<TemplatePreview
  body="From: {{from}}, To: {{to}}, Amount: {{amount}}"
  channelType="EMAIL"
  variables={{}}
  onVariablesDetected={(variables) => {
    console.log(variables); // ['from', 'to', 'amount']
  }}
/>
```

### Missing Variable Warnings

Clear identification of missing variables:

```
⚠ Missing variables:
  name, platform
```

### Unsupported Variable Warnings

Flag variables not in the supported list:

```
❌ Unsupported variables:
  status
```

### Channel-Specific Formatting

Different formats for different notification channels:

```typescript
// Email with subject and body
<TemplatePreview
  subject="Welcome {{name}}"
  body="Hello {{name}}..."
  channelType="EMAIL"
  variables={{}}
/>

// SMS (usually just body, compact)
<TemplatePreview
  body="Hi {{name}}, your code is {{code}}"
  channelType="SMS"
  variables={{}}
/>

// Discord with formatting
<TemplatePreview
  body="**Event:** {{event}}\n**User:** {{user}}"
  channelType="DISCORD"
  variables={{}}
/>
```

## API Reference

### TemplatePreview Props

```typescript
interface TemplatePreviewProps {
  // Template body content with {{variable}} syntax
  body: string;

  // Optional template subject (for email channels)
  subject?: string;

  // Notification channel type
  channelType: TemplateChannelType;

  // Sample variables for preview
  variables?: Record<string, any>;

  // Available/supported variable names
  supportedVariables?: string[];

  // Callback when variables are detected
  onVariablesDetected?: (variables: string[]) => void;

  // Callback when unsupported variables are found
  onUnsupportedVariables?: (variables: string[]) => void;

  // Custom fallback value for missing variables
  missingVariableIndicator?: string;
}
```

### TemplatePreviewWithVariables Props

Extends TemplatePreviewProps with:

```typescript
interface TemplatePreviewWithVariablesProps extends TemplatePreviewProps {
  // Callback when variable values change
  onVariableChange?: (variables: Record<string, any>) => void;

  // Sample variables that can be edited
  editableVariables?: Record<string, any>;
}
```

### Template Utilities

```typescript
// Detect variables in template
detectVariables(template: string): string[]

// Check if variable name is valid
isValidVariableName(name: string): boolean

// Get nested value from object
getNestedValue(obj: any, path: string): any

// Render template with variables
renderTemplate(
  template: string,
  variables?: Record<string, any>,
  options?: RenderOptions
): string

// Validate template
validateTemplate(
  template: string,
  providedVariables?: Record<string, any>,
  supportedVariables?: string[]
): ValidationResult

// Generate sample variables
generateSampleVariables(requestedVariables: string[]): Record<string, any>

// Get all available sample variables
getAvailableSampleVariables(): string[]

// Format variable name for display
formatVariableName(variable: string): string

// Check if all variables are provided
areAllVariablesProvided(
  template: string,
  variables: Record<string, any>
): boolean
```

## Variable Syntax

### Simple Variables

```
Hello {{name}}, welcome to {{platform}}!
```

### Nested Properties

```
User: {{user.name}}, Email: {{user.email}}
From: {{transaction.sender}}, To: {{transaction.receiver}}
```

### Unsupported Patterns

- `{{123invalid}}` - Must start with letter or underscore
- `{{name-with-dash}}` - No dashes allowed
- `{{ }}` - Empty variables
- `{{{triple}}}` - Triple braces

## Sample Variables

Built-in sample data for common scenarios:

```typescript
event: {
  eventId: 'evt_12345',
  eventName: 'Transfer',
  timestamp: '2024-01-15T10:30:00Z',
  contractAddress: 'CAAAA...',
  type: 'TransferEvent',
}

notification: {
  notificationId: 'notif_67890',
  createdAt: '2024-01-15T10:30:00Z',
  status: 'PENDING',
  retryCount: 0,
}

user: {
  userId: 'user_123',
  email: 'user@example.com',
  name: 'John Doe',
}

transaction: {
  txHash: 'abc123def456',
  amount: '1000.00',
  from: 'GAAA...',
  to: 'GBBB...',
}

error: {
  message: 'Connection timeout',
  code: 'TIMEOUT',
  retryable: true,
}
```

## Real-World Examples

### Example 1: Email Template

```typescript
function EmailTemplateEditor() {
  const [body, setBody] = useState('');
  const [subject, setSubject] = useState('');

  return (
    <>
      <textarea
        value={subject}
        onChange={(e) => setSubject(e.target.value)}
        placeholder="Email subject with {{variables}}"
      />
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder="Email body with {{variables}}"
      />

      <TemplatePreview
        subject={subject}
        body={body}
        channelType="EMAIL"
        variables={{
          user_name: 'John Doe',
          transaction_amount: '1000 USDC',
          transaction_date: '2024-01-15',
        }}
      />
    </>
  );
}
```

### Example 2: SMS Template with Limited Space

```typescript
function SmsTemplateEditor() {
  const [body, setBody] = useState('');

  return (
    <>
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        maxLength={160}
        placeholder="SMS (max 160 chars)"
      />

      <div>
        Characters: {body.length}/160
      </div>

      <TemplatePreview
        body={body}
        channelType="SMS"
        variables={{
          code: '123456',
          expiry_minutes: '10',
        }}
        onVariablesDetected={(vars) => {
          console.log(`SMS uses ${vars.length} variables`);
        }}
      />
    </>
  );
}
```

### Example 3: Discord Template with Formatting

```typescript
function DiscordTemplateEditor() {
  const [body, setBody] = useState('');

  return (
    <>
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder="Discord message (supports markdown)"
      />

      <TemplatePreview
        body={body}
        channelType="DISCORD"
        supportedVariables={[
          'event.eventName',
          'event.timestamp',
          'transaction.amount',
          'user.name',
        ]}
        variables={{
          'event.eventName': 'Transfer',
          'event.timestamp': '2024-01-15T10:30:00Z',
          'transaction.amount': '1000 USDC',
          'user.name': 'John Doe',
        }}
      />
    </>
  );
}
```

### Example 4: Template with Validation

```typescript
function TemplateFormWithValidation() {
  const [body, setBody] = useState('');
  const [errors, setErrors] = useState<string[]>([]);
  const requiredVariables = ['user_name', 'event_type'];

  const handleBodyChange = (value: string) => {
    setBody(value);

    const validation = validateTemplate(value, {}, requiredVariables);
    setErrors(validation.errors);
  };

  return (
    <>
      <textarea
        value={body}
        onChange={(e) => handleBodyChange(e.target.value)}
      />

      {errors.length > 0 && (
        <div className="errors">
          {errors.map((err) => <p key={err}>{err}</p>)}
        </div>
      )}

      <TemplatePreview
        body={body}
        channelType="EMAIL"
        supportedVariables={requiredVariables}
        variables={{}}
      />
    </>
  );
}
```

## Testing

### Component Tests

```typescript
it('should render template with variables', () => {
  render(
    <TemplatePreview
      body="Hello {{name}}"
      channelType="EMAIL"
      variables={{ name: 'John' }}
    />
  );

  expect(screen.getByTestId('preview-body')).toHaveTextContent('Hello John');
});
```

### Utility Tests

```typescript
it('should detect variables in template', () => {
  const variables = detectVariables('Hello {{name}}, welcome to {{platform}}');

  expect(variables).toEqual(['name', 'platform']);
});

it('should validate template', () => {
  const result = validateTemplate(
    'Hello {{name}}',
    { name: 'John' }
  );

  expect(result.isValid).toBe(true);
});
```

## Best Practices

### ✅ Do's

1. **Show real-time updates** - Preview changes instantly
2. **List all variables** - Display detected variables clearly
3. **Warn about missing variables** - Help users find gaps
4. **Use representative data** - Sample values should be realistic
5. **Test thoroughly** - Use preview during template creation

### ❌ Don'ts

1. **Don't send actual notifications** - Preview is display-only
2. **Don't hide validation issues** - Surface all problems
3. **Don't assume variables exist** - Always check availability
4. **Don't support unsafe syntax** - Prevent injection attacks
5. **Don't make preview too complex** - Keep UI simple

## Performance Considerations

- **Zero overhead** when no variables present
- **Efficient detection** using regex caching
- **Memoized updates** prevent unnecessary re-renders
- **Lazy rendering** of error messages
- **No network calls** - pure client-side processing

## Browser Support

- Chrome/Edge (all modern versions)
- Firefox (all modern versions)
- Safari (all modern versions)
- Mobile browsers (iOS Safari, Chrome Mobile)

## Accessibility

- ✅ Semantic HTML structure
- ✅ ARIA labels for icons
- ✅ High contrast colors
- ✅ Keyboard accessible
- ✅ Screen reader friendly
- ✅ Dark mode support

## Future Enhancements

- [ ] Template syntax suggestions
- [ ] Variable auto-complete
- [ ] Template snippets library
- [ ] Preview history/comparison
- [ ] A/B testing support
- [ ] Analytics on template performance
- [ ] Custom variable categories
- [ ] Template branching logic
