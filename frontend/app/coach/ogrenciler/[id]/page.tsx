import { Suspense } from 'react';
import Student360Client from './Student360Client';
import { WorkspaceHeaderSkeleton } from '@/components/coach/student360/WorkspaceHeader';

interface PageProps {
  params: { id: string };
}

function Student360Fallback() {
  return (
    <div className="s360w-page">
      <WorkspaceHeaderSkeleton />
      <div className="s360w-content">
        <div className="s360-loading-grid">
          <div className="coach-skeleton" style={{ height: 96, borderRadius: 16 }} />
          <div className="coach-skeleton" style={{ height: 280, borderRadius: 18 }} />
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
