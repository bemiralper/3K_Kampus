'use client';

import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import {
  ADMIN_FINANS_BASE,
  MUHASEBE_FINANS_BASE,
  finansHref,
  getFinansBasePath,
  getPortalHomeHref,
  tahsilatRaporTabHref,
} from '@/lib/muhasebe-routes';

export type FinansPathContextValue = {
  basePath: string;
  isMuhasebeMode: boolean;
  href: (segment?: string) => string;
  homeHref: string;
  portalHomeHref: string;
  tahsilatTabHref: (tab: string, extraQuery?: Record<string, string>) => string;
};

const FinansPathContext = createContext<FinansPathContextValue | null>(null);

const defaultValue: FinansPathContextValue = {
  basePath: ADMIN_FINANS_BASE,
  isMuhasebeMode: false,
  href: (segment?: string) => finansHref(ADMIN_FINANS_BASE, segment),
  homeHref: ADMIN_FINANS_BASE,
  portalHomeHref: '/dashboard',
  tahsilatTabHref: (tab, extraQuery) => tahsilatRaporTabHref(ADMIN_FINANS_BASE, tab, extraQuery),
};

export function FinansPathProvider({
  basePath: basePathProp,
  children,
}: {
  basePath?: string;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const basePath = basePathProp ?? getFinansBasePath(pathname);

  const value = useMemo<FinansPathContextValue>(
    () => ({
      basePath,
      isMuhasebeMode: basePath === MUHASEBE_FINANS_BASE,
      href: (segment?: string) => finansHref(basePath, segment),
      homeHref: basePath,
      portalHomeHref: getPortalHomeHref(basePath),
      tahsilatTabHref: (tab, extraQuery) => tahsilatRaporTabHref(basePath, tab, extraQuery),
    }),
    [basePath],
  );

  return (
    <FinansPathContext.Provider value={value}>{children}</FinansPathContext.Provider>
  );
}

export function useFinansPath(): FinansPathContextValue {
  return useContext(FinansPathContext) ?? defaultValue;
}
