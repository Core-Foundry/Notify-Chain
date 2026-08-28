import type { Meta, StoryObj } from '@storybook/react';
import { EventExplorerCard } from './EventExplorerCard';
import { sampleEvent, sampleSystemEvent } from '../stories/fixtures/events';

const meta: Meta<typeof EventExplorerCard> = {
  title: 'Components/EventExplorerCard',
  component: EventExplorerCard,
  tags: ['autodocs'],
  args: {
    event: sampleEvent,
    onCopyContract: () => undefined,
    isCopied: false,
    contractStatuses: [],
  },
  decorators: [
    (Story) => (
      <section className="event-explorer__table-wrapper">
        <div className="event-explorer__table-body" role="rowgroup">
          <Story />
        </div>
      </section>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof EventExplorerCard>;

export const Default: Story = {};

export const Copied: Story = {
  args: {
    isCopied: true,
  },
};

export const PausedContract: Story = {
  args: {
    contractStatuses: [
      {
        address: sampleEvent.contractAddress,
        paused: true,
      },
    ],
  },
};

export const SystemKind: Story = {
  args: {
    event: sampleSystemEvent,
  },
};

export const Clickable: Story = {
  args: {
    onSelect: () => undefined,
  },
};
