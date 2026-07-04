'use client';

import { KaynakPathProvider } from '@/components/kaynak/KaynakPathProvider';
import KaynaklarPage from '@/app/admin/odev/kaynaklar/page';

export default function CoachKaynaklarPage() {
  return (
    <KaynakPathProvider basePath="coach">
      <KaynaklarPage />
    </KaynakPathProvider>
  );
}
