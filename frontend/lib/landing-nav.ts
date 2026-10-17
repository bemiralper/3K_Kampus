import { scrollToSection, queueLandingScroll, hardNavigate } from '@/lib/landing-theme';

export type NavItem = {
  label: string;
  href: string;
  id: string;
};

export const NAV_ITEMS: NavItem[] = [
  { label: 'Anasayfa', href: '/', id: 'anasayfa' },
  { label: 'Duyurular', href: '/#duyurular', id: 'duyurular' },
  { label: 'Sınav Takvimi', href: '/#sinav-takvimi', id: 'sinav-takvimi' },
  { label: '3K Sistemi', href: '/3k-sistemi', id: '3k-sistemi' },
  { label: 'İletişim', href: '/iletisim', id: 'iletisim' },
];

/**
 * Landing menü gezinmesi — cross-page hash için router.push yerine hardNavigate kullanır
 * (Next.js 14 App Router parallelRoutes.get hatasını önler).
 */
export function handleLandingNav(href: string, pathname: string) {
  // Ayrı sayfalar (ör. /3k-sistemi, /iletisim) — hash olmayan mutlak yollar
  if (/^\/[a-z0-9-]/i.test(href) && !href.startsWith('/#')) {
    if (pathname === href) {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } else {
      hardNavigate(href);
    }
    return;
  }

  if (href.startsWith('/#')) {
    const hash = href.slice(1);
    if (pathname === '/') {
      scrollToSection(hash);
    } else {
      queueLandingScroll(hash);
      hardNavigate('/');
    }
    return;
  }

  if (href === '/') {
    if (pathname === '/') scrollToSection('#anasayfa');
    else hardNavigate('/');
    return;
  }

  if (href.startsWith('#')) {
    // Aynı sayfada hedef varsa oraya kaydır (ör. /veri-silme#basvuru)
    if (typeof document !== 'undefined' && document.querySelector(href)) {
      scrollToSection(href);
      return;
    }
    if (pathname === '/') scrollToSection(href);
    else {
      queueLandingScroll(href);
      hardNavigate('/');
    }
    return;
  }

  scrollToSection(href);
}

export function navItemActiveId(pathname: string, scrollActiveId: string): string {
  if (pathname === '/3k-sistemi' || pathname.startsWith('/3k-sistemi/')) return '3k-sistemi';
  if (pathname === '/iletisim' || pathname.startsWith('/iletisim/')) return 'iletisim';
  if (pathname !== '/') return '';
  return scrollActiveId;
}

/**
 * Aktif bölüm, listedeki sabit sıraya göre değil sayfadaki dikey konuma göre seçilir.
 * Sınav Takvimi Duyuruların üstündeyse, Duyurulara inince hâlâ Sınav Takvimi seçili kalmasın.
 */
export function activeSectionFromRects(
  sections: { id: string; top: number }[],
  offset: number,
  fallback = 'anasayfa',
): string {
  const ordered = sections.slice().sort((a, b) => a.top - b.top);
  let current = fallback;
  for (const section of ordered) {
    if (section.top <= offset) current = section.id;
  }
  return current;
}
