/** Görev açıklaması HTML yardımcıları. Sunucu temizlemesi asıl güvenlik sınırıdır. */
import DOMPurify from 'dompurify';

const HTML_TAG = /<\/?(p|div|h1|h2|h3|ul|ol|li|table|thead|tbody|tr|td|th|img|a|blockquote|pre|span|strong|em|u|s|sub|sup|br|hr|mark|code|input)\b/i;

const DOSYA_SRC = /^\/(?:api\/)?gorev\/api\/dosyalar\/([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})\/?$/;

const FONTS = new Set([
  'arial', 'georgia', 'times new roman', 'courier new', 'verdana', 'tahoma', 'trebuchet ms',
]);

export function looksLikeHtml(value: string): boolean {
  return HTML_TAG.test(value || '');
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function toEditorHtml(value: string): string {
  if (!value) return '';
  if (looksLikeHtml(value)) return value;
  return value
    .split(/\n{2,}/)
    .map(block => `<p>${escapeHtml(block).replace(/\n/g, '<br>')}</p>`)
    .join('');
}

export function normalizeOutgoing(html: string): string {
  const trimmed = (html || '').trim();
  if (!trimmed) return '';
  const text = trimmed
    .replace(/<br\s*\/?>/gi, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/<[^>]+>/g, '')
    .trim();
  const hasMedia = /<img\b|data-latex=|data-dosya-id=|<table\b/i.test(trimmed);
  if (!text && !hasMedia) return '';
  return trimmed;
}

export function normalizeDosyaSrc(value: string): string | null {
  const match = DOSYA_SRC.exec((value || '').trim());
  if (!match) return null;
  return `/api/gorev/api/dosyalar/${match[1].toLowerCase()}/`;
}

export function normalizeHref(value: string): string | null {
  const raw = (value || '').trim();
  if (!raw || raw.startsWith('//') || /^(javascript|vbscript|data):/i.test(raw)) return null;
  const dosya = normalizeDosyaSrc(raw);
  if (dosya) return dosya;
  if (/^https?:\/\/\S+$/i.test(raw) || /^mailto:\S+$/i.test(raw)) return raw;
  return null;
}

export function extractDosyaIds(value: string): string[] {
  const found = new Set<string>();
  const re = /(?:\/gorev\/api\/dosyalar\/|data-dosya-id=["'])([0-9a-fA-F-]{36})/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(value || ''))) found.add(match[1].toLowerCase());
  return [...found];
}

function sanitizeStyle(value: string): string {
  const kept: string[] = [];
  for (const part of (value || '').split(';')) {
    const idx = part.indexOf(':');
    if (idx < 0) continue;
    const prop = part.slice(0, idx).trim().toLowerCase();
    const raw = part.slice(idx + 1).trim();
    if (!raw || /url\s*\(|expression|javascript|@import/i.test(raw)) continue;
    if ((prop === 'color' || prop === 'background-color') && !/^(#[0-9a-fA-F]{3,8}|rgb\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}\s*\)|[a-zA-Z]{1,20})$/.test(raw)) continue;
    if (prop === 'text-align' && !['left', 'center', 'right', 'justify'].includes(raw)) continue;
    if (prop === 'font-size' && !/^\d{1,2}(\.\d+)?(px|pt|rem|em)$/.test(raw)) continue;
    if (prop === 'font-family') {
      const families = raw.split(',').map(item => item.trim().replace(/^['"]|['"]$/g, '')).filter(name => FONTS.has(name.toLowerCase()));
      if (!families.length) continue;
      kept.push(`font-family: ${families.join(', ')}`);
      continue;
    }
    if (['width', 'max-width', 'margin-left'].includes(prop) && !/^\d{1,4}(\.\d+)?(px|%|em|rem)$/.test(raw)) continue;
    if (prop === 'line-height' && !/^(\d(\.\d{1,2})?|\d{1,2}(\.\d+)?(px|em))$/.test(raw)) continue;
    if (!['color', 'background-color', 'text-align', 'font-size', 'line-height', 'width', 'max-width', 'margin-left', 'text-decoration', 'vertical-align'].includes(prop)) continue;
    kept.push(`${prop}: ${raw}`);
  }
  return kept.join('; ');
}

const ALLOWED_TAGS = [
  'a', 'blockquote', 'br', 'code', 'div', 'em', 'h1', 'h2', 'h3', 'hr', 'i', 'img', 'input',
  'li', 'mark', 'ol', 'p', 'pre', 's', 'span', 'strong', 'sub', 'sup', 'table', 'tbody', 'td',
  'th', 'thead', 'tr', 'u', 'ul', 'b', 'col', 'colgroup',
];

const ALLOWED_ATTR = [
  'href', 'src', 'alt', 'title', 'class', 'style', 'target', 'rel', 'width', 'height',
  'colspan', 'rowspan', 'align', 'type', 'checked', 'disabled', 'start',
  'data-type', 'data-latex', 'data-dosya-id', 'data-name', 'data-size', 'data-mime', 'data-align', 'data-checked',
];

let hookReady = false;

export function sanitizeGorevHtml(input: string): string {
  if (typeof window === 'undefined') return '';
  const purifier = DOMPurify(window);
  if (!hookReady) {
    hookReady = true;
    purifier.addHook('uponSanitizeAttribute', (node, data) => {
      if (data.attrName === 'style') {
        const clean = sanitizeStyle(data.attrValue);
        if (!clean) data.keepAttr = false;
        else data.attrValue = clean;
      }
      if (data.attrName === 'src') {
        const ok = node.nodeName === 'IMG' ? normalizeDosyaSrc(data.attrValue) : null;
        if (!ok) data.keepAttr = false;
        else data.attrValue = ok;
      }
      if (data.attrName === 'href') {
        const ok = normalizeHref(data.attrValue);
        if (!ok) data.keepAttr = false;
        else data.attrValue = ok;
      }
    });
  }
  const cleaned = purifier.sanitize(input || '', {
    ALLOWED_TAGS,
    ALLOWED_ATTR,
    ALLOW_DATA_ATTR: false,
    FORBID_TAGS: ['script', 'iframe', 'object', 'embed', 'style', 'link', 'meta', 'form', 'svg', 'math'],
  });
  return cleaned.replace(/<img\b(?![^>]*\ssrc=)[^>]*>/gi, '');
}

const KNOWN_TAGS = new Set([
  'p', 'h1', 'h2', 'h3', 'ul', 'ol', 'li', 'blockquote', 'pre', 'code', 'table', 'thead', 'tbody',
  'tr', 'th', 'td', 'img', 'a', 'span', 'strong', 'em', 'u', 's', 'sub', 'sup', 'br', 'hr', 'mark',
  'div', 'input', 'label', 'colgroup', 'col', 'b', 'i', 'strike',
]);

export function unknownTags(html: string): string[] {
  const seen = new Set<string>();
  const re = /<\/?([a-z0-9-]+)/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(html || ''))) {
    const tag = match[1].toLowerCase();
    if (!KNOWN_TAGS.has(tag)) seen.add(tag);
  }
  return [...seen];
}

export function featureCounts(html: string) {
  const count = (re: RegExp) => (html.match(re) || []).length;
  return {
    img: count(/<img\b/gi),
    table: count(/<table\b/gi),
    math: count(/data-latex=/gi),
    link: count(/<a\b/gi),
    file: count(/data-dosya-id=/gi),
  };
}

export function htmlWarnings(source: string): string[] {
  const warnings: string[] = [];
  const stack: string[] = [];
  const re = /<\/?([a-z0-9]+)(\s[^>]*)?>/gi;
  const voids = new Set(['br', 'hr', 'img', 'input', 'col']);
  let match: RegExpExecArray | null;
  while ((match = re.exec(source || ''))) {
    const tag = match[1].toLowerCase();
    const closing = match[0].startsWith('</');
    const selfClose = match[0].endsWith('/>') || voids.has(tag);
    if (closing) {
      const idx = stack.lastIndexOf(tag);
      if (idx < 0) warnings.push(`Kapanmayan veya fazla etiket: </${tag}>`);
      else stack.splice(idx, 1);
    } else if (!selfClose) {
      stack.push(tag);
    }
  }
  if (stack.length) warnings.push(`Açık kalan etiketler: ${stack.slice(0, 6).join(', ')}`);
  if (/<\s*script\b|javascript\s*:|on[a-z]+\s*=/i.test(source)) {
    warnings.push('Betik veya olay niteliği kaydedilirken reddedilir.');
  }
  return [...new Set(warnings)].slice(0, 4);
}

const VOID_TAGS = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'wbr']);

export function formatHtml(source: string): string {
  const compact = (source || '').replace(/>\s+</g, '><').trim();
  if (!compact) return '';
  const tokens = compact.split(/(<[^>]+>)/g).filter(Boolean);
  let depth = 0;
  const lines: string[] = [];
  for (const token of tokens) {
    if (token.startsWith('<')) {
      const name = (/^<\/?([a-z0-9]+)/i.exec(token)?.[1] || '').toLowerCase();
      const closing = token.startsWith('</');
      const selfClose = token.endsWith('/>') || VOID_TAGS.has(name);
      if (closing) depth = Math.max(0, depth - 1);
      lines.push(`${'  '.repeat(depth)}${token}`);
      if (!closing && !selfClose) depth += 1;
    } else if (token.trim()) {
      lines.push(`${'  '.repeat(depth)}${token.trim()}`);
    }
  }
  return lines.join('\n');
}

export function formatBytes(size: number): string {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}
