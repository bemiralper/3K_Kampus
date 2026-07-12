import type { LandingBolum, SiteSettings } from '@/lib/website-api';
import { resolveLandingSectionOrder, isBolumSectionKey, bolumIdFromKey, isLandingSectionVisible } from '@/lib/landing-section-order';

export type QuickAccessCard = {
  key: string;
  label: string;
  href: string;
  icon: string;
  external?: boolean;
};

/** Anasayfa bölüm anahtarı → hızlı erişim kartı */
const SECTION_QUICK_ACCESS: Record<
  string,
  { defaultLabel: string; icon: string; href?: string; external?: boolean }
> = {
  duyurular: { defaultLabel: 'Duyurular', icon: 'megaphone' },
  'ders-formatlari': { defaultLabel: 'Grup & Özel Ders', icon: 'users' },
  'sinav-takvimi': { defaultLabel: 'Sınav Takvimi', icon: 'calendar' },
  sss: { defaultLabel: 'SSS', icon: 'help' },
  sistem3k: { defaultLabel: '3K Sistemi', icon: 'building', href: '/3k-sistemi', external: true },
  neden: { defaultLabel: 'Neden 3K?', icon: 'star' },
  yorumlar: { defaultLabel: 'Yorumlar', icon: 'star' },
};

const FIXED_TAIL: QuickAccessCard[] = [
  { key: 'adres', label: 'Adres', href: '/iletisim', icon: 'map' },
  { key: 'iletisim', label: 'İletişim', href: '/iletisim', icon: 'phone' },
];

function findBolum(settings: SiteSettings | null, id: string): LandingBolum | undefined {
  return settings?.landing_bolumleri?.find((b) => b.id === id);
}

function hrefForSection(key: string, settings: SiteSettings | null): string {
  const meta = SECTION_QUICK_ACCESS[key];
  if (meta?.href) return meta.href;
  if (key === 'sistem3k') return '/3k-sistemi';
  if (isBolumSectionKey(key)) {
    const id = bolumIdFromKey(key);
    const b = findBolum(settings, id);
    const anchor = b?.section_id || id;
    return `#${anchor}`;
  }
  return `#${key}`;
}

/** Anasayfa bölüm sırasına göre hızlı erişim kartlarını üretir */
export function buildQuickAccessCards(settings: SiteSettings | null): QuickAccessCard[] {
  const bolumIds = (settings?.landing_bolumleri ?? []).map((b) => b.id);
  const order = resolveLandingSectionOrder(settings?.landing_section_order, bolumIds);
  const cards: QuickAccessCard[] = [];

  for (const key of order) {
    if (key === 'quick-access') continue;
    if (!isLandingSectionVisible(key, settings)) continue;

    const meta = SECTION_QUICK_ACCESS[key];
    if (meta) {
      cards.push({
        key,
        label: meta.defaultLabel,
        href: hrefForSection(key, settings),
        icon: meta.icon,
        external: meta.external,
      });
      continue;
    }

    if (isBolumSectionKey(key)) {
      const id = bolumIdFromKey(key);
      const bolum = findBolum(settings, id);
      if (!bolum) continue;
      const label = bolum.kart_adi?.trim();
      if (!label) continue;
      cards.push({
        key,
        label,
        href: `#${bolum.section_id || bolum.id}`,
        icon: bolum.kart_ikon || 'star',
      });
    }
  }

  for (const fixed of FIXED_TAIL) {
    if (!cards.some((c) => c.key === fixed.key)) {
      cards.push(fixed);
    }
  }

  return cards;
}
