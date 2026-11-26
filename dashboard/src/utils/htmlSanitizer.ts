const ALLOWED_TAGS = new Set([
  'a',
  'b',
  'blockquote',
  'br',
  'code',
  'em',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'i',
  'li',
  'ol',
  'p',
  'pre',
  's',
  'strong',
  'u',
  'ul',
]);

const DROP_CONTENT_TAGS = new Set([
  'iframe',
  'noembed',
  'noframes',
  'noscript',
  'object',
  'script',
  'style',
  'svg',
  'math',
  'template',
]);

function isSafeHref(value: string): boolean {
  try {
    const url = new URL(value.trim(), globalThis.location?.origin ?? 'https://localhost');
    return ['http:', 'https:', 'mailto:'].includes(url.protocol);
  } catch {
    return false;
  }
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Keeps a small set of basic formatting tags for template previews while
 * rebuilding the tree from text nodes and safe attributes only.
 */
export function sanitizeHtml(value: string): string {
  if (typeof DOMParser === 'undefined') return escapeHtml(value);

  const parsed = new DOMParser().parseFromString(value, 'text/html');
  const output = document.createElement('div');

  const copySafeNodes = (source: ParentNode, target: ParentNode): void => {
    for (const node of Array.from(source.childNodes)) {
      if (node.nodeType === Node.TEXT_NODE) {
        target.appendChild(document.createTextNode(node.textContent ?? ''));
        continue;
      }

      if (node.nodeType !== Node.ELEMENT_NODE) continue;

      const element = node as Element;
      const tag = element.tagName.toLowerCase();
      if (DROP_CONTENT_TAGS.has(tag) || element.namespaceURI !== 'http://www.w3.org/1999/xhtml') {
        continue;
      }

      if (!ALLOWED_TAGS.has(tag)) {
        copySafeNodes(element, target);
        continue;
      }

      const cleanElement = document.createElement(tag);
      if (tag === 'a') {
        const href = element.getAttribute('href');
        if (href && isSafeHref(href)) cleanElement.setAttribute('href', href);
      }
      if (element.hasAttribute('title')) {
        cleanElement.setAttribute('title', element.getAttribute('title') ?? '');
      }
      copySafeNodes(element, cleanElement);
      target.appendChild(cleanElement);
    }
  };

  copySafeNodes(parsed.body, output);
  return output.innerHTML;
}
