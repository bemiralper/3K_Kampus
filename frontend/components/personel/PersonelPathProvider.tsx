'use client';

import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import {
  ADMIN_PERSONEL_BASE,
  MUHASEBE_PERSONEL_BASE,
  getPersonelBasePath,
  personelHref,
} from '@/lib/muhasebe-routes';

export type PersonelPathContextValue = {
  basePath: string;
  isMuhasebeMode: boolean;
  href: (segment?: string) => string;
};

const PersonelPathContext = createContext<PersonelPathContextValue | null>(null);

const defaultValue: PersonelPathContextValue = {
  basePath: ADMIN_PERSONEL_BASE,
  isMuhasebeMode: false,
  href: (segment?: string) => personelHref(ADMIN_PERSONEL_BASE, segment),
};

export function PersonelPathProvider({
  basePath: basePathProp,
  children,
}: {
  basePath?: string;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const basePath = basePathProp ?? getPersonelBasePath(pathname);

  const value = useMemo<PersonelPathContextValue>(
    () => ({
      basePath,
      isMuhasebeMode: basePath === MUHASEBE_PERSONEL_BASE,
      href: (segment?: string) => personelHref(basePath, segment),
    }),
    [basePath],
  );

  return (
    <PersonelPathContext.Provider value={value}>{children}</PersonelPathContext.Provider>
  );
}

export function usePersonelPath(): PersonelPathContextValue {
  return useContext(PersonelPathContext) ?? defaultValue;
}
