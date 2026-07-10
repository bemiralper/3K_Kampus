'use client';

import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import {
  ADMIN_ODEME_TAKIP_BASE,
  MUHASEBE_ODEME_TAKIP_BASE,
  getOdemeTakipBasePath,
  odemeTakipHref,
} from '@/lib/muhasebe-routes';

export type OdemePathContextValue = {
  basePath: string;
  isMuhasebeMode: boolean;
  href: (segment?: string) => string;
};

const OdemePathContext = createContext<OdemePathContextValue | null>(null);

const defaultValue: OdemePathContextValue = {
  basePath: ADMIN_ODEME_TAKIP_BASE,
  isMuhasebeMode: false,
  href: (segment?: string) => odemeTakipHref(ADMIN_ODEME_TAKIP_BASE, segment),
};

export function OdemePathProvider({
  basePath: basePathProp,
  children,
}: {
  basePath?: string;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const basePath = basePathProp ?? getOdemeTakipBasePath(pathname);

  const value = useMemo<OdemePathContextValue>(
    () => ({
      basePath,
      isMuhasebeMode: basePath === MUHASEBE_ODEME_TAKIP_BASE,
      href: (segment?: string) => odemeTakipHref(basePath, segment),
    }),
    [basePath],
  );

  return (
    <OdemePathContext.Provider value={value}>{children}</OdemePathContext.Provider>
  );
}

export function useOdemePath(): OdemePathContextValue {
  const ctx = useContext(OdemePathContext);
  const pathname = usePathname();

  return useMemo(() => {
    if (ctx) return ctx;
    const basePath = getOdemeTakipBasePath(pathname);
    return {
      basePath,
      isMuhasebeMode: basePath === MUHASEBE_ODEME_TAKIP_BASE,
      href: (segment?: string) => odemeTakipHref(basePath, segment),
    };
  }, [ctx, pathname]);
}
