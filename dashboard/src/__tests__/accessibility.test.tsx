/**
 * Accessibility audit tests (#394)
 * Uses jest-axe to detect WCAG 2.1 AA violations in key components.
 */
import { render } from '@testing-library/react';
import '@testing-library/jest-dom';
import { axe, toHaveNoViolations } from 'jest-axe';
import { Modal } from '../components/Modal';
import { ToastProvider } from '../context/ToastContext';
import { MobileNavDrawer } from '../components/MobileNavDrawer';

expect.extend(toHaveNoViolations);

// ─── Modal ────────────────────────────────────────────────────────────────────
describe('Modal accessibility (#394)', () => {
  it('open modal has no axe violations', async () => {
    const { container } = render(
      <Modal isOpen={true} onClose={() => {}} title="Test Modal">
        <p>Modal content here</p>
        <button type="button">Action</button>
      </Modal>,
    );
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });

  it('has role=dialog and aria-modal', () => {
    const { getByRole } = render(
      <Modal isOpen={true} onClose={() => {}} title="My Dialog">
        <p>Content</p>
      </Modal>,
    );
    const dialog = getByRole('dialog');
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(dialog).toHaveAttribute('aria-labelledby', 'modal-title');
  });

  it('closed modal renders nothing', () => {
    const { container } = render(
      <Modal isOpen={false} onClose={() => {}} title="Hidden">
        <p>Content</p>
      </Modal>,
    );
    expect(container).toBeEmptyDOMElement();
  });
});

// ─── ToastProvider ────────────────────────────────────────────────────────────
describe('ToastProvider accessibility (#394, #397)', () => {
  it('empty toast viewport has no axe violations', async () => {
    const { container } = render(
      <ToastProvider>
        <div>App content</div>
      </ToastProvider>,
    );
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });
});

// ─── MobileNavDrawer ──────────────────────────────────────────────────────────
describe('MobileNavDrawer accessibility (#394, #396)', () => {
  it('open drawer has no axe violations', async () => {
    const { container } = render(
      <MobileNavDrawer
        isOpen={true}
        onClose={() => {}}
        activeTab="explorer"
        onSelectTab={() => {}}
      />,
    );
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });
});
