'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { COACHING_NAV_ITEMS, coachingHref } from '@/lib/coaching-routes';
import { useCoachingPath } from './CoachingPathProvider';
import './coaching-subnav.css';

function isNavActive(pathname: string, basePath: string, segment: string): boolean {
  const href = coachingHref(basePath, segment);
  return pathname === href || pathname.startsWith(`${href}/`);
}

export default function CoachingSubNav() {
  const pathname = usePathname();
  const { basePath } = useCoachingPath();

  return (
    <nav className="coaching-subnav" aria-label="Koçluk alt menüsü">
      <div className="coaching-subnav-scroll">
        {COACHING_NAV_ITEMS.map((item) => {
          const href = coachingHref(basePath, item.segment);
          const active = isNavActive(pathname, basePath, item.segment);
          return (
            <Link
              key={item.segment}
              href={href}
              className={`coaching-subnav-item${active ? ' is-active' : ''}`}
              aria-current={active ? 'page' : undefined}
            >
              {item.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
