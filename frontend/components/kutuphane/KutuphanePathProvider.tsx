'use client';

import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import {
  ADMIN_KUTUPHANE_BASE,
  COACH_KUTUPHANE_BASE,
  getKutuphaneBasePath,
  kutuphaneHref,
} from '@/lib/kutuphane-routes';

export type KutuphanePathContextValue = {
  basePath: string;
  isCoachMode: boolean;
  href: (segment?: string) => string;
};

const KutuphanePathContext = createContext<KutuphanePathContextValue | null>(null);

const defaultValue: KutuphanePathContextValue = {
  basePath: ADMIN_KUTUPHANE_BASE,
  isCoachMode: false,
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

  const value = useMemo<KutuphanePathContextValue>(
    () => ({
      basePath,
      isCoachMode: basePath === COACH_KUTUPHANE_BASE,
      href: (segment?: string) => kutuphaneHref(basePath, segment),
    }),
    [basePath],
  );

  return (
    <KutuphanePathContext.Provider value={value}>{children}</KutuphanePathContext.Provider>
  );
}

export function useKutuphanePath(): KutuphanePathContextValue {
  return useContext(KutuphanePathContext) ?? defaultValue;
}
