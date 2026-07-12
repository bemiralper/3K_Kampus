'use client';

import { usePathname } from 'next/navigation';
import type { SiteSettings } from '@/lib/website-api';
import { scrollToSection, queueLandingScroll, hardNavigate } from '@/lib/landing-theme';
import { handleLandingNav } from '@/lib/landing-nav';
import { buildQuickAccessCards } from '@/lib/landing-quick-access';

const ICONS: Record<string, React.ReactNode> = {
  megaphone: <path d="M18 11v2h4v-2h-4zm-2 6H6l-4 4V4l4 4h10v2H6.5L8 9.5 6 11V4h10v13z"/>,
  users: <path d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z"/>,
  calendar: <path d="M19 3h-1V1h-2v2H8V1H6v2H5c-1.11 0-2 .9-2 2v14c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H5V8h14v11z"/>,
  map: <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/>,
  phone: <path d="M6.62 10.79c1.44 2.83 3.76 5.14 6.59 6.59l2.2-2.2c.27-.27.67-.36 1.02-.24 1.12.37 2.33.57 3.57.57.55 0 1 .45 1 1V20c0 .55-.45 1-1 1-9.39 0-17-7.61-17-17 0-.55.45-1 1-1h3.5c.55 0 1 .45 1 1 0 1.25.2 2.45.57 3.57.11.35.03.74-.25 1.02l-2.2 2.2z"/>,
  help: <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 17h-2v-2h2v2zm2.07-7.75l-.9.92C13.45 12.9 13 13.5 13 15h-2v-.5c0-1.1.45-2.1 1.17-2.83l1.24-1.26c.37-.36.59-.86.59-1.41 0-1.1-.9-2-2-2s-2 .9-2 2H8c0-2.21 1.79-4 4-4s4 1.79 4 4c0 .88-.36 1.68-.93 2.25z"/>,
  building: <path d="M12 7V3H2v18h20V7H12zM6 19H4v-2h2v2zm0-4H4v-2h2v2zm0-4H4v-2h2v2zm0-4H4V7h2v2zm4 12H8v-2h2v2zm0-4H8v-2h2v2zm0-4H8v-2h2v2zm0-4H8V7h2v2zm10 12h-8v-2h2v-2h-2v-2h2v-2h-2V9h8v10zm-2-8h-2v2h2v-2zm0 4h-2v2h2v-2z"/>,
  star: <path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z"/>,
};

type Props = {
  settings?: SiteSettings | null;
};

export default function QuickAccessCards({ settings = null }: Props) {
  const pathname = usePathname();
  const cards = buildQuickAccessCards(settings);

  const onCardClick = (href: string, external?: boolean) => {
    if (external || href.startsWith('/')) {
      handleLandingNav(href, pathname);
      return;
    }
    if (pathname !== '/') {
      queueLandingScroll(href);
      hardNavigate('/');
      return;
    }
    scrollToSection(href);
  };

  if (cards.length === 0) return null;

  return (
    <section className="relative z-10 mx-auto -mt-4 max-w-7xl px-4 sm:-mt-6 lg:-mt-8 lg:px-8">
      <div className="flex flex-wrap items-stretch justify-center gap-2.5 sm:gap-3">
        {cards.map((card) => (
          <button
            key={card.key}
            type="button"
            onClick={() => onCardClick(card.href, card.external)}
            className="group flex w-[calc(50%-0.35rem)] flex-col items-center gap-1.5 rounded-xl border border-slate-200/80 bg-white p-3 shadow-sm transition hover:-translate-y-0.5 hover:border-[#0262a7]/30 hover:shadow-md sm:w-[140px] sm:gap-2 sm:rounded-2xl sm:p-4"
          >
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#1e3a5f]/5 text-[#1e3a5f] transition group-hover:bg-[#0262a7] group-hover:text-white">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">{ICONS[card.icon] || ICONS.star}</svg>
            </span>
            <span className="text-center text-[11px] font-medium leading-tight text-slate-700 sm:text-xs">{card.label}</span>
          </button>
        ))}
      </div>
    </section>
  );
}
