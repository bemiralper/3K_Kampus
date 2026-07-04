'use client';

import { KaynakPathProvider } from '@/components/kaynak/KaynakPathProvider';
import StudentResourcePoolPage from '@/app/admin/odev/kaynak-havuzu/page';

export default function CoachKaynakHavuzuPage() {
  return (
    <KaynakPathProvider basePath="coach">
      <StudentResourcePoolPage />
    </KaynakPathProvider>
  );
}
