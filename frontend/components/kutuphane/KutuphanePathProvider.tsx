'use client';

import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import {
  ADMIN_KUTUPHANE_BASE,
  COACH_KUTUPHANE_BASE,
  MUHASEBE_KUTUPHANE_BASE,
  getKutuphaneBasePath,
  kutuphaneHref,
} from '@/lib/kutuphane-routes';
import { muhasebeHomeHref } from '@/lib/muhasebe-routes';

export type KutuphanePathContextValue = {
  basePath: string;
  isCoachMode: boolean;
  isMuhasebeMode: boolean;
  portalHomeHref: string;
  portalHomeLabel: string;
  href: (segment?: string) => string;
};

const KutuphanePathContext = createContext<KutuphanePathContextValue | null>(null);

const defaultValue: KutuphanePathContextValue = {
  basePath: ADMIN_KUTUPHANE_BASE,
  isCoachMode: false,
  isMuhasebeMode: false,
  portalHomeHref: '/dashboard',
  portalHomeLabel: 'Ana Sayfa',
  href: (segment?: string) => kutuphaneHref(ADMIN_KUTUPHANE_BASE, segment),
};

export function KutuphanePathProvider({
  basePath: basePathProp,
  children,
}: {
  basePath?: string;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const basePath = basePathProp ?? getKutuphaneBasePath(pathname);

  const value = useMemo<KutuphanePathContextValue>(() => {
    const isCoachMode = basePath === COACH_KUTUPHANE_BASE;
    const isMuhasebeMode = basePath === MUHASEBE_KUTUPHANE_BASE;
    const hrefFn = (segment?: string) => kutuphaneHref(basePath, segment);
    return {
      basePath,
      isCoachMode,
      isMuhasebeMode,
      portalHomeHref: isCoachMode ? hrefFn() : isMuhasebeMode ? muhasebeHomeHref() : '/dashboard',
      portalHomeLabel: isCoachMode ? 'Koç Portalı' : isMuhasebeMode ? 'Muhasebe Portalı' : 'Ana Sayfa',
      href: hrefFn,
    };
  }, [basePath]);

  return (
    <KutuphanePathContext.Provider value={value}>{children}</KutuphanePathContext.Provider>
  );
}

export function useKutuphanePath(): KutuphanePathContextValue {
  return useContext(KutuphanePathContext) ?? defaultValue;
}
