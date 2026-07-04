'use client';

import type { ReactNode } from 'react';
import { PersonelPathProvider } from '@/components/personel/PersonelPathProvider';
import { MUHASEBE_PERSONEL_BASE } from '@/lib/muhasebe-routes';

export default function MuhasebePersonelLayout({ children }: { children: ReactNode }) {
  return <PersonelPathProvider basePath={MUHASEBE_PERSONEL_BASE}>{children}</PersonelPathProvider>;
}
