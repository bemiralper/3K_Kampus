'use client';

import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import {
  ADMIN_OGRENCI_BASE,
  MUHASEBE_OGRENCI_BASE,
  getOgrenciBasePath,
  ogrenciHref,
  muhasebeHomeHref,
} from '@/lib/muhasebe-routes';

export type OgrenciPathContextValue = {
  basePath: string;
  isMuhasebeMode: boolean;
  href: (segment?: string) => string;
  listHref: string;
  portalHomeHref: string;
};

const OgrenciPathContext = createContext<OgrenciPathContextValue | null>(null);

const defaultValue: OgrenciPathContextValue = {
  basePath: ADMIN_OGRENCI_BASE,
  isMuhasebeMode: false,
  href: (segment?: string) => ogrenciHref(ADMIN_OGRENCI_BASE, segment),
  listHref: ADMIN_OGRENCI_BASE,
  portalHomeHref: '/dashboard',
};

export function OgrenciPathProvider({
  basePath: basePathProp,
  children,
}: {
  basePath?: string;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const basePath = basePathProp ?? getOgrenciBasePath(pathname);

  const value = useMemo<OgrenciPathContextValue>(
    () => ({
      basePath,
      isMuhasebeMode: basePath === MUHASEBE_OGRENCI_BASE,
      href: (segment?: string) => {
        if (basePath === MUHASEBE_OGRENCI_BASE) {
          if (!segment) return `${basePath}/liste`;
          if (/^\d+$/.test(segment)) return `${basePath}/liste/${segment}`;
          return ogrenciHref(basePath, segment);
        }
        if (!segment) return basePath;
        return ogrenciHref(basePath, segment);
      },
      listHref: basePath === MUHASEBE_OGRENCI_BASE ? `${basePath}/liste` : basePath,
      portalHomeHref: basePath === MUHASEBE_OGRENCI_BASE ? muhasebeHomeHref() : '/dashboard',
    }),
    [basePath],
  );

  return (
    <OgrenciPathContext.Provider value={value}>{children}</OgrenciPathContext.Provider>
  );
}

export function useOgrenciPath(): OgrenciPathContextValue {
  const ctx = useContext(OgrenciPathContext);
  const pathname = usePathname();

  return useMemo(() => {
    if (ctx) return ctx;
    const basePath = getOgrenciBasePath(pathname);
    return {
      basePath,
      isMuhasebeMode: basePath === MUHASEBE_OGRENCI_BASE,
      href: (segment?: string) => {
        if (basePath === MUHASEBE_OGRENCI_BASE) {
          if (!segment) return `${basePath}/liste`;
          if (/^\d+$/.test(segment)) return `${basePath}/liste/${segment}`;
          return ogrenciHref(basePath, segment);
        }
        if (!segment) return basePath;
        return ogrenciHref(basePath, segment);
      },
      listHref: basePath === MUHASEBE_OGRENCI_BASE ? `${basePath}/liste` : basePath,
      portalHomeHref: basePath === MUHASEBE_OGRENCI_BASE ? muhasebeHomeHref() : '/dashboard',
    };
  }, [ctx, pathname]);
}
