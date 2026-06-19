import { render } from '@testing-library/react';

// The wallet service reads `import.meta.env`, which isn't available in the
// jest runtime. We only need the button to render for the audit, so stub the
// service's side-effecting functions.
jest.mock('../services/wallet', () => ({
  connectWallet: jest.fn(),
  disconnectWallet: jest.fn(),
  restoreWalletSession: jest.fn(),
}));

import {
  assertNoBlockingViolations,
  auditComponent,
  writeA11yReport,
} from './audit';
import { EventCard } from '../components/EventCard';
import { EventList } from '../components/EventList';
import { EventListPanel } from '../components/EventListPanel';
import { EventFiltersBar } from '../components/EventFiltersBar';
import { WalletConnectButton } from '../components/WalletConnectButton';
import { useWalletStore } from '../store/walletStore';
import { useEventStore } from '../store/eventStore';
import type { BlockchainEvent } from '../types/event';

function makeEvent(overrides: Partial<BlockchainEvent> = {}): BlockchainEvent {
  return {
    eventId: 'evt-1',
    type: 'TaskCreated',
    eventName: 'TaskCreated',
    ledger: 12345,
    contractAddress: 'GABCDEF1234567890ABCDEF1234567890ABCDEF12',
    receivedAt: Date.now(),
    value: '100',
    txHash: 'abcdef1234567890',
    topic: [],
    ...overrides,
  } as BlockchainEvent;
}

/** Renders, audits, and fails the test on any blocking (critical) violation. */
async function expectAccessible(name: string, ui: React.ReactElement) {
  const { container } = render(ui);
  const violations = await auditComponent(name, container);
  assertNoBlockingViolations(name, violations);
}

afterEach(() => {
  useWalletStore.setState({ address: null, isConnecting: false, error: null });
  useEventStore.setState({
    events: [],
    filters: { search: '', contractAddress: 'all', eventType: 'all' },
    isLoading: false,
    error: null,
  });
});

// Generate the readable report once every component has been audited — runs
// even when individual audits fail, so CI always has an artifact to upload.
afterAll(() => {
  const path = writeA11yReport();
  // eslint-disable-next-line no-console
  console.log(`Accessibility report written to ${path}`);
});

describe('accessibility audit', () => {
  test('WalletConnectButton (disconnected)', async () => {
    await expectAccessible('WalletConnectButton (disconnected)', (
      <WalletConnectButton />
    ));
  });

  test('WalletConnectButton (connected)', async () => {
    useWalletStore.setState({
      address: 'GABCDEF1234567890ABCDEF1234567890ABCDEF12',
    });
    await expectAccessible('WalletConnectButton (connected)', (
      <WalletConnectButton />
    ));
  });

  test('WalletConnectButton (error)', async () => {
    useWalletStore.setState({ error: 'Failed to connect wallet' });
    await expectAccessible('WalletConnectButton (error)', (
      <WalletConnectButton />
    ));
  });

  test('EventFiltersBar', async () => {
    await expectAccessible('EventFiltersBar', <EventFiltersBar />);
  });

  test('EventCard', async () => {
    await expectAccessible(
      'EventCard',
      <EventCard event={makeEvent()} onClick={() => {}} />
    );
  });

  test('EventList', async () => {
    const events = [makeEvent({ eventId: '1' }), makeEvent({ eventId: '2' })];
    await expectAccessible('EventList', <EventList events={events} />);
  });

  test('EventListPanel (empty state)', async () => {
    await expectAccessible('EventListPanel (empty state)', <EventListPanel />);
  });
});
