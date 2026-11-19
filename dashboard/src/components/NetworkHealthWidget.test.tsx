import { render, screen, waitFor } from '@testing-library/react';
import { NetworkHealthWidget } from './NetworkHealthWidget';

// Issue #1154

const NOW = Date.parse('2026-01-01T12:00:30.000Z');

function jsonResponse(body: unknown, status = 200) {
  // jsdom has no Response; the widget only needs ok, status and json().
  return Promise.resolve({
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
  });
}

const healthy = {
  status: 'ok',
  timestamp: '2026-01-01T12:00:00.000Z',
  network: 'testnet',
  services: { stellarRpc: { status: 'ok', latencyMs: 80 } },
};

describe('NetworkHealthWidget', () => {
  const originalFetch = global.fetch;
  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('shows the configured network and a healthy state', async () => {
    global.fetch = jest.fn(() => jsonResponse(healthy)) as unknown as typeof fetch;
    render(<NetworkHealthWidget healthUrl="http://l/health" now={() => NOW} />);

    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Healthy'));
    expect(screen.getByText('testnet')).toBeInTheDocument();
    expect(screen.queryByText('None yet')).toBeNull();
    expect(screen.getByText('80 ms')).toBeInTheDocument();
  });

  it('reads the 503 body and reports the network as unavailable', async () => {
    global.fetch = jest.fn(() =>
      jsonResponse(
        { ...healthy, status: 'error', services: { stellarRpc: { status: 'error' } } },
        503,
      ),
    ) as unknown as typeof fetch;
    render(<NetworkHealthWidget healthUrl="http://l/health" now={() => NOW} />);

    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Unavailable'));
    expect(screen.getByText('None yet')).toBeInTheDocument();
  });

  it('does not crash when the request fails and falls back to the configured network', async () => {
    global.fetch = jest.fn(() => Promise.reject(new Error('offline'))) as unknown as typeof fetch;
    render(<NetworkHealthWidget healthUrl="http://l/health" now={() => NOW} />);

    await waitFor(() =>
      expect(screen.getByText(/Could not reach the health endpoint/)).toBeInTheDocument(),
    );
    expect(screen.getByRole('status')).toHaveTextContent('Unavailable');
    expect(screen.getByText('TESTNET')).toBeInTheDocument();
  });

  it('identifies stale status', async () => {
    global.fetch = jest.fn(() => jsonResponse(healthy)) as unknown as typeof fetch;
    render(
      <NetworkHealthWidget
        healthUrl="http://l/health"
        now={() => Date.parse('2026-01-01T12:05:00.000Z')}
      />,
    );

    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Healthy (stale)'));
    expect(screen.getByText(/Status is stale/)).toBeInTheDocument();
  });
});
