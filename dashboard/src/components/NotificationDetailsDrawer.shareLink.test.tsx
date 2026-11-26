import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { NotificationDetailsDrawer } from './NotificationDetailsDrawer';
import type { BlockchainEvent } from '../types/event';
import { copyTextToClipboard } from '../utils/clipboard';

// Issue #1153: copy a stable, credential-free link to an event.

jest.mock('../utils/clipboard', () => ({
  copyTextToClipboard: jest.fn(() => Promise.resolve(true)),
}));

const notification: BlockchainEvent = {
  eventId: '0000123-0001',
  contractAddress: 'CCONTRACT',
  eventName: 'notification_scheduled',
  ledger: 123,
  type: 'contract',
  topic: [],
  value: '{}',
  txHash: 'TXHASH123',
  receivedAt: Date.UTC(2026, 0, 1),
};

describe('NotificationDetailsDrawer share link', () => {
  it('copies a link carrying only the event id', async () => {
    window.history.replaceState({}, '', '/?token=secret&page=3#explorer');
    render(
      <NotificationDetailsDrawer isOpen={true} notification={notification} onClose={jest.fn()} />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Copy link to this event' }));

    await waitFor(() => expect(copyTextToClipboard).toHaveBeenCalled());
    const link = (copyTextToClipboard as jest.Mock).mock.calls[0][0] as string;
    expect(new URL(link).searchParams.get('eventId')).toBe('0000123-0001');
    expect(link).not.toMatch(/token|secret|page=/);
    expect(link.endsWith('#explorer')).toBe(true);
  });
});
