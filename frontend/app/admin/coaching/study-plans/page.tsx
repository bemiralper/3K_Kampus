'use client';

import { Suspense, useMemo } from 'react';
import { useSearchParams } from 'next/navigation';
import StudyPlanWorkspace from '@/components/coach/study-plans/StudyPlanWorkspace';

function AdminStudyPlanInner() {
  const searchParams = useSearchParams();
  const studentId = useMemo(() => {
    const raw = searchParams.get('student_id') || searchParams.get('student');
    if (!raw) return undefined;
    const n = parseInt(raw, 10);
    return Number.isFinite(n) ? n : undefined;
  }, [searchParams]);

  return (
    <div style={{ padding: 24 }}>
      <h1 style={{ margin: '0 0 8px', fontSize: 22 }}>Çalışma Programı</h1>
      <p style={{ margin: '0 0 16px', color: '#64748b' }}>
        Koçluk plan katmanı — ödev CRUD değişmez.
      </p>
      <StudyPlanWorkspace
        initialStudentId={studentId}
        templatesHref="/admin/coaching/study-plans"
        historyHref="/admin/coaching/study-plans"
      />
    </div>
  );
}

export default function AdminStudyPlansPage() {
  return (
    <Suspense fallback={<div style={{ padding: 24 }}>Yükleniyor…</div>}>
      <AdminStudyPlanInner />
    </Suspense>
  );
}
