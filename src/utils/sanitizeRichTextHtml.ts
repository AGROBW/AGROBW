const ALLOWED_TAGS = new Set([
  'a',
  'b',
  'blockquote',
  'br',
  'code',
  'div',
  'em',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'hr',
  'i',
  'li',
  'ol',
  'p',
  'pre',
  'span',
  'strong',
  'u',
  'ul',
]);

const sanitizeLinkHref = (href: string): string | null => {
  const trimmed = href.trim();
  if (!trimmed) return null;

  if (trimmed.startsWith('/') || trimmed.startsWith('#')) {
    return trimmed;
  }

  try {
    const parsed = new URL(trimmed, 'https://bwagro.com.br');
    if (['http:', 'https:', 'mailto:', 'tel:'].includes(parsed.protocol)) {
      return trimmed;
    }
  } catch {
    return null;
  }

  return null;
};

const sanitizeNode = (node: Node, doc: Document): Node | null => {
  if (node.nodeType === Node.TEXT_NODE) {
    return doc.createTextNode(node.textContent || '');
  }

  if (node.nodeType !== Node.ELEMENT_NODE) {
    return null;
  }

  const element = node as HTMLElement;
  const tagName = element.tagName.toLowerCase();

  if (!ALLOWED_TAGS.has(tagName)) {
    const fragment = doc.createDocumentFragment();
    for (const child of Array.from(element.childNodes)) {
      const sanitizedChild = sanitizeNode(child, doc);
      if (sanitizedChild) {
        fragment.appendChild(sanitizedChild);
      }
    }
    return fragment;
  }

  const cleanElement = doc.createElement(tagName);

  if (tagName === 'a') {
    const href = element.getAttribute('href');
    const safeHref = href ? sanitizeLinkHref(href) : null;

    if (safeHref) {
      cleanElement.setAttribute('href', safeHref);
      cleanElement.setAttribute('rel', 'noopener noreferrer nofollow');

      if (element.getAttribute('target') === '_blank') {
        cleanElement.setAttribute('target', '_blank');
      }
    }
  }

  for (const child of Array.from(element.childNodes)) {
    const sanitizedChild = sanitizeNode(child, doc);
    if (sanitizedChild) {
      cleanElement.appendChild(sanitizedChild);
    }
  }

  return cleanElement;
};

const sanitizeWithDomParser = (html: string): string => {
  const parser = new DOMParser();
  const parsed = parser.parseFromString(`<div>${html}</div>`, 'text/html');
  const sourceRoot = parsed.body.firstElementChild;
  const cleanDoc = document.implementation.createHTMLDocument('');
  const cleanRoot = cleanDoc.createElement('div');

  for (const child of Array.from(sourceRoot?.childNodes || [])) {
    const sanitizedChild = sanitizeNode(child, cleanDoc);
    if (sanitizedChild) {
      cleanRoot.appendChild(sanitizedChild);
    }
  }

  return cleanRoot.innerHTML.trim();
};

const sanitizeWithoutDomParser = (html: string): string =>
  html
    .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, '')
    .replace(/\son\w+="[^"]*"/gi, '')
    .replace(/\son\w+='[^']*'/gi, '')
    .replace(/javascript:/gi, '')
    .trim();

export const sanitizeRichTextHtml = (html: string): string => {
  const content = String(html || '');

  if (typeof window === 'undefined' || typeof DOMParser === 'undefined' || typeof document === 'undefined') {
    return sanitizeWithoutDomParser(content);
  }

  return sanitizeWithDomParser(content);
};
