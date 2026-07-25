# Template Preview Feature - Quick Setup Guide

## Overview

This document provides quick setup instructions for the Notification Template Preview feature.

## What's New

### New Files Created

```
dashboard/src/
├── components/
│   ├── Modal.tsx                      # Reusable modal component (NEW)
│   └── TemplatePreviewModal.tsx       # Template preview component (NEW)
├── pages/
│   └── TemplatePreviewDemoPage.tsx    # Demo page (NEW)
├── types/
│   └── template.ts                    # Template types (NEW)
└── utils/
    └── templateRenderer.ts            # Template utilities (NEW)
```

### Modified Files

```
dashboard/src/
├── App.tsx                            # Added navigation and route
└── index.css                          # Added styles for modal and preview
```

### Documentation

```
TEMPLATE_PREVIEW_FEATURE.md            # Comprehensive feature documentation
FEATURE_SETUP.md                       # This file
```

## Installation

### 1. Dependencies

No new dependencies required! The feature uses only existing packages:
- React 19.1.0
- TypeScript 5.8.3
- Zustand 5.0.6 (for future state management)

### 2. Running the Application

```bash
# Navigate to dashboard directory
cd dashboard

# Install dependencies (if not already installed)
npm install

# Start development server
npm run dev

# The app will open at http://localhost:5173
```

### 3. View the Feature

1. Open your browser to `http://localhost:5173`
2. Click on the "Template Preview" tab in the navigation
3. Click on any template card to open the preview modal
4. Edit variable values and see real-time updates

## Usage Examples

### Example 1: Preview a Discord Template

```tsx
import { TemplatePreviewModal } from './components/TemplatePreviewModal';
import type { NotificationTemplate } from './types/template';

const discordTemplate: NotificationTemplate = {
  id: 'tmpl_discord_001',
  name: 'Welcome Message',
  type: 'discord',
  body: JSON.stringify({
    content: 'Welcome {{name}} to NotifyChain!',
    embeds: [{
      title: 'Getting Started',
      description: 'Check out our {{guide}} to learn more.',
      color: 5814783
    }]
  }),
  variables: ['name', 'guide'],
  createdAt: new Date(),
  updatedAt: new Date(),
};

function MyComponent() {
  return (
    <TemplatePreviewModal
      isOpen={true}
      onClose={() => console.log('closed')}
      template={discordTemplate}
    />
  );
}
```

### Example 2: Preview an Email Template

```tsx
const emailTemplate: NotificationTemplate = {
  id: 'tmpl_email_001',
  name: 'Password Reset',
  type: 'email',
  subject: 'Reset your password',
  body: JSON.stringify({
    subject: 'Reset your password',
    body: 'Hi {{name}},\n\nClick here to reset your password: {{resetLink}}',
    html: '<p>Hi {{name}},</p><p>Click <a href="{{resetLink}}">here</a> to reset your password.</p>'
  }),
  variables: ['name', 'resetLink'],
  createdAt: new Date(),
  updatedAt: new Date(),
};
```

### Example 3: Using the Template Renderer

```tsx
import {
  renderTemplatePayload,
  extractVariables,
  getSampleVariableValues,
  validateVariables
} from './utils/templateRenderer';

// Extract variables from template
const variables = extractVariables(template.body);
// Result: ['name', 'taskId', 'amount']

// Get sample values
const samples = getSampleVariableValues(template);
// Result: { name: 'John Doe', taskId: '42', amount: '100' }

// Render with variables
const payload = renderTemplatePayload(template, {
  name: 'Alice',
  taskId: '123',
  amount: '50'
});

// Validate variables
const validation = validateVariables(template, { name: 'Alice' });
// Result: { valid: false, missingVariables: ['taskId', 'amount'] }
```

## Integration with Backend

### Fetching Templates from API

```tsx
import type { NotificationTemplate } from './types/template';

async function fetchTemplate(templateId: string): Promise<NotificationTemplate> {
  const response = await fetch(`http://localhost:8787/api/templates/${templateId}`);
  const data = await response.json();
  
  // Convert API response to NotificationTemplate
  return {
    id: data.id,
    name: data.name,
    type: data.type,
    subject: data.subject,
    body: data.body,
    variables: data.variables ? JSON.parse(data.variables) : [],
    metadata: data.metadata ? JSON.parse(data.metadata) : {},
    createdAt: new Date(data.created_at),
    updatedAt: new Date(data.updated_at),
  };
}

// Usage
const template = await fetchTemplate('tmpl_001');
```

### Creating a Template via API

```tsx
async function createTemplate(template: Omit<NotificationTemplate, 'createdAt' | 'updatedAt'>) {
  const response = await fetch('http://localhost:8787/api/templates', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      id: template.id,
      name: template.name,
      type: template.type,
      subject: template.subject,
      body: template.body,
      variables: template.variables,
      metadata: template.metadata,
    }),
  });
  
  return response.json();
}
```

## Customization

### Changing Colors

Edit `dashboard/src/index.css`:

```css
/* Change primary color */
.button--primary {
  background: #your-color;
}

