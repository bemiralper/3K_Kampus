import { Suspense } from 'react';
import Student360Client from './Student360Client';
import { Student360HeaderSkeleton } from '@/components/coach/Student360Header';

interface PageProps {
  params: { id: string };
}

function Student360Fallback() {
  return (
    <div className="student360-page">
      <div className="student360-main">
        <Student360HeaderSkeleton />
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
