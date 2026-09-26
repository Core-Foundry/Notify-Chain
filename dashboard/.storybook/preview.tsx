import type { Preview } from '@storybook/react';
import React, { useEffect, type ReactNode } from 'react';
import '../src/index.css';

function ThemeWrapper({
  theme,
  children,
}: {
  theme: 'dark' | 'light';
  children: ReactNode;
}) {
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    document.body.style.background = theme === 'light' ? '#f5f7fb' : '#0b0d12';
    document.body.style.color = theme === 'light' ? '#0b0d12' : '#e8eaed';
    document.body.style.margin = '0';
    document.body.style.minHeight = '100vh';
  }, [theme]);

  return React.createElement(
    'div',
    { className: 'app', style: { padding: '16px', minHeight: '100%' } },
    children
  );
}

const preview: Preview = {
  parameters: {
    controls: {
      matchers: {
        color: /(background|color)$/i,
        date: /Date$/i,
      },
    },
    layout: 'padded',
    backgrounds: {
      default: 'dashboard-dark',
      values: [
        { name: 'dashboard-dark', value: '#0b0d12' },
        { name: 'dashboard-light', value: '#f5f7fb' },
      ],
    },
  },
  globalTypes: {
    theme: {
      description: 'Dashboard color theme',
      defaultValue: 'dark',
      toolbar: {
        title: 'Theme',
        icon: 'circlehollow',
        items: [
          { value: 'dark', title: 'Dark' },
          { value: 'light', title: 'Light' },
        ],
        dynamicTitle: true,
      },
    },
  },
  decorators: [
    (Story, context) =>
      React.createElement(
        ThemeWrapper,
        { theme: (context.globals.theme as 'dark' | 'light') ?? 'dark' },
        React.createElement(Story)
      ),
  ],
};

export default preview;
