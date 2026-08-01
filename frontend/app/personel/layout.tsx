'use client';

import type { ReactNode } from 'react';
import { PersonelPathProvider } from '@/components/personel/PersonelPathProvider';
import { CommunicationChatProvider } from '@/components/communication/CommunicationChatProvider';

export default function PersonelLayout({ children }: { children: ReactNode }) {
  return (
    <PersonelPathProvider>
      <CommunicationChatProvider adminInbox>
        {children}
      </CommunicationChatProvider>
    </PersonelPathProvider>
  );
}
