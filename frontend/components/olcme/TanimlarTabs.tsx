'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useOlcmePath } from './useOlcmePath';
import s from './tanimlarTabs.module.css';

const TANIMLAR_TABS = [
  { segment: 'kazanimlar', label: 'Konu & Kazanımlar' },
  { segment: 'ayarlar', label: 'Puan Katsayıları' },
  { segment: 'oturum-gruplari', label: 'Oturum grupları' },
  { segment: 'salonlar', label: 'Sınav salonları' },
  { segment: 'daire-dizisi', label: 'Optik Formlar' },
  { segment: 'optik-okuma', label: 'Optik Okuma' },
] as const;

export default function TanimlarTabs() {
  const pathname = usePathname() || '';
  const { base, isCoach, href } = useOlcmePath();
  if (isCoach || !pathname.startsWith(base)) return null;

  return (
    <nav className={s.bar} aria-label="Tanımlar">
      {TANIMLAR_TABS.map(tab => {
        const tabHref = href(tab.segment);
        const on = pathname === tabHref || pathname.startsWith(`${tabHref}/`);
        return (
          <Link
            key={tab.segment}
            href={tabHref}
            className={on ? `${s.tab} ${s.on}` : s.tab}
            aria-current={on ? 'page' : undefined}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
