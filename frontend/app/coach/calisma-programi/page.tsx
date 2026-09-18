'use client';

import { Suspense, useMemo } from 'react';
import { useSearchParams } from 'next/navigation';
import StudyPlanWorkspace from '@/components/coach/study-plans/StudyPlanWorkspace';

function CoachStudyPlanInner() {
  const searchParams = useSearchParams();
  const studentId = useMemo(() => {
    const raw = searchParams.get('student_id') || searchParams.get('student');
    if (!raw) return undefined;
    const n = parseInt(raw, 10);
    return Number.isFinite(n) ? n : undefined;
  }, [searchParams]);

  return (
    <div className="coach-calisma-page">
      <header className="coach-page-header">
        <div className="coach-page-header-text">
          <h2>Çalışma Programı</h2>
          <p>Öğrenci seçin, şablonu uygulayın — ödev birimleri günlere bölünür.</p>
        </div>
      </header>
      <StudyPlanWorkspace
        initialStudentId={studentId}
        templatesHref="/coach/calisma-programi/sablonlar"
        historyHref="/coach/calisma-programi/gecmis"
      />
    </div>
  );
}

export default function CoachStudyPlanPage() {
  return (
    <Suspense fallback={<div className="coach-empty-state"><p>Yükleniyor…</p></div>}>
      <CoachStudyPlanInner />
    </Suspense>
  );
}
