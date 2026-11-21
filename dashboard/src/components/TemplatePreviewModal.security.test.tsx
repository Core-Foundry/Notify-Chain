import { render } from '@testing-library/react';
import { TemplatePreviewModal } from './TemplatePreviewModal';
import { NotificationType } from '../types/template';
import type { NotificationTemplate } from '../types/template';

describe('TemplatePreviewModal rich-text preview security', () => {
  it('sanitizes untrusted HTML while preserving supported formatting', () => {
    const template: NotificationTemplate = {
      id: 'template-xss',
      name: 'Safe preview',
      type: NotificationType.EMAIL,
      body: JSON.stringify({
        subject: 'Preview',
        body: 'Fallback',
        html:
          '<h2>Welcome</h2><p><strong>formatted</strong>' +
          '<img src=x onerror="window.__xss=1">' +
          '<script>window.__xss=2</script></p>',
      }),
      createdAt: new Date('2024-01-01T00:00:00Z'),
      updatedAt: new Date('2024-01-02T00:00:00Z'),
    };

    const { container, getByText } = render(
      <TemplatePreviewModal isOpen onClose={() => {}} template={template} />,
    );

    expect(getByText('Welcome').tagName).toBe('H2');
    expect(getByText('formatted').tagName).toBe('STRONG');
    expect(container.querySelector('img,script,svg')).toBeNull();
    expect(container.querySelector('[onerror]')).toBeNull();
    expect((window as Window & { __xss?: number }).__xss).toBeUndefined();
  });
});
