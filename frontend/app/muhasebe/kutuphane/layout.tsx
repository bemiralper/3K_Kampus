'use client';

import type { ReactNode } from 'react';
import { KutuphanePathProvider } from '@/components/kutuphane/KutuphanePathProvider';
import KutuphaneSubNav from '@/components/kutuphane/KutuphaneSubNav';
import { MUHASEBE_KUTUPHANE_BASE } from '@/lib/kutuphane-routes';

export default function MuhasebeKutuphaneLayout({ children }: { children: ReactNode }) {
  return (
    <KutuphanePathProvider basePath={MUHASEBE_KUTUPHANE_BASE}>
      <KutuphaneSubNav variant="default" />
      {children}
    </KutuphanePathProvider>
  );
}
