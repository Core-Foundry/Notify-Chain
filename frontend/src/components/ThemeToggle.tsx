import { useCallback } from 'react';
import { useOptionalTheme, type Theme } from '../hooks/useTheme';

interface ThemeToggleProps {
  theme?: Theme;
  onToggle?: () => void;
}

/**
 * Toggle between light and dark themes.
 * Prefers explicit props; falls back to ThemeProvider context.
 */
export function ThemeToggle({ theme: themeProp, onToggle }: ThemeToggleProps = {}) {
  const ctx = useOptionalTheme();
  const theme = themeProp ?? ctx?.theme ?? 'light';
  const handleToggle = onToggle ?? ctx?.toggleTheme ?? (() => undefined);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        handleToggle();
      }
    },
    [handleToggle]
  );

  return (
    <button
      type="button"
      className="inline-flex items-center gap-1 rounded-full border border-gray-300 dark:border-gray-600 bg-gray-100 dark:bg-gray-800 px-2 py-1 text-gray-700 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-indigo-500"
      onClick={handleToggle}
      onKeyDown={handleKeyDown}
      aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}
      title={`Currently ${theme} theme — click to switch`}
      data-testid="theme-toggle"
    >
      <span className={theme === 'light' ? 'opacity-100' : 'opacity-40'} aria-hidden="true">
        ☀
      </span>
      <span className={theme === 'dark' ? 'opacity-100' : 'opacity-40'} aria-hidden="true">
        🌙
      </span>
    </button>
  );
}

export default ThemeToggle;
