'use client';

import type { ReactNode } from 'react';
import { CoachingPathProvider } from '@/components/coaching/CoachingPathProvider';
import CoachingSubNav from '@/components/coaching/CoachingSubNav';
import { MUHASEBE_COACHING_BASE } from '@/lib/coaching-routes';

export default function MuhasebeCoachingLayout({ children }: { children: ReactNode }) {
  return (
    <CoachingPathProvider basePath={MUHASEBE_COACHING_BASE}>
      <CoachingSubNav />
      {children}
    </CoachingPathProvider>
  );
}
