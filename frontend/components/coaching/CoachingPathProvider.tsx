'use client';

import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import {
  ADMIN_COACHING_BASE,
  MUHASEBE_COACHING_BASE,
  coachingHref,
  getCoachingBasePath,
} from '@/lib/coaching-routes';
import { getPersonelBasePath, muhasebeHomeHref } from '@/lib/muhasebe-routes';

export type CoachingPathContextValue = {
  basePath: string;
  isMuhasebeMode: boolean;
  portalHomeHref: string;
  portalHomeLabel: string;
  personelGorevlendirmeHref: string;
  href: (segment?: string) => string;
  coachDetailHref: (coachId: number | string) => string;
};

const defaultValue: CoachingPathContextValue = {
  basePath: ADMIN_COACHING_BASE,
  isMuhasebeMode: false,
  portalHomeHref: '/dashboard',
  portalHomeLabel: 'Ana Sayfa',
  personelGorevlendirmeHref: '/personel/gorevlendirmeler',
  href: (segment?: string) => coachingHref(ADMIN_COACHING_BASE, segment),
  coachDetailHref: (coachId) => `${ADMIN_COACHING_BASE}/coaches/${coachId}`,
};

const CoachingPathContext = createContext<CoachingPathContextValue | null>(null);

export function CoachingPathProvider({
  basePath: basePathProp,
  children,
}: {
  basePath?: string;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const basePath = basePathProp ?? getCoachingBasePath(pathname);

  const value = useMemo<CoachingPathContextValue>(() => {
    const isMuhasebeMode = basePath === MUHASEBE_COACHING_BASE;
    const personelBase = getPersonelBasePath(pathname);
    return {
      basePath,
      isMuhasebeMode,
      portalHomeHref: isMuhasebeMode ? muhasebeHomeHref() : '/dashboard',
      portalHomeLabel: isMuhasebeMode ? 'Muhasebe Portalı' : 'Ana Sayfa',
      personelGorevlendirmeHref: `${personelBase}/gorevlendirmeler`,
      href: (segment?: string) => coachingHref(basePath, segment),
      coachDetailHref: (coachId) => `${basePath}/coaches/${coachId}`,
    };
  }, [basePath, pathname]);

  return (
    <CoachingPathContext.Provider value={value}>{children}</CoachingPathContext.Provider>
  );
}

export function useCoachingPath(): CoachingPathContextValue {
  return useContext(CoachingPathContext) ?? defaultValue;
}
