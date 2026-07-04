'use client';

import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import {
  ADMIN_KAYNAK_BASE,
  ADMIN_KAYNAK_HAVUZU_BASE,
  COACH_KAYNAK_BASE,
  COACH_KAYNAK_HAVUZU_BASE,
  getKaynakBasePath,
  getKaynakHavuzuBasePath,
  kaynakHref,
} from '@/lib/kaynak-routes';

export type KaynakPathContextValue = {
  kaynakBasePath: string;
  havuzBasePath: string;
  isCoachMode: boolean;
  kaynakHref: (segment?: string) => string;
  havuzHref: (segment?: string) => string;
};

const KaynakPathContext = createContext<KaynakPathContextValue | null>(null);

const defaultValue: KaynakPathContextValue = {
  kaynakBasePath: ADMIN_KAYNAK_BASE,
  havuzBasePath: ADMIN_KAYNAK_HAVUZU_BASE,
  isCoachMode: false,
  kaynakHref: (segment?: string) => kaynakHref(ADMIN_KAYNAK_BASE, segment),
  havuzHref: (segment?: string) => kaynakHref(ADMIN_KAYNAK_HAVUZU_BASE, segment),
};

export function KaynakPathProvider({
  basePath,
  children,
}: {
  basePath?: 'admin' | 'coach';
  children: ReactNode;
}) {
  const pathname = usePathname();

  const value = useMemo<KaynakPathContextValue>(() => {
    const isCoach = basePath === 'coach' || pathname?.startsWith('/coach/odev/kaynak') === true;
    const kaynakBase = isCoach ? COACH_KAYNAK_BASE : getKaynakBasePath(pathname);
    const havuzBase = isCoach ? COACH_KAYNAK_HAVUZU_BASE : getKaynakHavuzuBasePath(pathname);

    return {
      kaynakBasePath: kaynakBase,
      havuzBasePath: havuzBase,
      isCoachMode: isCoach,
      kaynakHref: (segment?: string) => kaynakHref(kaynakBase, segment),
      havuzHref: (segment?: string) => kaynakHref(havuzBase, segment),
    };
  }, [basePath, pathname]);

  return <KaynakPathContext.Provider value={value}>{children}</KaynakPathContext.Provider>;
}

export function useKaynakPath(): KaynakPathContextValue {
  return useContext(KaynakPathContext) ?? defaultValue;
}
