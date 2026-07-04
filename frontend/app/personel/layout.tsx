'use client';

import type { ReactNode } from 'react';
import { PersonelPathProvider } from '@/components/personel/PersonelPathProvider';

export default function PersonelLayout({ children }: { children: ReactNode }) {
  return <PersonelPathProvider>{children}</PersonelPathProvider>;
}
