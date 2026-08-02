import type { Meta, StoryObj } from '@storybook/react';
import { useState } from 'react';
import { PaginationControls } from './PaginationControls';

const meta: Meta<typeof PaginationControls> = {
  title: 'Components/PaginationControls',
  component: PaginationControls,
  tags: ['autodocs'],
  args: {
    page: 2,
    pageCount: 8,
    limit: 12,
    totalCount: 96,
    onPageChange: () => undefined,
    onLimitChange: () => undefined,
  },
};

export default meta;
type Story = StoryObj<typeof PaginationControls>;

export const MiddlePage: Story = {};

export const FirstPage: Story = {
  args: {
    page: 1,
  },
};

export const LastPage: Story = {
  args: {
    page: 8,
  },
};

export const CustomPageSizes: Story = {
  args: {
    pageSizeOptions: [5, 10, 25],
    limit: 10,
    summaryLabel: 'exports',
  },
};

export const Interactive: Story = {
  render: function InteractivePagination(args) {
    const [page, setPage] = useState(args.page);
    const [limit, setLimit] = useState(args.limit);
    const pageCount = Math.max(1, Math.ceil(args.totalCount / limit));

    return (
      <PaginationControls
        {...args}
        page={Math.min(page, pageCount)}
        pageCount={pageCount}
        limit={limit}
        onPageChange={setPage}
        onLimitChange={(nextLimit) => {
          setLimit(nextLimit);
          setPage(1);
        }}
      />
    );
  },
};
