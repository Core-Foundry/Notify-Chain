import '@testing-library/jest-dom';
import { render, screen, waitFor, fireEvent, act } from '@testing-library/react';
import { NotificationSearchPage } from './NotificationSearchPage';
import { searchNotifications } from '../services/eventsApi';
import type { NotificationSearchResponse } from '../services/eventsApi';

jest.mock('../services/eventsApi', () => ({
  searchNotifications: jest.fn(),
}));

const mockedSearch = searchNotifications as jest.MockedFunction<typeof searchNotifications>;

const mockResult: NotificationSearchResponse = {
  results: [
    {
      id: 1,
      source: 'scheduled',
      eventId: 'evt-abc',
      txHash: '0xdeadbeef',
      contractAddress: 'CABCDEF',
      notificationType: 'email',
      targetRecipient: 'user@example.com',
      status: 'PENDING',
      createdAt: '2026-01-15T12:00:00.000Z',
      payload: null,
    },
  ],
  total: 1,
  limit: 20,
  offset: 0,
  itemCount: 1,
  totalPages: 1,
};

describe('NotificationSearchPage loading skeletons', () => {
  beforeEach(() => {
    mockedSearch.mockReset();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('shows result-card skeletons while searching and hides Searching text', async () => {
    mockedSearch.mockReturnValue(new Promise(() => {}));

    render(<NotificationSearchPage />);

    fireEvent.change(screen.getByLabelText(/free-text search/i), {
      target: { value: 'payment' },
    });

    await act(async () => {
      jest.advanceTimersByTime(300);
    });

    await waitFor(() => {
      expect(screen.getByLabelText(/searching notifications/i)).toBeInTheDocument();
    });
    expect(screen.queryByText(/searching…/i)).not.toBeInTheDocument();
    expect(screen.getByLabelText(/searching notifications/i)).toHaveAttribute('aria-busy', 'true');
  });

  it('replaces skeletons with result cards once search completes', async () => {
    let resolveSearch!: (value: NotificationSearchResponse) => void;
    mockedSearch.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveSearch = resolve;
        })
    );

    render(<NotificationSearchPage />);

    fireEvent.change(screen.getByLabelText(/free-text search/i), {
      target: { value: 'payment' },
    });

    await act(async () => {
      jest.advanceTimersByTime(300);
    });

    await waitFor(() => {
      expect(screen.getByLabelText(/searching notifications/i)).toBeInTheDocument();
    });

    await act(async () => {
      resolveSearch(mockResult);
    });

    await waitFor(() => {
      expect(screen.queryByLabelText(/searching notifications/i)).not.toBeInTheDocument();
    });

    expect(screen.getByText(/1 result/i)).toBeInTheDocument();
    expect(screen.getByText('evt-abc')).toBeInTheDocument();
    expect(document.querySelector('.notif-result-card__status')).toHaveTextContent('PENDING');
  });
});
