'use client';

import type { ReactNode } from 'react';
import { CommunicationChatProvider } from '@/components/communication/CommunicationChatProvider';
import { OgrenciPathProvider } from '@/components/ogrenci/OgrenciPathProvider';

export default function OgrencilerLayout({ children }: { children: ReactNode }) {
  return (
    <OgrenciPathProvider>
      <CommunicationChatProvider adminInbox>
        {children}
      </CommunicationChatProvider>
    </OgrenciPathProvider>
  );
}
