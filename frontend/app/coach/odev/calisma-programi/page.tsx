'use client';

import { Suspense, useMemo } from 'react';
import { useSearchParams } from 'next/navigation';
import StudyProgramEditor from '@/components/coaching/study-program/StudyProgramEditor';
import { useAuth } from '@/lib/contexts/AuthContext';

function CoachStudyProgramInner() {
  const searchParams = useSearchParams();
  const { user } = useAuth();
  const studentId = useMemo(() => {
    const raw = searchParams.get('student_id') || searchParams.get('student');
    if (!raw) return undefined;
    const n = parseInt(raw, 10);
    return Number.isFinite(n) ? n : undefined;
  }, [searchParams]);
  const weekStart = searchParams.get('week_start') || undefined;
  const weekEnd = searchParams.get('week_end') || undefined;
  const homeworkId = useMemo(() => {
    const raw = searchParams.get('homework_id') || searchParams.get('assignment_id');
    if (!raw) return undefined;
    const n = parseInt(raw, 10);
    return Number.isFinite(n) ? n : undefined;
  }, [searchParams]);

  return (
    <div className="coach-calisma-page">
      <header className="coach-page-header">
        <div className="coach-page-header-text">
          <h2>Çalışma Programı</h2>
          <p>Haftalık planı oluşturun, ödev havuzundan günlere dağıtın</p>
        </div>
      </header>
      <StudyProgramEditor
        lockedStudentId={studentId}
        lockedCoachId={user?.coach_profile_id ?? undefined}
        initialWeekStart={weekStart}
        initialWeekEnd={weekEnd}
        initialHomeworkId={homeworkId}
        coachLayout
      />
    </div>
  );
}

export default function CoachStudyProgramPage() {
  return (
    <Suspense fallback={<div className="coach-empty-state"><p>Yükleniyor…</p></div>}>
      <CoachStudyProgramInner />
    </Suspense>
  );
}
