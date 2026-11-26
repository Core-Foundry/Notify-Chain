import { sanitizeHtml } from './htmlSanitizer';

describe('sanitizeHtml', () => {
  it('retains basic formatting while removing executable elements and attributes', () => {
    const result = sanitizeHtml(
      '<p>Hello <strong>world</strong><img src=x onerror="alert(1)"></p>' +
        '<script>alert(2)</script><svg onload="alert(3)"><text>svg</text></svg>' +
        '<a href="javascript:alert(4)" onclick="alert(5)">unsafe link</a>',
    );
    const container = document.createElement('div');
    container.innerHTML = result;

    expect(container.querySelector('p strong')?.textContent).toBe('world');
    expect(container.querySelector('img,script,svg')).toBeNull();
    expect(container.querySelector('[onerror],[onload],[onclick]')).toBeNull();
    expect(container.querySelector('a')?.hasAttribute('href')).toBe(false);
    expect(container.textContent).toContain('unsafe link');
  });

  it('keeps safe links and nested formatted content', () => {
    const container = document.createElement('div');
    container.innerHTML = sanitizeHtml(
      '<h2>Title</h2><p><a href="https://example.test/path">Read <em>more</em></a></p>',
    );

    expect(container.querySelector('h2')?.textContent).toBe('Title');
    expect(container.querySelector('a')?.getAttribute('href')).toBe('https://example.test/path');
    expect(container.querySelector('a em')?.textContent).toBe('more');
  });

  it('escapes content when the DOM parser is not available', () => {
    const originalParser = globalThis.DOMParser;
    Object.defineProperty(globalThis, 'DOMParser', { configurable: true, value: undefined });
    try {
      expect(sanitizeHtml('<img src=x onerror=alert(1)>')).toBe(
        '&lt;img src=x onerror=alert(1)&gt;',
      );
    } finally {
      Object.defineProperty(globalThis, 'DOMParser', {
        configurable: true,
        value: originalParser,
      });
    }
  });
});
