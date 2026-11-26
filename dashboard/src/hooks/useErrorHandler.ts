/**
 * useErrorHandler - Hook for handling errors in async operations
 *
 * Bridges the gap between error boundaries (which catch render errors)
 * and async operations (which throw outside the React render cycle).
 *
 * Usage:
 *   const handleError = useErrorHandler();
 *   try {
 *     await someAsyncOperation();
 *   } catch (error) {
 *     handleError(error);
 *   }
 */

import { useCallback } from 'react';
import { getDiagnostics } from '../utils/error-utils';

/**
 * Error handler for async operations
 * Throws error back into React so nearest error boundary catches it
 */
export function useErrorHandler() {
  return useCallback((error: unknown) => {
    const diagnostics = getDiagnostics(error);

    // Log diagnostic info
    console.error('[useErrorHandler] Caught async error:', {
      message: diagnostics.message,
      severity: diagnostics.severity,
      category: diagnostics.category,
      isRecoverable: diagnostics.isRecoverable,
    });

    // Re-throw so error boundary catches it
    throw error;
  }, []);
}

/**
 * Hook for safe async operations with error handling
 */
export function useSafeAsync() {
  const handleError = useErrorHandler();

  return useCallback(
    async <T,>(asyncFn: () => Promise<T>): Promise<T | null> => {
      try {
        return await asyncFn();
      } catch (error) {
        handleError(error);
        return null;
      }
    },
    [handleError],
  );
}
