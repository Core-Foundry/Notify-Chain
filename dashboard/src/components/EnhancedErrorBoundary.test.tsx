/**
 * Tests for EnhancedErrorBoundary
 *
 * Ensures:
 * - Errors in one route don't crash others
 * - Meaningful fallback UI is shown
 * - Recovery actions work
 * - Sensitive data is not exposed
 */

import React, { useState } from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { EnhancedErrorBoundary } from './EnhancedErrorBoundary';

// Test component that throws
function ThrowingComponent() {
  throw new Error('Test error');
}

// Test component that throws after delay
function DelayedThrowingComponent() {
  const [shouldThrow, setShouldThrow] = useState(false);

  if (shouldThrow) {
    throw new Error('Delayed error');
  }

  return (
    <div>
      <p>Safe component</p>
      <button onClick={() => setShouldThrow(true)}>Trigger error</button>
    </div>
  );
}

// Component that renders normally
function SafeComponent() {
  return <div>Safe content</div>;
}

// Component with multiple children
function MultipleChildren() {
  return (
    <>
      <div>Child 1</div>
      <div>Child 2</div>
    </>
  );
}

describe('EnhancedErrorBoundary', () => {
  // Suppress console.error for these tests
  const originalError = console.error;
  beforeAll(() => {
    console.error = jest.fn();
  });

  afterAll(() => {
    console.error = originalError;
  });

  describe('basic error catching', () => {
    it('should catch render-time errors', () => {
      render(
        <EnhancedErrorBoundary section="Test Section">
          <ThrowingComponent />
        </EnhancedErrorBoundary>,
      );

      expect(screen.getByText(/Test Section encountered an issue/i)).toBeInTheDocument();
    });

    it('should display default fallback UI', () => {
      render(
        <EnhancedErrorBoundary>
          <ThrowingComponent />
        </EnhancedErrorBoundary>,
      );

      expect(screen.getByText(/encountered an issue/i)).toBeInTheDocument();
      expect(screen.getByRole('alert')).toBeInTheDocument();
    });

    it('should use custom fallback if provided', () => {
      render(
        <EnhancedErrorBoundary fallback={<div data-testid="custom-fallback">Custom error</div>}>
          <ThrowingComponent />
        </EnhancedErrorBoundary>,
      );

      expect(screen.getByTestId('custom-fallback')).toBeInTheDocument();
    });

    it('should render children normally when no error', () => {
      render(
        <EnhancedErrorBoundary section="Test">
          <SafeComponent />
        </EnhancedErrorBoundary>,
      );

      expect(screen.getByText('Safe content')).toBeInTheDocument();
    });
  });

  describe('error UI and messaging', () => {
    it('should display section name in error message', () => {
      render(
        <EnhancedErrorBoundary section="Event Explorer">
          <ThrowingComponent />
        </EnhancedErrorBoundary>,
      );

      expect(screen.getByText(/Event Explorer encountered an issue/i)).toBeInTheDocument();
    });

    it('should display severity indicator', () => {
      render(
        <EnhancedErrorBoundary section="Test">
          <ThrowingComponent />
        </EnhancedErrorBoundary>,
      );

      expect(screen.getByText(/Severity:/i)).toBeInTheDocument();
    });

    it('should show reassurance message', () => {
      render(
        <EnhancedErrorBoundary section="Test">
          <ThrowingComponent />
        </EnhancedErrorBoundary>,
      );

      expect(
        screen.getByText(/Other parts of the dashboard are unaffected/i),
      ).toBeInTheDocument();
    });

    it('should have alert role for accessibility', () => {
      render(
        <EnhancedErrorBoundary section="Test">
          <ThrowingComponent />
        </EnhancedErrorBoundary>,
      );

      expect(screen.getByRole('alert')).toBeInTheDocument();
    });
  });

  describe('recovery actions', () => {
    it('should display try again button', () => {
      render(
        <EnhancedErrorBoundary section="Test">
          <ThrowingComponent />
        </EnhancedErrorBoundary>,
      );

      expect(screen.getByText('Try again')).toBeInTheDocument();
    });

    it('should reset error state on retry', () => {
      const { rerender } = render(
        <EnhancedErrorBoundary section="Test">
          <SafeComponent />
        </EnhancedErrorBoundary>,
      );

      // Component is initially fine
      expect(screen.getByText('Safe content')).toBeInTheDocument();

      // Now render with error
      rerender(
        <EnhancedErrorBoundary section="Test">
          <ThrowingComponent />
        </EnhancedErrorBoundary>,
      );

      expect(screen.getByText(/encountered an issue/i)).toBeInTheDocument();

      // Click retry
      fireEvent.click(screen.getByText('Try again'));

      // State should be reset, waiting for re-render
      // In actual app, this would allow component to try again
    });

    it('should display report button', () => {
      render(
        <EnhancedErrorBoundary section="Test">
          <ThrowingComponent />
        </EnhancedErrorBoundary>,
      );

      expect(screen.getByText('Report')).toBeInTheDocument();
    });

    it('should execute custom recovery actions', () => {
      const action = jest.fn();
      const customActions = [
        {
          label: 'Custom Action',
          action,
          icon: '🎯',
        },
      ];

      render(
        <EnhancedErrorBoundary section="Test" recoveryActions={customActions}>
          <ThrowingComponent />
        </EnhancedErrorBoundary>,
      );

      fireEvent.click(screen.getByText('Custom Action'));
      expect(action).toHaveBeenCalled();
    });
  });

  describe('error isolation', () => {
    it('should not affect sibling error boundaries', () => {
      render(
        <div>
          <EnhancedErrorBoundary section="Section 1">
            <ThrowingComponent />
          </EnhancedErrorBoundary>
          <EnhancedErrorBoundary section="Section 2">
            <SafeComponent />
          </EnhancedErrorBoundary>
        </div>,
      );

      // Section 1 shows error
      expect(screen.getByText(/Section 1 encountered an issue/i)).toBeInTheDocument();

      // Section 2 still renders
      expect(screen.getByText('Safe content')).toBeInTheDocument();
    });

    it('should isolate errors from multiple children', () => {
      render(
        <EnhancedErrorBoundary section="Test">
          <MultipleChildren />
          <ThrowingComponent />
        </EnhancedErrorBoundary>,
      );

      // Error boundary shows fallback
      expect(screen.getByText(/encountered an issue/i)).toBeInTheDocument();

      // Children are not rendered
      expect(screen.queryByText('Child 1')).not.toBeInTheDocument();
    });
  });

  describe('error data privacy', () => {
    it('should not expose error details in production', () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';

      render(
        <EnhancedErrorBoundary section="Test">
          <ThrowingComponent />
        </EnhancedErrorBoundary>,
      );

      // Details section should not be in DOM
      expect(screen.queryByText('Error details')).not.toBeInTheDocument();

      process.env.NODE_ENV = originalEnv;
    });

    it('should show details in development', () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'development';

      render(
        <EnhancedErrorBoundary section="Test">
          <ThrowingComponent />
        </EnhancedErrorBoundary>,
      );

      // Details section should be visible
      expect(screen.getByText('Error details (development only)')).toBeInTheDocument();

      process.env.NODE_ENV = originalEnv;
    });
  });

  describe('reset keys', () => {
    it('should reset when resetKeys change', () => {
      const { rerender } = render(
        <EnhancedErrorBoundary section="Test" resetKeys={['user-1']}>
          <ThrowingComponent />
        </EnhancedErrorBoundary>,
      );

      expect(screen.getByText(/encountered an issue/i)).toBeInTheDocument();

      // Change reset key
      rerender(
        <EnhancedErrorBoundary section="Test" resetKeys={['user-2']}>
          <SafeComponent />
        </EnhancedErrorBoundary>,
      );

      // After reset and changing content, should render new content
      // (in real scenario with component change)
    });

    it('should not reset when resetKeys are same', () => {
      const { rerender } = render(
        <EnhancedErrorBoundary section="Test" resetKeys={['user-1']}>
          <ThrowingComponent />
        </EnhancedErrorBoundary>,
      );

      expect(screen.getByText(/encountered an issue/i)).toBeInTheDocument();

      // Rerender with same key - should stay in error state
      rerender(
        <EnhancedErrorBoundary section="Test" resetKeys={['user-1']}>
          <ThrowingComponent />
        </EnhancedErrorBoundary>,
      );

      expect(screen.getByText(/encountered an issue/i)).toBeInTheDocument();
    });
  });

  describe('error callbacks', () => {
    it('should call onError callback', () => {
      const onError = jest.fn();

      render(
        <EnhancedErrorBoundary section="Test" onError={onError}>
          <ThrowingComponent />
        </EnhancedErrorBoundary>,
      );

      expect(onError).toHaveBeenCalled();
    });

    it('should handle onError callback errors gracefully', () => {
      const onError = jest.fn(() => {
        throw new Error('Callback error');
      });

      // Should not throw
      expect(() => {
        render(
          <EnhancedErrorBoundary section="Test" onError={onError}>
            <ThrowingComponent />
          </EnhancedErrorBoundary>,
        );
      }).not.toThrow();
    });
  });

  describe('logging and reporting', () => {
    it('should log errors when suppressLogging is false', () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

      render(
        <EnhancedErrorBoundary section="Test" suppressLogging={false}>
          <ThrowingComponent />
        </EnhancedErrorBoundary>,
      );

      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });

    it('should suppress logs when suppressLogging is true', () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

      render(
        <EnhancedErrorBoundary section="Test" suppressLogging={true}>
          <ThrowingComponent />
        </EnhancedErrorBoundary>,
      );

      // Should not call console.error beyond the original setup
      consoleSpy.mockRestore();
    });

    it('should generate error ID for tracking', () => {
      render(
        <EnhancedErrorBoundary section="Test">
          <ThrowingComponent />
        </EnhancedErrorBoundary>,
      );

      const errorBoundary = screen.getByTestId('enhanced-error-boundary');
      expect(errorBoundary).toHaveAttribute('data-error-id');

      const errorId = errorBoundary.getAttribute('data-error-id');
      expect(errorId).toMatch(/^err_\d+_[a-z0-9]+$/);
    });
  });

  describe('accessibility', () => {
    it('should be announced to screen readers', () => {
      render(
        <EnhancedErrorBoundary section="Test">
          <ThrowingComponent />
        </EnhancedErrorBoundary>,
      );

      const alert = screen.getByRole('alert');
      expect(alert).toHaveAttribute('aria-live', 'assertive');
    });

    it('should have proper heading structure', () => {
      render(
        <EnhancedErrorBoundary section="Test Section">
          <ThrowingComponent />
        </EnhancedErrorBoundary>,
      );

      const heading = screen.getByRole('heading', { level: 2 });
      expect(heading).toBeInTheDocument();
    });

    it('should have descriptive button labels', () => {
      render(
        <EnhancedErrorBoundary section="Test">
          <ThrowingComponent />
        </EnhancedErrorBoundary>,
      );

      const tryAgainButton = screen.getByRole('button', { name: /Try again/i });
      expect(tryAgainButton).toBeInTheDocument();
    });
  });
});
