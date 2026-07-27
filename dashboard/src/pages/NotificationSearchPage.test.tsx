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

function emptyResponse(): NotificationSearchResponse {
  return {
    results: [],
    total: 0,
    limit: 20,
    offset: 0,
    itemCount: 0,
    totalPages: 0,
  };
}

describe('NotificationSearchPage loading skeletons', () => {
  beforeEach(() => {
    mockedSearch.mockReset();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('renders type, delivery status, and date filter controls', () => {
    render(<NotificationSearchPage />);

    expect(screen.getByLabelText(/filter by notification type/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/filter by delivery status/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/filter from date/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/filter to date/i)).toBeInTheDocument();

    const typeSelect = screen.getByLabelText(/filter by notification type/i);
    expect(typeSelect).toContainHTML('Discord');
    expect(typeSelect).toContainHTML('Email');
    expect(typeSelect).toContainHTML('Webhook');
    expect(typeSelect).toContainHTML('SMS');
  });

  it('calls searchNotifications with type, status, and date params', async () => {
    render(<NotificationSearchPage />);

    await act(async () => {
      fireEvent.change(screen.getByLabelText(/filter by notification type/i), {
        target: { value: 'discord' },
      });
      fireEvent.change(screen.getByLabelText(/filter by delivery status/i), {
        target: { value: 'FAILED' },
      });
      fireEvent.change(screen.getByLabelText(/filter from date/i), {
        target: { value: '2026-01-01' },
      });
      fireEvent.change(screen.getByLabelText(/filter to date/i), {
        target: { value: '2026-01-31' },
      });
    });

    await waitFor(() => {
      expect(searchNotifications).toHaveBeenCalled();
    });

    const lastCall = searchNotifications.mock.calls[searchNotifications.mock.calls.length - 1];
    expect(lastCall?.[1]).toMatchObject({
      type: 'discord',
      status: 'FAILED',
      startDate: '2026-01-01',
      endDate: '2026-01-31',
    });
  });

  it('updates results when filters change', async () => {
    mockedSearch.mockResolvedValue({
      results: [
        {
          id: 1,
          source: 'scheduled',
          eventId: 'evt-1',
          txHash: null,
          contractAddress: null,
          notificationType: 'email',
          targetRecipient: 'alice',
          status: 'COMPLETED',
          createdAt: '2026-03-01T00:00:00.000Z',
          payload: null,
        },
      ],
      total: 1,
      limit: 20,
      offset: 0,
      itemCount: 1,
      totalPages: 1,
    });

    render(<NotificationSearchPage />);

    await act(async () => {
      fireEvent.change(screen.getByLabelText(/filter by notification type/i), {
        target: { value: 'email' },
      });
    });

    expect(await screen.findByText('email')).toBeInTheDocument();
    expect(screen.getByText('COMPLETED')).toBeInTheDocument();
    expect(screen.getByText(/1 result/i)).toBeInTheDocument();
  });

  it('clears type, status, and date filters', async () => {
    render(<NotificationSearchPage />);

    await act(async () => {
      fireEvent.change(screen.getByLabelText(/filter by notification type/i), {
        target: { value: 'sms' },
      });
      fireEvent.change(screen.getByLabelText(/filter by delivery status/i), {
        target: { value: 'PENDING' },
      });
      fireEvent.change(screen.getByLabelText(/filter from date/i), {
        target: { value: '2026-02-01' },
      });
    });

    expect(screen.getByRole('button', { name: /clear all filters/i })).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /clear all filters/i }));
    });

    expect(screen.getByLabelText(/filter by notification type/i)).toHaveValue('');
    expect(screen.getByLabelText(/filter by delivery status/i)).toHaveValue('');
    expect(screen.getByLabelText(/filter from date/i)).toHaveValue('');
    expect(screen.queryByRole('button', { name: /clear all filters/i })).not.toBeInTheDocument();
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

describe('searchNotifications query params', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => emptyResponse(),
    });
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('appends type, status, startDate, and endDate to the URL', async () => {
    const { searchNotifications: realSearch } = jest.requireActual(
      '../services/eventsApi'
    ) as typeof import('../services/eventsApi');

    await realSearch('http://localhost:8787', {
      type: 'webhook',
      status: 'COMPLETED',
      startDate: '2026-01-01',
      endDate: '2026-01-31',
    });

    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('type=webhook')
    );
    const calledUrl = (global.fetch as jest.Mock).mock.calls[0][0] as string;
    expect(calledUrl).toContain('status=COMPLETED');
    expect(calledUrl).toContain('startDate=2026-01-01');
    expect(calledUrl).toContain('endDate=2026-01-31');
  });
});
