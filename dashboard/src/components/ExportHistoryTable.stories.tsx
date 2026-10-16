import type { Meta, StoryObj } from '@storybook/react';
import { ExportHistoryTable } from './ExportHistoryTable';
import type { NotificationExport } from '../utils/exportData';

const sampleExports: NotificationExport[] = [
  {
    id: 'exp_1',
    name: 'System alert notification logs',
    format: 'CSV',
    status: 'Completed',
    createdAt: Date.UTC(2026, 6, 20, 9, 30),
    recordCount: 1280,
    fileSize: '240 KB',
  },
  {
    id: 'exp_2',
    name: 'Monthly billing export',
    format: 'JSON',
    status: 'Processing',
    createdAt: Date.UTC(2026, 6, 22, 14, 5),
    recordCount: 420,
    fileSize: '—',
  },
  {
    id: 'exp_3',
    name: 'Webhook delivery metrics',
    format: 'PDF',
    status: 'Failed',
    createdAt: Date.UTC(2026, 6, 23, 18, 40),
    recordCount: 0,
    fileSize: '—',
  },
];

const meta: Meta<typeof ExportHistoryTable> = {
  title: 'Components/ExportHistoryTable',
  component: ExportHistoryTable,
  tags: ['autodocs'],
  args: {
    exports: sampleExports,
    onDownload: () => undefined,
  },
};

export default meta;
type Story = StoryObj<typeof ExportHistoryTable>;

export const MixedStatuses: Story = {};

export const CompletedOnly: Story = {
  args: {
    exports: sampleExports.filter((item) => item.status === 'Completed'),
  },
};

export const Empty: Story = {
  args: {
    exports: [],
  },
};
