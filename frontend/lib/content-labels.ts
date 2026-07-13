export type ContentPriority = 'normal' | 'bilgi' | 'onemli' | 'kritik';

export const CONTENT_PRIORITY_META: Record<
  ContentPriority,
  { label: string; color: string; bg: string; icon: string }
> = {
  normal: { label: 'Normal', color: '#475569', bg: '#f1f5f9', icon: '•' },
  bilgi: { label: 'Bilgi', color: '#0369a1', bg: '#e0f2fe', icon: 'ℹ' },
  onemli: { label: 'Önemli', color: '#b45309', bg: '#fef3c7', icon: '!' },
  kritik: { label: 'Kritik', color: '#b91c1c', bg: '#fee2e2', icon: '⚠' },
};

export const CONTENT_KIND_LABEL: Record<string, string> = {
  duyuru: 'Duyuru',
  haber: 'Haber',
  blog: 'Blog',
  etkinlik: 'Etkinlik',
};

export function formatContentDate(iso: string | null | undefined): string {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleDateString('tr-TR', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
  } catch {
    return iso;
  }
}

export function formatFileSize(bytes: number): string {
  if (!bytes) return '0 KB';
  const kb = bytes / 1024;
  if (kb < 1024) return `${Math.round(kb)} KB`;
  return `${(kb / 1024).toFixed(1)} MB`;
}

/** HTML/metin karşılaştırması — özet ile gövde aynıysa özet gösterilmez. */
export function plainTextFromHtml(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function shouldShowContentExcerpt(excerpt: string | undefined, bodyHtml: string | undefined): boolean {
  const ex = (excerpt || '').trim();
  const body = plainTextFromHtml(bodyHtml || '');
  if (!ex) return false;
  if (!body) return true;
  if (ex === body) return false;
  if (body.startsWith(ex)) return false;
  return true;
}
