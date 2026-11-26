import { render, screen } from '@testing-library/react';
import { LedgerProgressIndicator } from './LedgerProgressIndicator';
import type { IndexingHealth } from '../types/indexingHealth';

// Issue #1159

const NOW = Date.UTC(2026, 0, 1, 12, 0, 0);

const health = (overrides: Partial<IndexingHealth> = {}): IndexingHealth => ({
  status: 'syncing',
  timestampMs: NOW,
  indexedLedger: 1_234,
  networkTipLedger: 1_250,
  ledgerLag: 16,
  processingDelayMs: 0,
  lastIngestedAtMs: NOW,
  detail: null,
  ...overrides,
});

describe('LedgerProgressIndicator', () => {
  it('shows processed, available, difference and a percentage', () => {
    render(<LedgerProgressIndicator health={health()} nowMs={NOW} />);
    expect(screen.getByText((1_234).toLocaleString())).toBeInTheDocument();
    expect(screen.getByText((1_250).toLocaleString())).toBeInTheDocument();
    expect(screen.getByText('16')).toBeInTheDocument();
    expect(screen.getByRole('progressbar')).toHaveAttribute('value', '98.7');
    expect(screen.getByText('Catching up')).toBeInTheDocument();
  });

  it('handles a missing latest ledger without a misleading percentage', () => {
    render(<LedgerProgressIndicator health={health({ networkTipLedger: null })} nowMs={NOW} />);
    expect(screen.getByText('Not available')).toBeInTheDocument();
    expect(screen.queryByRole('progressbar')).toBeNull();
    expect(screen.getByText(/latest available ledger is not reported/)).toBeInTheDocument();
  });

  it('identifies stale progress', () => {
    render(
      <LedgerProgressIndicator health={health({ lastIngestedAtMs: NOW - 120_000 })} nowMs={NOW} />,
    );
    expect(screen.getByText('Stale')).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent(/may be out of date/);
    expect(screen.queryByRole('progressbar')).toBeNull();
  });

  it('renders an unavailable state before data loads', () => {
    render(<LedgerProgressIndicator health={null} nowMs={NOW} />);
    expect(screen.getByText('Progress unavailable')).toBeInTheDocument();
    expect(screen.queryByRole('progressbar')).toBeNull();
  });
});
