import type { FooterLink } from '@/lib/website-api';

/** API footer boş/eksik olsa bile anasayfada gösterilecek yasal linkler */
export const DEFAULT_YASAL_FOOTER_LINKS: FooterLink[] = [
  { id: -101, kolon: 'yasal', etiket: 'KVKK', url: '/yasal/kvkk', sira: 0, aktif: true },
  { id: -102, kolon: 'yasal', etiket: 'Gizlilik Politikası', url: '/yasal/gizlilik', sira: 1, aktif: true },
  { id: -103, kolon: 'yasal', etiket: 'Kullanım Koşulları', url: '/yasal/kullanim', sira: 2, aktif: true },
  { id: -104, kolon: 'yasal', etiket: 'Çerez Politikası', url: '/yasal/cerez', sira: 3, aktif: true },
];

export function mergeFooterLinks(links: FooterLink[]): FooterLink[] {
  const merged = [...links];
  for (const def of DEFAULT_YASAL_FOOTER_LINKS) {
    const hasUrl = merged.some(
      (l) => l.kolon === 'yasal' && l.url.replace(/\/$/, '') === def.url,
    );
    const hasLabel = merged.some(
      (l) => l.kolon === 'yasal' && l.etiket.toLowerCase() === def.etiket.toLowerCase(),
    );
    if (!hasUrl && !hasLabel) {
      merged.push(def);
    }
  }
  return merged.sort((a, b) => {
    if (a.kolon !== b.kolon) return a.kolon.localeCompare(b.kolon);
    return (a.sira ?? 0) - (b.sira ?? 0);
  });
}
