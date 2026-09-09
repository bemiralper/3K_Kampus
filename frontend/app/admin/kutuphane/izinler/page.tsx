'use client';

import { Suspense } from 'react';
import KutuphaneIzinClient from '@/components/kutuphane/izin/KutuphaneIzinClient';

export default function IzinlerPage() {
  return (
    <Suspense fallback={<div style={{ padding: 24, color: '#64748b' }}>Yükleniyor…</div>}>
      <KutuphaneIzinClient />
    </Suspense>
  );
}
