import type { Meta, StoryObj } from '@storybook/react';
import { useState } from 'react';
import { ThemeToggle } from './ThemeToggle';
import type { Theme } from '../hooks/useTheme';

const meta: Meta<typeof ThemeToggle> = {
  title: 'Components/ThemeToggle',
  component: ThemeToggle,
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof ThemeToggle>;

export const Dark: Story = {
  args: {
    theme: 'dark',
    onToggle: () => undefined,
  },
};

export const Light: Story = {
  args: {
    theme: 'light',
    onToggle: () => undefined,
  },
};

export const Interactive: Story = {
  render: function InteractiveThemeToggle() {
    const [theme, setTheme] = useState<Theme>('dark');

    return (
      <ThemeToggle
        theme={theme}
        onToggle={() => setTheme((current) => (current === 'dark' ? 'light' : 'dark'))}
      />
    );
  },
};
