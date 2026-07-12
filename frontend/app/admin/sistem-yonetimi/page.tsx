import { Suspense } from 'react';
import SistemYonetimiClient from '@/components/sistem-yonetimi/SistemYonetimiClient';

export default function SistemYonetimiPage() {
  return (
    <Suspense fallback={<div style={{ padding: 24 }}>Sistem Yönetimi yükleniyor...</div>}>
      <SistemYonetimiClient />
    </Suspense>
  );
}
