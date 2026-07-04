'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { KUTUPHANE_NAV_ITEMS, kutuphaneHref } from '@/lib/kutuphane-routes';
import { useKutuphanePath } from './KutuphanePathProvider';
import './kutuphane-subnav.css';

function isNavActive(pathname: string, basePath: string, segment: string): boolean {
  const href = kutuphaneHref(basePath, segment);
  if (!segment) {
    return pathname === basePath || pathname === `${basePath}/`;
  }
  return pathname === href || pathname.startsWith(`${href}/`);
}

type KutuphaneSubNavProps = {
  variant?: 'default' | 'coach';
};

export default function KutuphaneSubNav({ variant = 'default' }: KutuphaneSubNavProps) {
  const pathname = usePathname();
  const { basePath, isCoachMode } = useKutuphanePath();
  const navClass = variant === 'coach' || isCoachMode ? 'coach-kutuphane-subnav' : 'kutuphane-subnav';

  return (
    <nav className={navClass} aria-label="Kütüphane alt menüsü">
      <div className={`${navClass}-scroll`}>
        {KUTUPHANE_NAV_ITEMS.map((item) => {
          const href = kutuphaneHref(basePath, item.segment);
          const active = isNavActive(pathname, basePath, item.segment);
          return (
            <Link
              key={item.segment || 'dashboard'}
              href={href}
              className={`${navClass}-item${active ? ' is-active' : ''}`}
              aria-current={active ? 'page' : undefined}
            >
              <span className={`${navClass}-icon`} aria-hidden>
                {item.icon}
              </span>
              <span className={`${navClass}-label`}>{item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
