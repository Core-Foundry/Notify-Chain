import { render, screen } from '@testing-library/react';
import { PrintableEventDetails } from './PrintableEventDetails';
import type { BlockchainEvent } from '../types/event';

const HASH = 'b'.repeat(64);

const event: BlockchainEvent = {
  eventId: 'event-123',
  contractAddress: 'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
  eventName: 'NotificationCreated',
  type: 'contract',
  ledger: 12345,
  topic: ['NotificationCreated'],
  value: '{"message":"incident"}',
  txHash: HASH,
  receivedAt: 1_700_000_000_000,
};

describe('PrintableEventDetails (#1161)', () => {
  it('prints transaction, contract, timestamp and payload information', () => {
    render(<PrintableEventDetails event={event} />);

    expect(screen.getByText('Event details report')).toBeInTheDocument();
    expect(screen.getByText(event.eventId)).toBeInTheDocument();
    expect(screen.getByText(event.contractAddress)).toBeInTheDocument();
    expect(screen.getByText(HASH)).toBeInTheDocument();
    expect(screen.getByText('12345')).toBeInTheDocument();
    expect(screen.getByText(event.value)).toBeInTheDocument();
  });

  it('includes a safely configured explorer link for valid hashes', () => {
    render(<PrintableEventDetails event={event} />);

    const link = screen.getByRole('link', { name: new RegExp(HASH) });
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
  });

  it('omits the explorer link when the hash is invalid', () => {
    render(<PrintableEventDetails event={{ ...event, txHash: 'invalid' }} />);

    expect(screen.queryByRole('link')).not.toBeInTheDocument();
    expect(screen.getByText('invalid')).toBeInTheDocument();
  });
});
