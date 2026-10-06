import '@testing-library/jest-dom';
import { render, fireEvent, waitFor } from '@testing-library/react';
import { axe, toHaveNoViolations } from 'jest-axe';
import { ExportHistoryPage } from './ExportHistoryPage';

expect.extend(toHaveNoViolations);

test('ExportHistoryPage has no accessibility violations', async () => {
  const { container } = render(<ExportHistoryPage />);
  await waitFor(() => {
    expect(container).toBeDefined();
  });
  const results = await axe(container);
  expect(results).toHaveNoViolations();
});

test('ExportHistoryPage renders correctly and lists mock exports', async () => {
  const { getByText, getByRole, getAllByRole } = render(<ExportHistoryPage />);

  await waitFor(() => {
    expect(getByText('Notification Export History')).toBeInTheDocument();
  });

  expect(getByText(/Manage, filter, and download/)).toBeInTheDocument();
  expect(getByRole('table')).toBeInTheDocument();

  const rows = getAllByRole('row');
  expect(rows).toHaveLength(6);
});

test('ExportHistoryPage search and filtering works', async () => {
  const { getByLabelText, queryByText, getByText } = render(<ExportHistoryPage />);

  await waitFor(() => {
    expect(getByText('System Alert Notification logs')).toBeInTheDocument();
  });

  const searchInput = getByLabelText('Search Exports');
  fireEvent.change(searchInput, { target: { value: 'System Alert' } });

  expect(getByText('System Alert Notification logs')).toBeInTheDocument();
  expect(queryByText('Monthly billing export')).not.toBeInTheDocument();
});

test('ExportHistoryPage pagination limit and page switching works', async () => {
  const { getByLabelText, getByText, queryByText } = render(<ExportHistoryPage />);

  await waitFor(() => {
    expect(getByText('Page 1 of 3')).toBeInTheDocument();
  });

  expect(getByText('15 total export records')).toBeInTheDocument();
  expect(getByText('System Alert Notification logs')).toBeInTheDocument();

  const nextBtn = getByText('Next');
  fireEvent.click(nextBtn);

  expect(getByText('Page 2 of 3')).toBeInTheDocument();
  expect(queryByText('System Alert Notification logs')).not.toBeInTheDocument();

  const selectLimit = getByLabelText('Items per page');
  fireEvent.change(selectLimit, { target: { value: '10' } });

  await waitFor(() => {
    expect(getByText('Page 1 of 2')).toBeInTheDocument();
  });
});