/* Change notification type colors */
.template-card__badge--discord {
  background: #your-discord-color;
}
```

### Adding New Notification Types

1. Add type to enum in `types/template.ts`:
```tsx
export enum NotificationType {
  DISCORD = 'discord',
  EMAIL = 'email',
  WEBHOOK = 'webhook',
  SMS = 'sms',
  SLACK = 'slack', // NEW
}
```

2. Add preview component in `components/TemplatePreviewModal.tsx`:
```tsx
function SlackPreview({ payload }: { payload: SlackPayload }) {
  return (
    <div className="preview-slack">
      {/* Your preview UI */}
    </div>
  );
}
```

3. Add to preview renderer:
```tsx
{template.type === 'slack' && renderedPayload && (
  <SlackPreview payload={renderedPayload as SlackPayload} />
)}
```

### Customizing Sample Values

Edit `utils/templateRenderer.ts`:

```tsx
export function getSampleVariableValues(template: NotificationTemplate): TemplateVariableValues {
  const variables = template.variables || extractVariables(template.body);
  const sampleValues: TemplateVariableValues = {};
  
  for (const varName of variables) {
    switch (varName.toLowerCase()) {
      case 'customvar':
        sampleValues[varName] = 'Your Custom Value';
        break;
      // ... add more cases
    }
  }
  
  return sampleValues;
}
```

## Testing

### Running Tests

```bash
cd dashboard
npm test
```

### Manual Testing Checklist

```
Template Preview Modal:
[ ] Opens when clicking a template card
[ ] Closes when clicking X button
[ ] Closes when clicking backdrop
[ ] Closes when pressing ESC key

Variable Editing:
[ ] Variables are pre-filled with samples
[ ] Editing updates preview in real-time
[ ] Missing variables show validation error
[ ] Reset button restores sample values

Notification Previews:
[ ] Discord preview shows embeds correctly
[ ] Email preview shows headers and body
[ ] SMS preview shows character count
[ ] Webhook preview shows JSON payload

Responsive Design:
[ ] Works on desktop (>768px)
[ ] Works on tablet (480-768px)
[ ] Works on mobile (<480px)
[ ] Modal scrolls on small screens

Accessibility:
[ ] Can navigate with Tab key
[ ] Can close with ESC key
[ ] Focus is trapped in modal
[ ] Screen reader announces content
```

## Troubleshooting

### Issue: Modal doesn't open
**Solution**: Check that `isOpen` prop is set to `true` and template is not null.

### Issue: Variables not substituting
**Solution**: Ensure variables use double curly braces `{{varName}}` and are listed in `template.variables`.

### Issue: Styles not applying
**Solution**: Verify `index.css` is imported in `main.tsx` and build cache is cleared.

### Issue: TypeScript errors
**Solution**: Run `npm run build` to check for type errors. Ensure all types are imported correctly.

### Issue: Preview not responsive
**Solution**: Check browser dev tools, verify CSS media queries are loading, test on actual devices.

## Performance Tips

1. **Memoization**: Components use `useMemo` for expensive calculations
2. **Lazy Loading**: Load templates on-demand rather than all at once
3. **Debouncing**: Consider debouncing variable input for very large templates
4. **Virtual Scrolling**: For template lists with 100+ items

## Security Considerations

⚠️ **Important**: 
- The Email preview uses `dangerouslySetInnerHTML` for HTML emails
- Always sanitize HTML content from user input
- Validate variable values before substitution
- Never expose sensitive data in template previews

## Next Steps

1. **Add More Templates**: Create templates for your use cases
2. **Connect to Backend**: Integrate with your template API
3. **Add Tests**: Write unit tests for components and utilities
4. **Customize Styles**: Match your brand colors and design
5. **Add Features**: Implement template editing, scheduling, etc.

## Resources

- [Full Feature Documentation](./TEMPLATE_PREVIEW_FEATURE.md)
- [Notification Payload Schema](./NOTIFICATION_PAYLOAD_SCHEMA.md)
- [React Documentation](https://react.dev)
- [TypeScript Documentation](https://www.typescriptlang.org/docs)

## Support

For issues or questions:
1. Check the [TEMPLATE_PREVIEW_FEATURE.md](./TEMPLATE_PREVIEW_FEATURE.md) documentation
2. Review the [TROUBLESHOOTING.md](./TROUBLESHOOTING.md) guide
3. Open an issue on GitHub
4. Contact the development team

---

**Feature developed for NotifyChain v1.0**
