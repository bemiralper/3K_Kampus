'use client';

import { usePathname } from 'next/navigation';
import { COACH_OLCME_BASE, getOlcmeBasePath, olcmeHref } from '@/lib/olcme-routes';

export function useOlcmePath() {
  const pathname = usePathname();
  const base = getOlcmeBasePath(pathname);
  return {
    base,
    isCoach: base === COACH_OLCME_BASE,
    href: (segment?: string) => olcmeHref(base, segment),
  };
}
