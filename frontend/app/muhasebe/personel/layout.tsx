'use client';

import type { ReactNode } from 'react';
import { PersonelPathProvider } from '@/components/personel/PersonelPathProvider';
import { CommunicationChatProvider } from '@/components/communication/CommunicationChatProvider';
import { MUHASEBE_PERSONEL_BASE } from '@/lib/muhasebe-routes';

export default function MuhasebePersonelLayout({ children }: { children: ReactNode }) {
  return (
    <PersonelPathProvider basePath={MUHASEBE_PERSONEL_BASE}>
      <CommunicationChatProvider adminInbox>
        {children}
      </CommunicationChatProvider>
    </PersonelPathProvider>
  );
}
