import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import SubscriptionForm, {
  validateGroupName,
  validateUsageCount,
  validateSubscriptionForm,
} from '../SubscriptionForm';

describe('subscription form validators', () => {
  it('rejects empty or short group names immediately', () => {
    expect(validateGroupName('')).toMatch(/required/i);
    expect(validateGroupName('ab')).toMatch(/at least 3/i);
    expect(validateGroupName('Team Alpha')).toBeUndefined();
  });

  it('rejects invalid usage counts', () => {
    expect(validateUsageCount('')).toMatch(/required/i);
    expect(validateUsageCount(0)).toMatch(/at least 1/i);
    expect(validateUsageCount(1.5)).toMatch(/whole number/i);
    expect(validateUsageCount(10)).toBeUndefined();
  });

  it('aggregates field errors', () => {
    const errors = validateSubscriptionForm({ groupName: '', usageCount: 0 });
    expect(errors.groupName).toBeDefined();
    expect(errors.usageCount).toBeDefined();
  });
});

describe('SubscriptionForm', () => {
  beforeEach(() => {
    // @ts-expect-error test stub
    delete window.freighter;
  });

  it('renders the create subscription heading', () => {
    render(<SubscriptionForm />);
    expect(screen.getByText(/create subscription group/i)).toBeInTheDocument();
  });

  it('shows connect prompt when wallet is disconnected', () => {
    render(<SubscriptionForm />);
    expect(screen.getByText(/connect your freighter wallet/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /connect/i })).toBeInTheDocument();
  });

  it('shows an error when Freighter is not installed', async () => {
    render(<SubscriptionForm />);
    fireEvent.click(screen.getByRole('button', { name: /connect/i }));

    await waitFor(() => {
      expect(screen.getByText(/freighter extension not found/i)).toBeInTheDocument();
    });
    expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument();
  });

  it('shows the form after a successful wallet connection', async () => {
    // @ts-expect-error test stub
    window.freighter = {
      isConnected: vi.fn().mockResolvedValue(true),
      requestAccess: vi.fn(),
      getPublicKey: vi.fn().mockResolvedValue('GTESTPUBLICKEY123'),
      signTransaction: vi.fn(),
    };

    render(<SubscriptionForm />);
    fireEvent.click(screen.getByRole('button', { name: /connect/i }));

    await waitFor(() => {
      expect(screen.getByText(/wallet connected/i)).toBeInTheDocument();
    });
    expect(screen.getByLabelText(/group name/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/initial usages/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /create group/i })).toBeInTheDocument();
  });

  it('shows inline validation and highlights invalid fields immediately on blur', async () => {
    // @ts-expect-error test stub
    window.freighter = {
      isConnected: vi.fn().mockResolvedValue(true),
      requestAccess: vi.fn(),
      getPublicKey: vi.fn().mockResolvedValue('GTESTPUBLICKEY123'),
      signTransaction: vi.fn(),
    };

    render(<SubscriptionForm />);
    fireEvent.click(screen.getByRole('button', { name: /connect/i }));

    await waitFor(() => {
      expect(screen.getByLabelText(/group name/i)).toBeInTheDocument();
    });

    const groupName = screen.getByLabelText(/group name/i);
    fireEvent.change(groupName, { target: { value: 'ab' } });
    fireEvent.blur(groupName);

    expect(await screen.findByRole('alert')).toHaveTextContent(/at least 3/i);
    expect(groupName).toHaveAttribute('aria-invalid', 'true');
    expect(groupName).toHaveAttribute('aria-describedby', 'groupName-error');
  });

  it('submits a stub transaction and shows the tx hash', async () => {
    // @ts-expect-error test stub
    window.freighter = {
      isConnected: vi.fn().mockResolvedValue(true),
      requestAccess: vi.fn(),
      getPublicKey: vi.fn().mockResolvedValue('GTESTPUBLICKEY123'),
      signTransaction: vi.fn().mockResolvedValue({ signedTxXdr: 'SIGNED' }),
    };

    render(<SubscriptionForm />);
    fireEvent.click(screen.getByRole('button', { name: /connect/i }));

    await waitFor(() => {
      expect(screen.getByLabelText(/group name/i)).toBeInTheDocument();
    });

    fireEvent.change(screen.getByLabelText(/group name/i), {
      target: { value: 'Team Alpha' },
    });
    fireEvent.click(screen.getByRole('button', { name: /create group/i }));

    await waitFor(() => {
      expect(screen.getByText(/transaction submitted/i)).toBeInTheDocument();
    });
  });
});
