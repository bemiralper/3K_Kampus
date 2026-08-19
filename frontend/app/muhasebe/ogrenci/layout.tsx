'use client';

import type { ReactNode } from 'react';
import { OgrenciPathProvider } from '@/components/ogrenci/OgrenciPathProvider';
import { OdemePathProvider } from '@/components/odeme-takip/OdemePathProvider';
import { MUHASEBE_OGRENCI_BASE, MUHASEBE_ODEME_TAKIP_BASE } from '@/lib/muhasebe-routes';

export default function MuhasebeOgrenciLayout({ children }: { children: ReactNode }) {
  return (
    <OgrenciPathProvider basePath={MUHASEBE_OGRENCI_BASE}>
      <OdemePathProvider basePath={MUHASEBE_ODEME_TAKIP_BASE}>
        {children}
      </OdemePathProvider>
    </OgrenciPathProvider>
  );
}
