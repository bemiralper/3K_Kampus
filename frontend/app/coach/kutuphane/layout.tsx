'use client';

import type { ReactNode } from 'react';
import { KutuphanePathProvider } from '@/components/kutuphane/KutuphanePathProvider';
import KutuphaneSubNav from '@/components/kutuphane/KutuphaneSubNav';
import { COACH_KUTUPHANE_BASE } from '@/lib/kutuphane-routes';

export default function CoachKutuphaneLayout({ children }: { children: ReactNode }) {
  return (
    <KutuphanePathProvider basePath={COACH_KUTUPHANE_BASE}>
      <div className="coach-kutuphane-shell">
        <KutuphaneSubNav variant="coach" />
        <div className="coach-kutuphane-content">{children}</div>
      </div>
    </KutuphanePathProvider>
  );
}
