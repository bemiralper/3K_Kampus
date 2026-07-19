'use client';

import { Suspense } from 'react';
import OdevVerWizard from '@/components/odev/OdevVerWizard';

export default function OdevVerPage() {
  return (
    <Suspense fallback={<div style={{ padding: 24 }}>Yükleniyor…</div>}>
      <OdevVerWizard variant="admin" />
    </Suspense>
  );
}
