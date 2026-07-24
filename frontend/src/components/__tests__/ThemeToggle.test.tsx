import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { ThemeProvider, useTheme } from '../../hooks/useTheme';
import { ThemeToggle } from '../ThemeToggle';

function ThemeLabel() {
  const { theme } = useTheme();
  return <span data-testid="theme-label">{theme}</span>;
}

describe('ThemeToggle + ThemeProvider', () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.classList.remove('dark');
    document.documentElement.removeAttribute('data-theme');
  });

  it('renders and toggles theme with persistence', () => {
    render(
      <ThemeProvider>
        <ThemeToggle />
        <ThemeLabel />
      </ThemeProvider>
    );

    expect(screen.getByTestId('theme-label').textContent).toBe('light');
    fireEvent.click(screen.getByTestId('theme-toggle'));
    expect(screen.getByTestId('theme-label').textContent).toBe('dark');
    expect(localStorage.getItem('notify-chain-theme')).toBe('dark');
    expect(document.documentElement.classList.contains('dark')).toBe(true);
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
  });

  it('restores stored dark preference on mount', () => {
    localStorage.setItem('notify-chain-theme', 'dark');
    render(
      <ThemeProvider>
        <ThemeLabel />
      </ThemeProvider>
    );
    expect(screen.getByTestId('theme-label').textContent).toBe('dark');
  });
});
