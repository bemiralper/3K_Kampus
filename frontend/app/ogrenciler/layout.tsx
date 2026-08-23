'use client';

import type { ReactNode } from 'react';
import { CommunicationChatProvider } from '@/components/communication/CommunicationChatProvider';
import { OgrenciPathProvider } from '@/components/ogrenci/OgrenciPathProvider';
import MobileTableCards from '@/components/mobile/MobileTableCards';

export default function OgrencilerLayout({ children }: { children: ReactNode }) {
  return (
    <OgrenciPathProvider>
      <CommunicationChatProvider adminInbox>
        <div className="mobile-cards">
          <MobileTableCards />
          {children}
        </div>
      </CommunicationChatProvider>
    </OgrenciPathProvider>
  );
}
