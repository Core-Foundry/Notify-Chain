import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { NotificationSearchPage } from './NotificationSearchPage';
import * as eventsApi from '../services/eventsApi';

jest.mock('../services/eventsApi', () => {
  const actual = jest.requireActual('../services/eventsApi') as typeof import('../services/eventsApi');
  return {
    ...actual,
    searchNotifications: jest.fn(),
  };
});

const searchNotifications = eventsApi.searchNotifications as jest.MockedFunction<
  typeof eventsApi.searchNotifications
>;

function emptyResponse(): eventsApi.NotificationSearchResponse {
  return {
    results: [],
    total: 0,
    limit: 20,
    offset: 0,
    itemCount: 0,
    totalPages: 0,
  };
}

describe('NotificationSearchPage filters', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    searchNotifications.mockReset();
    searchNotifications.mockResolvedValue(emptyResponse());
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
    searchNotifications.mockResolvedValue({
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
    // Use the real implementation (not the page mock)
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
