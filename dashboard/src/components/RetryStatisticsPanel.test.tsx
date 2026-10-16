import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { RetryStatisticsPanel } from './RetryStatisticsPanel';

const mockFetchRetryStatistics = jest.fn();
const mockGenerateMockRetryStatistics = jest.fn();

jest.mock('../services/retryStatisticsApi', () => ({
  fetchRetryStatistics: (...args: unknown[]) => mockFetchRetryStatistics(...args),
  generateMockRetryStatistics: (...args: unknown[]) => mockGenerateMockRetryStatistics(...args),
}));

const SAMPLE = {
  totalNotifications: 10,
  totalRetryAttempts: 4,
  notificationsWithRetries: 3,
  permanentFailures: 1,
  recoveredAfterRetry: 2,
  averageRetriesPerNotification: 0.4,
  maxObservedRetryCount: 2,
  retryRate: 0.3,
  distribution: [
    { retryCount: 0, count: 7, successCount: 7, failureCount: 0 },
    { retryCount: 1, count: 2, successCount: 1, failureCount: 1 },
    { retryCount: 2, count: 1, successCount: 1, failureCount: 0 },
  ],
};

describe('RetryStatisticsPanel', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGenerateMockRetryStatistics.mockReturnValue(SAMPLE);
  });

  it('loads and displays retry statistics from the API', async () => {
    mockFetchRetryStatistics.mockResolvedValue(SAMPLE);

    render(<RetryStatisticsPanel />);

    expect(await screen.findByText('0.40')).toBeInTheDocument();
    expect(screen.getByText('Notification Retry Statistics')).toBeInTheDocument();
    expect(screen.getByText('4')).toBeInTheDocument();
    expect(screen.getByText('30.0%')).toBeInTheDocument();
    expect(screen.getByText('Retry distribution')).toBeInTheDocument();
  });

  it('falls back to mock data when the API fails', async () => {
    mockFetchRetryStatistics.mockRejectedValue(new Error('offline'));

    render(<RetryStatisticsPanel />);

    expect(await screen.findByText(/sample data/i)).toBeInTheDocument();
    expect(mockGenerateMockRetryStatistics).toHaveBeenCalled();
  });

  it('refreshes statistics on demand', async () => {
    mockFetchRetryStatistics.mockResolvedValue(SAMPLE);
    render(<RetryStatisticsPanel />);

    await screen.findByText('0.40');
    expect(mockFetchRetryStatistics).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('button', { name: /refresh/i }));

    await waitFor(() => {
      expect(mockFetchRetryStatistics).toHaveBeenCalledTimes(2);
    });
  });
});
