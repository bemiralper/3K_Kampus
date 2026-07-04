'use client';

import type { ReactNode } from 'react';
import { KutuphanePathProvider } from '@/components/kutuphane/KutuphanePathProvider';
import KutuphaneSubNav from '@/components/kutuphane/KutuphaneSubNav';
import { ADMIN_KUTUPHANE_BASE } from '@/lib/kutuphane-routes';

export default function AdminKutuphaneLayout({ children }: { children: ReactNode }) {
  return (
    <KutuphanePathProvider basePath={ADMIN_KUTUPHANE_BASE}>
      <KutuphaneSubNav variant="default" />
      {children}
    </KutuphanePathProvider>
  );
}
