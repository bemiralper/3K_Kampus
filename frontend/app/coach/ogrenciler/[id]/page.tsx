import { Suspense } from 'react';
import Student360Client from './Student360Client';
import { Student360HeaderSkeleton } from '@/components/coach/Student360Header';

interface PageProps {
  params: { id: string };
}

function Student360Fallback() {
  return (
    <div className="student360-page">
      <aside className="s360-context-rail" aria-label="Öğrenci bilgileri yükleniyor">
        <Student360HeaderSkeleton />
        <div className="coach-skeleton" style={{ height: 188, borderRadius: 17 }} />
      </aside>
      <div className="student360-main">
        <div className="student360-content">
          <div className="s360-loading-grid">
            <div className="coach-skeleton" style={{ height: 104, borderRadius: 16 }} />
            <div className="coach-skeleton" style={{ height: 280, borderRadius: 18 }} />
          </div>
        </div>
      </div>
    </div>
  );
}

export default function CoachStudent360Page({ params }: PageProps) {
  const studentId = Number(params.id);

  if (!Number.isFinite(studentId) || studentId <= 0) {
    return (
      <div className="coach-error-banner" style={{ margin: 24 }}>
        Geçersiz öğrenci kimliği.
      </div>
    );
  }

  return (
    <Suspense fallback={<Student360Fallback />}>
      <Student360Client studentId={studentId} />
    </Suspense>
  );
}
