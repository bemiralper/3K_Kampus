'use client';

import { KaynakPathProvider } from '@/components/kaynak/KaynakPathProvider';
import StudentResourceDetailPage from '@/app/admin/odev/kaynak-havuzu/[studentId]/page';

export default function CoachKaynakHavuzuDetailPage() {
  return (
    <div className="coach-havuz-page">
      <KaynakPathProvider basePath="coach">
        <StudentResourceDetailPage />
      </KaynakPathProvider>
    </div>
  );
}
