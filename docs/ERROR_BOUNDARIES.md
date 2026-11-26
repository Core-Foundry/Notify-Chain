# Error Boundaries - Dashboard Error Handling

## Overview

Comprehensive error boundary system for the Notify-Chain dashboard that prevents rendering errors in one section from crashing the entire application.

## Problem Solved

- ✅ **Error isolation**: An error in one route doesn't crash unrelated routes
- ✅ **Meaningful fallback**: Users see helpful UI instead of blank page
- ✅ **Recovery actions**: Multiple ways to recover (retry, report, navigate)
- ✅ **Data privacy**: Sensitive application state is never exposed

## Architecture

### Components

1. **EnhancedErrorBoundary** - React class component that catches render errors
2. **ErrorBoundary** - Original basic error boundary (still available)
3. **useErrorHandler** - Hook for async error handling

### Utilities

- **error-utils.ts** - Error categorization, sanitization, and diagnostics
- **error-boundary.css** - Comprehensive styling with dark mode support

## Implementation

### Basic Usage

```typescript
import { EnhancedErrorBoundary } from './components/EnhancedErrorBoundary';

export function App() {
  return (
    <EnhancedErrorBoundary section="Event Explorer">
      <EventExplorerPage />
    </EnhancedErrorBoundary>
  );
}
```

### With Custom Recovery Actions

```typescript
<EnhancedErrorBoundary
  section="Webhook Dashboard"
  recoveryActions={[
    {
      label: 'Reset filters',
      action: () => store.resetFilters(),
      icon: '🔄',
    },
    {
      label: 'Go to home',
      action: () => navigate('/'),
      icon: '🏠',
    },
  ]}
>
  <WebhookDashboardPage />
</EnhancedErrorBoundary>
```

### Error Reporting

```typescript
<EnhancedErrorBoundary
  section="Event Timeline"
  onError={(error, info, severity) => {
    // Send to error tracking service
    reportToSentry(error, {
      context: info.componentStack,
      severity,
    });
  }}
  enableReporting={true}
>
  <NotificationTimelineView />
</EnhancedErrorBoundary>
```

### With Reset Keys

Reset error state when dependencies change (e.g., user, route):

```typescript
<EnhancedErrorBoundary
  section="User Activity"
  resetKeys={[userId, contractAddress]}
>
  <UserActivityTimeline />
</EnhancedErrorBoundary>
```

## Error Categorization

Errors are automatically categorized by severity:

- **CRITICAL** - Out of memory, stack overflow (non-recoverable)
- **HIGH** - Render errors, lifecycle errors, type errors
- **MEDIUM** - Network timeouts, API failures
- **LOW** - Validation errors, missing data
- **ERROR** - Unknown errors (default)

## Data Privacy

### What's Never Exposed

- API keys or tokens
- User credentials
- Personal information
- Full stack traces (limited to development)
- Sensitive error context

### What's Safe to Show Users

- Error category (network, render, validation)
- Friendly error message
- Suggested recovery actions
- Error ID for support reference
- Reassurance that other parts work

## Features

### Recovery Actions

Built-in recovery options:

1. **Try again** - Retry rendering the component
2. **Report** - Send anonymized error report
3. **Custom actions** - App-specific recovery (navigate, reset filters, etc.)

### Error Details

**Development Mode:**
- Full error name and message
- Component stack trace
- Error ID
- Debug information

**Production Mode:**
- Sanitized error information only
- Error ID for support
- Recovery buttons only

### Accessibility

- Proper ARIA roles (`role="alert"`, `aria-live="assertive"`)
- Semantic heading structure
- Keyboard navigable buttons
- Screen reader friendly
- High contrast colors
- Respects `prefers-reduced-motion`

## API Reference

### EnhancedErrorBoundary Props

```typescript
interface EnhancedErrorBoundaryProps {
  children: ReactNode;
  
  // Display name for error messages
  section?: string;
  
  // Custom fallback UI
  fallback?: ReactNode;
  
  // Error callback for external reporting
  onError?: (error: Error, info: ErrorInfo, severity: ErrorSeverity) => void;
  
  // Dependencies to reset boundary when changed
  resetKeys?: (string | number | boolean)[];
  
  // Enable error reporting
  enableReporting?: boolean;
  
  // Custom recovery actions
  recoveryActions?: RecoveryAction[];
  
  // Suppress console logging (for testing)
  suppressLogging?: boolean;
}
```

### useErrorHandler Hook

```typescript
const handleError = useErrorHandler();

try {
  await fetchData();
} catch (error) {
  handleError(error); // Re-throws into error boundary
}
```

### Error Utilities

```typescript
import {
  categorizeError,        // Severity categorization
  detectErrorCategory,    // Error type detection
  getErrorMessage,        // Safe message extraction
  sanitizeError,          // Remove sensitive data
  stripSensitiveData,     // String sanitization
  isRecoverable,          // Recoverable check
  getSuggestedActions,    // Action suggestions
  getDiagnostics,         // Complete diagnostics
} from './utils/error-utils';
```

## Real-World Examples

### Example 1: Event Explorer Error

```typescript
export function App() {
  return (
    <EnhancedErrorBoundary section="Event Explorer">
      <EventExplorerPage />
    </EnhancedErrorBoundary>
  );
}
```

**What happens if EventExplorerPage throws:**
- User sees "Event Explorer encountered an issue"
- Other tabs (Timeline, Activity, etc.) still work
- Can click "Try again" to retry
- Can click "Report" to send diagnostic info
- Error ID generated for support

