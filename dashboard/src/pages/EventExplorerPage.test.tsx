import '@testing-library/jest-dom';
import { render, screen, waitFor, act } from '@testing-library/react';
import { EventExplorerPage } from './EventExplorerPage';
import { useEventStore } from '../store/eventStore';
import { generateMockEvents } from '../utils/eventData';
import { fetchEvents, fetchStatus } from '../services/eventsApi';

jest.mock('../services/eventsApi', () => ({
  fetchEvents: jest.fn(),
  fetchStatus: jest.fn(() => Promise.resolve({ contracts: [] })),
}));

jest.mock('../services/wallet', () => ({
  restoreWalletSession: jest.fn(() => Promise.resolve()),
}));

jest.mock('../components/WalletConnectButton', () => ({
  WalletConnectButton: () => <div data-testid="wallet-connect" />,
}));

const mockedFetchEvents = fetchEvents as jest.MockedFunction<typeof fetchEvents>;

describe('EventExplorerPage refresh states', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    useEventStore.setState({
      events: [],
      filters: {
        search: '',
        contractAddress: 'all',
        eventType: 'all',
        status: 'all',
        dateFrom: '',
        dateTo: '',
      },
      isLoading: false,
      error: null,
      lastFetchedAt: 0,
    });
    mockedFetchEvents.mockReset();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('shows refresh indicator and preserves events during background refresh', async () => {
    const initialEvents = generateMockEvents(3);
    mockedFetchEvents.mockResolvedValueOnce(initialEvents);

    render(<EventExplorerPage />);

    // Wait for initial load
    await waitFor(() => {
      expect(screen.queryByText(/Loading events/i)).not.toBeInTheDocument();
    });
    expect(screen.getAllByRole('row').length).toBeGreaterThan(1);

    // Setup next fetch to be pending
    let resolveRefresh!: (value: typeof initialEvents) => void;
    mockedFetchEvents.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveRefresh = resolve;
      }),
    );

    // Advance time to trigger background refresh (15s)
    act(() => {
      jest.advanceTimersByTime(15000);
    });

    // Refresh indicator appears, events remain
    await waitFor(() => {
      expect(screen.getByText(/Refreshing events/i)).toBeInTheDocument();
    });
    expect(screen.getAllByRole('row').length).toBeGreaterThan(1); // Table still rendered

    // Complete refresh
    await act(async () => {
      resolveRefresh(initialEvents);
    });

    // Indicator disappears
    await waitFor(() => {
      expect(screen.queryByText(/Refreshing events/i)).not.toBeInTheDocument();
    });
  });

  it('shows appropriate error state when refresh fails, preserving existing events', async () => {
    const initialEvents = generateMockEvents(3);
    mockedFetchEvents.mockResolvedValueOnce(initialEvents);

    render(<EventExplorerPage />);

    await waitFor(() => {
      expect(screen.queryByText(/Loading events/i)).not.toBeInTheDocument();
    });

    // Setup refresh failure
    mockedFetchEvents.mockRejectedValueOnce(new Error('Network error'));

    // Trigger refresh
    act(() => {
      jest.advanceTimersByTime(15000);
    });

    // Error banner appears, events remain
    await waitFor(() => {
      expect(screen.getByText(/Refresh Error:/i)).toBeInTheDocument();
      expect(screen.getByText(/Background refresh failed/i)).toBeInTheDocument();
    });
    expect(screen.getAllByRole('row').length).toBeGreaterThan(1);
  });
});
