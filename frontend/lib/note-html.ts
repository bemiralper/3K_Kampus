const ALLOWED_TAGS = new Set(['B', 'STRONG', 'I', 'EM', 'U', 'SPAN', 'BR', 'DIV', 'P']);

function isAllowedColor(value: string): boolean {
  const v = value.trim().toLowerCase();
  return /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(v)
    || /^rgb\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}\s*\)$/.test(v);
}

type InlineFormat = {
  color: string;
  bold: boolean;
  italic: boolean;
  underline: boolean;
};

function parseInlineStyle(style: string): InlineFormat {
  const fmt: InlineFormat = { color: '', bold: false, italic: false, underline: false };
  style.split(';').forEach((part) => {
    const colon = part.indexOf(':');
    if (colon < 0) return;
    const prop = part.slice(0, colon).trim().toLowerCase();
    const val = part.slice(colon + 1).trim().toLowerCase();
    if (prop === 'color' && isAllowedColor(val)) fmt.color = val;
    if (prop === 'font-weight' && /^(bold|[7-9]00)$/.test(val)) fmt.bold = true;
    if (prop === 'font-style' && val === 'italic') fmt.italic = true;
    if ((prop === 'text-decoration' || prop === 'text-decoration-line') && val.includes('underline')) {
      fmt.underline = true;
    }
  });
  return fmt;
}

function wrapFormats(node: Node, fmt: InlineFormat, doc: Document): Node {
  let next = node;
  if (fmt.underline) {
    const u = doc.createElement('u');
    u.appendChild(next);
    next = u;
  }
  if (fmt.italic) {
    const i = doc.createElement('i');
    i.appendChild(next);
    next = i;
  }
  if (fmt.bold) {
    const b = doc.createElement('b');
    b.appendChild(next);
    next = b;
  }
  return next;
}

function fontColor(el: HTMLElement): string {
  const attr = el.getAttribute('color') || '';
  if (isAllowedColor(attr)) return attr.trim();
  return parseInlineStyle(el.getAttribute('style') || '').color;
}

function sanitizeNode(node: Node, doc: Document): Node | null {
  if (node.nodeType === Node.TEXT_NODE) {
    return doc.createTextNode(node.textContent || '');
  }
  if (node.nodeType !== Node.ELEMENT_NODE) return null;
  const el = node as HTMLElement;
  const tag = el.tagName.toUpperCase();
  if (tag === 'FONT') {
    const fmt = parseInlineStyle(el.getAttribute('style') || '');
    fmt.color = fontColor(el) || fmt.color;
    const next = doc.createElement('span');
    if (fmt.color) next.setAttribute('style', `color: ${fmt.color}`);
    el.childNodes.forEach((child) => {
      const clean = sanitizeNode(child, doc);
      if (clean) next.appendChild(clean);
    });
    return wrapFormats(next, fmt, doc);
  }
  if (!ALLOWED_TAGS.has(tag)) {
    const frag = doc.createDocumentFragment();
    el.childNodes.forEach((child) => {
      const clean = sanitizeNode(child, doc);
      if (clean) frag.appendChild(clean);
    });
    return frag;
  }
  const next = doc.createElement(tag === 'STRONG' ? 'b' : tag === 'EM' ? 'i' : tag.toLowerCase());
  if (tag === 'SPAN') {
    const fmt = parseInlineStyle(el.getAttribute('style') || '');
    if (fmt.color) next.setAttribute('style', `color: ${fmt.color}`);
    el.childNodes.forEach((child) => {
      const clean = sanitizeNode(child, doc);
      if (clean) next.appendChild(clean);
    });
    if (!fmt.color) {
      const frag = doc.createDocumentFragment();
      while (next.firstChild) frag.appendChild(next.firstChild);
      if (!fmt.bold && !fmt.italic && !fmt.underline) return frag;
      return wrapFormats(frag, fmt, doc);
    }
    return wrapFormats(next, fmt, doc);
  }
  el.childNodes.forEach((child) => {
    const clean = sanitizeNode(child, doc);
    if (clean) next.appendChild(clean);
  });
  return next;
}

/** Ödev notu HTML — yalnızca kalın/italik/altı çizili/renk. */
export function sanitizeNoteHtml(html: string): string {
  if (!html) return '';
  if (typeof window === 'undefined' || typeof DOMParser === 'undefined') {
    return html
      .replace(/<font[^>]*\scolor=["']?([^"'>\s]+)["']?[^>]*>/gi, '<span style="color:$1">')
      .replace(/<\/font>/gi, '</span>')
      .replace(/<(?!\/?(?:b|strong|i|em|u|span|br|div|p)\b)[^>]*>/gi, '');
  }
  const doc = new DOMParser().parseFromString(`<div>${html}</div>`, 'text/html');
  const root = doc.body.firstElementChild;
  if (!root) return '';
  const out = doc.createElement('div');
  root.childNodes.forEach((child) => {
    const clean = sanitizeNode(child, doc);
    if (clean) out.appendChild(clean);
  });
  return out.innerHTML;
}

export function htmlToPlainText(html: string): string {
  if (!html) return '';
  if (!html.includes('<')) return html.replace(/\s+/g, ' ').trim();
  if (typeof window === 'undefined' || typeof DOMParser === 'undefined') {
    return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  }
  const doc = new DOMParser().parseFromString(`<div>${html}</div>`, 'text/html');
  return (doc.body.textContent || '').replace(/\s+/g, ' ').trim();
}

export function isEmptyNoteHtml(html: string): boolean {
  return htmlToPlainText(html).length === 0;
}

export function looksLikeNoteHtml(value: string): boolean {
  return /<\/?(?:b|strong|i|em|u|span|br|div|p|font)\b/i.test(value);
}

/** Görüntüleme: satır sonlarını koru, güvenli HTML üret. */
export function noteHtmlForDisplay(html: string): string {
  return sanitizeNoteHtml(html).replace(/\n/g, '<br>');
}
