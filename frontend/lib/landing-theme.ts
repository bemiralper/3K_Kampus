/** 3K Kampüs landing page theme tokens */
export const LANDING_COLORS = {
  navy: '#1e3a5f',
  navyLight: '#2d5a87',
  accent: '#0262a7',
  lgs: '#0262a7',
  tyt: '#f97316',
  ayt: '#dc2626',
  white: '#ffffff',
  gray50: '#f8fafc',
  gray100: '#f1f5f9',
  gray200: '#e2e8f0',
  gray500: '#64748b',
  gray700: '#334155',
  gray900: '#0f172a',
} as const;

export const LANDING_KURUM_KOD = '3K';

/** Tüm kamu site sayfalarında tarayıcı sekmesi başlığı */
export const SITE_TAB_TITLE = '3K Kampüs';

export const SECTION_SCROLL_ORDER = [
  'anasayfa',
  'ders-formatlari',
  'duyurular',
  'sinav-takvimi',
  'iletisim',
] as const;

export const QUICK_ACCESS = [
  { label: 'Duyurular', href: '#duyurular', icon: 'megaphone' },
  { label: 'Grup & Özel Ders', href: '#ders-formatlari', icon: 'users' },
  { label: 'Sınav Takvimi', href: '#sinav-takvimi', icon: 'calendar' },
  { label: 'Adres', href: '#iletisim', icon: 'map' },
  { label: 'İletişim', href: '#iletisim', icon: 'phone' },
  { label: 'SSS', href: '#sss', icon: 'help' },
  { label: '3K Sistemi', href: '/3k-sistemi', icon: 'building', external: true },
] as const;

export function sinavTurColor(tur: string): string {
  switch (tur) {
    case 'LGS': return LANDING_COLORS.lgs;
    case 'TYT': return LANDING_COLORS.tyt;
    case 'AYT': return LANDING_COLORS.ayt;
    default: return LANDING_COLORS.accent;
  }
}

export function scrollToSection(href: string) {
  if (typeof window === 'undefined') return;
  const id = href.replace('#', '');
  const el = document.getElementById(id);
  if (!el) return;
  const headerOffset = 88;
  const top = el.getBoundingClientRect().top + window.scrollY - headerOffset;
  window.scrollTo({ top: Math.max(0, top), behavior: 'smooth' });
}

const LANDING_SCROLL_HASH_KEY = 'landing_scroll_hash';

/** Cross-page section scroll: navigate to / first, then scroll after mount. */
export function queueLandingScroll(hash: string) {
  const normalized = hash.startsWith('#') ? hash : `#${hash}`;
  try {
    sessionStorage.setItem(LANDING_SCROLL_HASH_KEY, normalized);
  } catch {
    /* ignore */
  }
}

/** App Router hash/client navigasyon bug'larından kaçınmak için tam sayfa geçişi */
export function hardNavigate(path: string) {
  if (typeof window === 'undefined') return;
  window.location.assign(path);
}

export function applyPendingLandingScroll() {
  if (typeof window === 'undefined') return;

  let hash: string | null = null;
  try {
    hash = sessionStorage.getItem(LANDING_SCROLL_HASH_KEY);
    if (hash) sessionStorage.removeItem(LANDING_SCROLL_HASH_KEY);
  } catch {
    /* ignore */
  }

  const target = hash || window.location.hash;
  if (!target) return;

  requestAnimationFrame(() => {
    setTimeout(() => scrollToSection(target), 80);
  });
}
