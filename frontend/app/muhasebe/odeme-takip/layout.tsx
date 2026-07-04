'use client';

import type { ReactNode } from 'react';
import { OdemePathProvider } from '@/components/odeme-takip/OdemePathProvider';
import { OgrenciPathProvider } from '@/components/ogrenci/OgrenciPathProvider';
import { MUHASEBE_ODEME_TAKIP_BASE, MUHASEBE_OGRENCI_BASE } from '@/lib/muhasebe-routes';

export default function MuhasebeOdemeTakipLayout({ children }: { children: ReactNode }) {
  return (
    <OgrenciPathProvider basePath={MUHASEBE_OGRENCI_BASE}>
      <OdemePathProvider basePath={MUHASEBE_ODEME_TAKIP_BASE}>{children}</OdemePathProvider>
    </OgrenciPathProvider>
  );
}
