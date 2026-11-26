import { render } from '@testing-library/react';
import { EventCard } from './EventCard';
import { EventExplorerCard } from './EventExplorerCard';
import { NotificationDetailsDrawer } from './NotificationDetailsDrawer';
import type { BlockchainEvent } from '../types/event';

const hostileMarkup = '<img src=x onerror="window.__xss=1">';
const event: BlockchainEvent = {
  eventId: 'event-1',
  contractAddress: 'GABCDEF',
  eventName: hostileMarkup,
  ledger: 123,
  type: 'UnknownEvent',
  topic: [hostileMarkup],
  value: JSON.stringify({
    nested: {
      message: hostileMarkup,
      list: ['<script>window.__xss=2</script>', { detail: hostileMarkup }],
    },
  }),
  txHash: 'TXHASH',
  receivedAt: Date.now(),
};

describe('untrusted event payload rendering', () => {
  it('renders event fields and arbitrarily nested payloads as text', () => {
    const { container } = render(
      <>
        <EventCard event={event} variant="expanded" />
        <EventExplorerCard event={event} />
        <NotificationDetailsDrawer isOpen notification={event} onClose={() => {}} />
      </>,
    );

    expect(container.querySelector('img,script,svg')).toBeNull();
    expect(container.querySelector('[onerror],[onload]')).toBeNull();
    expect(container.textContent).toContain(hostileMarkup);
    expect(container.textContent).toContain('<script>window.__xss=2</script>');
    expect((window as Window & { __xss?: number }).__xss).toBeUndefined();
  });
});
