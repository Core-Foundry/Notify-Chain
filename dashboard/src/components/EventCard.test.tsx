import { render, fireEvent, screen } from '@testing-library/react';
import { axe, toHaveNoViolations } from 'jest-axe';
import { EventCard } from './EventCard';
import type { BlockchainEvent } from '../types/event';

expect.extend(toHaveNoViolations);

const mockEvent: BlockchainEvent = {
  eventId: 'evt-1',
  type: 'TaskCreated',
  eventName: 'TaskCreated',
  ledger: 12345,
  contractAddress: 'GABCDEF1234567890ABCDEF1234567890ABCDEF12',
  receivedAt: Date.now(),
  value: '100',
  txHash: 'abcdef1234567890',
  topic: [],
} as BlockchainEvent;

test('clickable EventCard has no accessibility violations', async () => {
  const { container } = render(<EventCard event={mockEvent} onClick={() => {}} />);
  const results = await axe(container);
  expect(results).toHaveNoViolations();
});

test('activates on Space key, not just Enter', () => {
  const onClick = jest.fn();
  const { getByRole } = render(<EventCard event={mockEvent} onClick={onClick} />);
  const card = getByRole('group');

  fireEvent.keyDown(card, { key: ' ' });
  expect(onClick).toHaveBeenCalledTimes(1);

  fireEvent.keyDown(card, { key: 'Enter' });
  expect(onClick).toHaveBeenCalledTimes(2);
});

describe('transaction hash copy action', () => {
  beforeEach(() => {
    Object.assign(navigator, {
      clipboard: {
        writeText: jest.fn().mockResolvedValue(undefined),
      },
    });
  });

  it('copies the full transaction hash from the compact card', async () => {
    render(<EventCard event={mockEvent} />);

    fireEvent.click(screen.getByRole('button', { name: /copy transaction hash/i }));

    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(mockEvent.txHash);
    expect(
      await screen.findByRole('button', { name: /transaction hash copied/i }),
    ).toBeInTheDocument();
  });

  it('keeps the full transaction hash accessible in the expanded card', () => {
    render(<EventCard event={mockEvent} variant="expanded" />);

    expect(screen.getByText(mockEvent.txHash)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /copy transaction hash/i })).toBeInTheDocument();
  });

  it('handles clipboard rejection without showing false success', async () => {
    navigator.clipboard.writeText = jest.fn().mockRejectedValue(new Error('Denied'));
    render(<EventCard event={mockEvent} />);

    fireEvent.click(screen.getByRole('button', { name: /copy transaction hash/i }));

    expect(
      await screen.findByRole('button', { name: /copy transaction hash/i }),
    ).toBeInTheDocument();
  });
});
