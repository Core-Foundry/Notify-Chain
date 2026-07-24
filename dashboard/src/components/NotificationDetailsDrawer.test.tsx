import '@testing-library/jest-dom';
import { fireEvent, render, screen } from '@testing-library/react';
import { NotificationDetailsDrawer } from './NotificationDetailsDrawer';
import type { BlockchainEvent } from '../types/event';

function makeNotification(overrides: Partial<BlockchainEvent> = {}): BlockchainEvent {
  return {
    eventId: 'evt-1',
    contractAddress: 'GABCDEF',
    eventName: 'TaskCreated',
    ledger: 123,
    type: 'contract',
    topic: [],
    value: '42',
    txHash: 'TXHASH123',
    receivedAt: Date.now(),
    ...overrides,
  };
}

describe('NotificationDetailsDrawer', () => {
  it('mounts and renders core notification metadata', async () => {
    const notification = makeNotification();
    const onClose = jest.fn();

    render(
      <NotificationDetailsDrawer
        isOpen={true}
        notification={notification}
        onClose={onClose}
      />
    );

    expect(screen.getByRole('dialog', { name: 'Notification details' })).toBeInTheDocument();
    expect(screen.getByText('Sender Details')).toBeInTheDocument();
    expect(screen.getByText('Blockchain Context')).toBeInTheDocument();
    expect(screen.getByText('Notification Status History')).toBeInTheDocument();

    expect(screen.getByText('Ledger')).toBeInTheDocument();
    expect(screen.getByText('123')).toBeInTheDocument();
    expect(screen.getByText('TXHASH123')).toBeInTheDocument();
  });

  it('calls onClose when the close button is clicked', () => {
    const notification = makeNotification();
    const onClose = jest.fn();

    render(
      <NotificationDetailsDrawer
        isOpen={true}
        notification={notification}
        onClose={onClose}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Close drawer' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('renders status history from metadata and guards clipboard exceptions', async () => {
    const notification = makeNotification({ contractAddress: 'GABCDEF', txHash: 'TXHASH123' });
    const onClose = jest.fn();

    Object.assign(navigator, {
      clipboard: {
        writeText: jest.fn().mockRejectedValue(new Error('Denied')),
      },
    });

    render(
      <NotificationDetailsDrawer
        isOpen={true}
        notification={notification}
        onClose={onClose}
        fetchMetadata={async () => ({
          sender: { address: 'GABCDEF', metadata: { note: 'unit-test' } },
          statusHistory: [
            { label: 'Queued', timestampMs: 1, detail: 'Enqueued for delivery' },
            { label: 'Delivered', timestampMs: 2, detail: 'Sent successfully' },
          ],
        })}
      />
    );

    expect(await screen.findByText('Queued')).toBeInTheDocument();
    expect(await screen.findByText('Delivered')).toBeInTheDocument();
    expect(await screen.findByText('unit-test')).toBeInTheDocument();

    const txCopyButtons = screen.getAllByRole('button', { name: 'Copy' });
    fireEvent.click(txCopyButtons[txCopyButtons.length - 1]);
    expect(await screen.findByText('Copy failed')).toBeInTheDocument();
  });

  it('shows an error fallback when metadata fetch fails', async () => {
    const notification = makeNotification();

    render(
      <NotificationDetailsDrawer
        isOpen={true}
        notification={notification}
        onClose={() => {}}
        fetchMetadata={async () => {
          throw new Error('boom');
        }}
      />
    );

    expect(await screen.findByText(/Failed to load details: boom/i)).toBeInTheDocument();
  });
});

