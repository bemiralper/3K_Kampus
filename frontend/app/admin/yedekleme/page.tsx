import { Suspense } from 'react';
import YedeklemeClient from '@/components/yedekleme/YedeklemeClient';

export default function YedeklemePage() {
  return (
    <Suspense fallback={<div style={{ padding: 24 }}>Yedekleme yükleniyor…</div>}>
      <YedeklemeClient />
    </Suspense>
  );
}
