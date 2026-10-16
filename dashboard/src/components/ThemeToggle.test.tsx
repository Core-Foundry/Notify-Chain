import { render, fireEvent } from '@testing-library/react';
import { axe, toHaveNoViolations } from 'jest-axe';
import { ThemeToggle } from './ThemeToggle';

expect.extend(toHaveNoViolations);

describe('ThemeToggle', () => {
  it('renders with accessible label for switching to light theme when dark', () => {
    const onToggle = jest.fn();
    const { getByRole } = render(<ThemeToggle theme="dark" onToggle={onToggle} />);

    expect(getByRole('button', { name: /switch to light theme/i })).toBeInTheDocument();
  });

  it('renders with accessible label for switching to dark theme when light', () => {
    const onToggle = jest.fn();
    const { getByRole } = render(<ThemeToggle theme="light" onToggle={onToggle} />);

    expect(getByRole('button', { name: /switch to dark theme/i })).toBeInTheDocument();
  });

  it('calls onToggle when clicked', () => {
    const onToggle = jest.fn();
    const { getByRole } = render(<ThemeToggle theme="dark" onToggle={onToggle} />);

    fireEvent.click(getByRole('button', { name: /switch to light theme/i }));
    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  it('calls onToggle on Enter and Space keydown', () => {
    const onToggle = jest.fn();
    const { getByRole } = render(<ThemeToggle theme="dark" onToggle={onToggle} />);
    const button = getByRole('button', { name: /switch to light theme/i });

    fireEvent.keyDown(button, { key: 'Enter' });
    fireEvent.keyDown(button, { key: ' ' });
    expect(onToggle).toHaveBeenCalledTimes(2);
  });

  it('has no accessibility violations', async () => {
    const { container } = render(<ThemeToggle theme="dark" onToggle={() => {}} />);
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });
});