### Example 2: Multiple Isolated Sections

```typescript
<main>
  <EnhancedErrorBoundary section="Dashboard Stats">
    <DashboardStats />
  </EnhancedErrorBoundary>
  
  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr' }}>
    <EnhancedErrorBoundary section="Recent Events">
      <RecentEvents />
    </EnhancedErrorBoundary>
    
    <EnhancedErrorBoundary section="Delivery Stats">
      <DeliveryStats />
    </EnhancedErrorBoundary>
  </div>
</main>
```

**Benefits:**
- Error in one widget doesn't crash others
- User sees exactly which component failed
- Can interact with unaffected sections
- Can retry individual sections

### Example 3: Error Tracking Integration

```typescript
import * as Sentry from '@sentry/react';

<EnhancedErrorBoundary
  section="Contract Details"
  onError={(error, info, severity) => {
    Sentry.captureException(error, {
      contexts: {
        react: {
          componentStack: info.componentStack,
          severity,
        },
      },
      level: severity === 'critical' ? 'fatal' : 'error',
    });
  }}
>
  <ContractDetailPage />
</EnhancedErrorBoundary>
```

### Example 4: Context-Aware Recovery

```typescript
import { useEventStore } from './store/eventStore';

function EventsPanel() {
  const resetFilters = useEventStore(s => s.resetFilters);
  
  return (
    <EnhancedErrorBoundary
      section="Event Filtering"
      recoveryActions={[
        {
          label: 'Clear filters',
          action: resetFilters,
          icon: '🔄',
        },
        {
          label: 'Load defaults',
          action: () => useEventStore.setState(initialState),
          icon: '⚙️',
        },
      ]}
    >
      <EventFilters />
    </EnhancedErrorBoundary>
  );
}
```

## Testing

### Basic Error Catching

```typescript
it('should catch render errors', () => {
  const { getByText } = render(
    <EnhancedErrorBoundary section="Test">
      <ThrowingComponent />
    </EnhancedErrorBoundary>
  );
  
  expect(getByText(/Test encountered an issue/i)).toBeInTheDocument();
});
```

### Error Isolation

```typescript
it('should not affect sibling error boundaries', () => {
  const { getByText } = render(
    <div>
      <EnhancedErrorBoundary>
        <ThrowingComponent />
      </EnhancedErrorBoundary>
      <EnhancedErrorBoundary>
        <SafeComponent />
      </EnhancedErrorBoundary>
    </div>
  );
  
  expect(getByText('Safe content')).toBeInTheDocument();
});
```

### Recovery Actions

```typescript
it('should reset on retry', () => {
  const { getByText, rerender } = render(
    <EnhancedErrorBoundary>
      <SafeComponent />
    </EnhancedErrorBoundary>
  );
  
  rerender(
    <EnhancedErrorBoundary>
      <ThrowingComponent />
    </EnhancedErrorBoundary>
  );
  
  fireEvent.click(getByText('Try again'));
  // State reset, ready to retry
});
```

## Best Practices

### ✅ Do's

1. **Wrap major sections** - Put boundaries around dashboard routes
2. **Use descriptive section names** - Help users understand what failed
3. **Provide recovery actions** - Don't just show errors
4. **Log for debugging** - Use onError for external reporting
5. **Test error scenarios** - Ensure graceful fallbacks work
6. **Use resetKeys** - Reset when user/route changes

### ❌ Don'ts

1. **Don't wrap everything** - Over-wrapping creates redundancy
2. **Don't expose sensitive data** - Use sanitization utilities
3. **Don't swallow errors silently** - Always log appropriately
4. **Don't make fallback too complex** - Keep it simple and fast
5. **Don't block recovery** - Always provide a way forward

## Migration from Basic ErrorBoundary

Old (still works):
```typescript
<ErrorBoundary section="Events">
  <EventsPage />
</ErrorBoundary>
```

New (recommended):
```typescript
<EnhancedErrorBoundary
  section="Events"
  onError={(err, info, severity) => {
    // External reporting
  }}
>
  <EventsPage />
</EnhancedErrorBoundary>
```

## Performance Considerations

- **Zero overhead** when no errors occur
- **Minimal memory** for error state tracking
- **Rate-limited logging** prevents spam
- **Lazy rendering** of debug details
- **CSS optimizations** with dark mode support

## Troubleshooting

### Error boundary not catching errors

**Problem**: Async errors aren't caught
**Solution**: Use `useErrorHandler` hook or wrap in try-catch

```typescript
const handleError = useErrorHandler();
try {
  await fetchData();
} catch (error) {
  handleError(error);
}
```

### Error details not showing

**Problem**: In production, details are hidden
**Solution**: Check browser console or error tracking service

### Recovery action not working

**Problem**: Button click doesn't recover
**Solution**: Ensure component can re-render successfully

## Future Enhancements

- [ ] Error replay functionality
- [ ] Automatic error recovery strategies
- [ ] Machine learning based error categorization
- [ ] Proactive error prevention
- [ ] Error trend analysis dashboard
- [ ] A/B testing different recovery strategies

## Browser Support

- Chrome/Edge (all modern versions)
- Firefox (all modern versions)
- Safari (all modern versions)
- Mobile browsers (iOS Safari, Chrome Mobile)

## References

- [React Error Boundaries Documentation](https://react.dev/reference/react/Component#catching-rendering-errors-with-an-error-boundary)
- [Web Accessibility Guidelines](https://www.w3.org/WAI/WCAG21/quickref/)
- [Error Tracking Best Practices](https://sentry.io/guide/)
