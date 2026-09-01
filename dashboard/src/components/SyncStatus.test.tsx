import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { SyncStatus } from './SyncStatus';
import { useEventStore } from '../store/eventStore';

describe('SyncStatus', () => {
  it('renders last sync timestamp and error state', () => {
    useEventStore.setState({
      lastSuccessfulSyncAt: Date.now(),
      lastSyncFailureAt: Date.now(),
      lastSyncError: 'Background refresh failed',
    });

    render(<SyncStatus />);
    expect(screen.getByText(/Last sync:/)).toBeInTheDocument();
    expect(screen.getByText('refresh failed')).toBeInTheDocument();
  });
});
