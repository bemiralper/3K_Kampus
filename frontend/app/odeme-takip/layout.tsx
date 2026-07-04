'use client';

import type { ReactNode } from 'react';
import { OdemePathProvider } from '@/components/odeme-takip/OdemePathProvider';

export default function OdemeTakipLayout({ children }: { children: ReactNode }) {
  return <OdemePathProvider>{children}</OdemePathProvider>;
}
