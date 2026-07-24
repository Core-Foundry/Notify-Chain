import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { NotificationHistoryPage } from './NotificationHistoryPage';

const mockFetchHistory = jest.fn();

jest.mock('../services/notificationHistoryApi', () => ({
  fetchNotificationHistory: (...args: unknown[]) => mockFetchHistory(...args),
  generateMockNotificationHistory: jest.requireActual('../services/notificationHistoryApi')
    .generateMockNotificationHistory,
}));

describe('NotificationHistoryPage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('shows a loading state while fetching', () => {
    mockFetchHistory.mockReturnValue(new Promise(() => undefined));
    render(<NotificationHistoryPage />);
    expect(screen.getByLabelText(/loading notification history/i)).toBeInTheDocument();
  });

  it('renders notifications in chronological order', async () => {
    mockFetchHistory.mockResolvedValue({
      records: [
        {
          id: 1,
          scheduledNotificationId: 10,
          executionAttempt: 1,
          executionTime: '2026-07-20T10:00:00.000Z',
          status: 'SUCCESS',
          errorMessage: null,
          responseDuration: 100,
        },
        {
          id: 2,
          scheduledNotificationId: 11,
          executionAttempt: 1,
          executionTime: '2026-07-22T10:00:00.000Z',
          status: 'FAILED',
          errorMessage: 'timeout',
          responseDuration: null,
        },
      ],
      total: 2,
      limit: 10,
      offset: 0,
      itemCount: 2,
      totalPages: 1,
    });

    render(<NotificationHistoryPage />);

    await waitFor(() => {
      expect(screen.getByLabelText(/notification history timeline/i)).toBeInTheDocument();
    });

    const items = screen.getAllByRole('listitem');
    expect(items[0].textContent).toMatch(/Failed/i);
    expect(items[1].textContent).toMatch(/Delivered/i);
  });

  it('shows an empty state when there are no notifications', async () => {
    mockFetchHistory.mockResolvedValue({
      records: [],
      total: 0,
      limit: 10,
      offset: 0,
      itemCount: 0,
      totalPages: 0,
    });

    render(<NotificationHistoryPage />);

    await waitFor(() => {
      expect(screen.getByText(/no notifications yet/i)).toBeInTheDocument();
    });
  });

  it('filters by status', async () => {
    mockFetchHistory.mockResolvedValue({
      records: [
        {
          id: 1,
          scheduledNotificationId: 10,
          executionAttempt: 1,
          executionTime: '2026-07-22T10:00:00.000Z',
          status: 'SUCCESS',
          errorMessage: null,
          responseDuration: 80,
        },
        {
          id: 2,
          scheduledNotificationId: 11,
          executionAttempt: 2,
          executionTime: '2026-07-21T10:00:00.000Z',
          status: 'FAILED',
          errorMessage: 'boom',
          responseDuration: null,
        },
      ],
      total: 2,
      limit: 10,
      offset: 0,
      itemCount: 2,
      totalPages: 1,
    });

    render(<NotificationHistoryPage />);

    await waitFor(() => {
      expect(screen.getByText(/2 notifications/i)).toBeInTheDocument();
    });

    fireEvent.change(screen.getByLabelText(/status/i), { target: { value: 'FAILED' } });

    await waitFor(() => {
      expect(screen.getByText(/1 notification/i)).toBeInTheDocument();
    });
    expect(screen.getByLabelText(/notification history timeline/i).textContent).toMatch(/Failed/i);
    expect(screen.getByLabelText(/notification history timeline/i).textContent).not.toMatch(/Delivered/i);
  });
});
