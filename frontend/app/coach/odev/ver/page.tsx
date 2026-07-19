'use client';

import { Suspense } from 'react';
import OdevVerWizard from '@/components/odev/OdevVerWizard';

export default function CoachOdevVerPage() {
  return (
    <Suspense fallback={<div className="coach-empty-state"><p>Yükleniyor…</p></div>}>
      <OdevVerWizard variant="coach" />
    </Suspense>
  );
}
