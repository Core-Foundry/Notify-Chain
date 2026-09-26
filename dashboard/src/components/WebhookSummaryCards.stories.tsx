import type { Meta, StoryObj } from '@storybook/react';
import { WebhookSummaryCards } from './WebhookSummaryCards';
import type { WebhookSummaryMetrics } from '../types/webhook';

const filledSummary: WebhookSummaryMetrics = {
  totalAttempts: 1842,
  successCount: 1760,
  failedCount: 82,
  successRate: 95.55,
  avgLatencyMs: 186,
  p95LatencyMs: 412,
};

const strugglingSummary: WebhookSummaryMetrics = {
  totalAttempts: 640,
  successCount: 410,
  failedCount: 230,
  successRate: 64.06,
  avgLatencyMs: 890,
  p95LatencyMs: 2100,
};

const meta: Meta<typeof WebhookSummaryCards> = {
  title: 'Components/WebhookSummaryCards',
  component: WebhookSummaryCards,
  tags: ['autodocs'],
  args: {
    summary: filledSummary,
    isLoading: false,
  },
};

export default meta;
type Story = StoryObj<typeof WebhookSummaryCards>;

export const Filled: Story = {};

export const Loading: Story = {
  args: {
    isLoading: true,
  },
};

export const DegradedPerformance: Story = {
  args: {
    summary: strugglingSummary,
  },
};
