import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NotificationSearchPage } from './NotificationSearchPage';
import * as eventsApi from '../services/eventsApi';

jest.mock('../services/eventsApi', () => ({
  searchNotifications: jest.fn(),
}));

describe('NotificationSearchPage pagination', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (eventsApi.searchNotifications as jest.Mock).mockResolvedValue({
      results: Array.from({ length: 20 }, (_, index) => ({
        id: index + 1,
        source: 'scheduled' as const,
        eventId: `event-${index + 1}`,
        txHash: null,
        contractAddress: null,
        notificationType: 'discord',
        targetRecipient: 'recipient@example.com',
        status: 'PENDING',
        createdAt: new Date().toISOString(),
        payload: null,
      })),
      total: 60,
      limit: 20,
      offset: 0,
      itemCount: 20,
      totalPages: 3,
    });
  });

  it('highlights the active page and navigates between pages', async () => {
    render(<NotificationSearchPage />);

    const searchInput = screen.getByLabelText(/free-text search/i);
    await userEvent.type(searchInput, 'hello');

    const pageTwo = await screen.findByRole('button', { name: 'Page 2' });
    expect(pageTwo).toHaveAttribute('aria-current', 'page');

    await userEvent.click(pageTwo);
    expect(screen.getByRole('button', { name: 'Page 2' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByText(/Page 2 of 3/i)).toBeInTheDocument();
  });
});
