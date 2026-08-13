'use client';

import CoachActionSheet from '@/components/coach/CoachActionSheet';
import StudyProgramEditor from '@/components/coaching/study-program/StudyProgramEditor';

interface CoachProgramSheetProps {
  studentId: number;
  studentName: string;
  coachId?: number;
  /** Verilirse editör doğrudan bu programı açar */
  initialProgramId?: number;
  /** Ödevden gelen program aralığı (YYYY-MM-DD) */
  initialWeekStart?: string;
  initialWeekEnd?: string;
  initialHomeworkId?: number;
  onClose: () => void;
  onSuccess?: () => void;
}

export default function CoachProgramSheet({
  studentId,
  studentName,
  coachId,
  initialProgramId,
  initialWeekStart,
  initialWeekEnd,
  initialHomeworkId,
  onClose,
}: CoachProgramSheetProps) {
  return (
    <CoachActionSheet
      title="Çalışma programı"
      subtitle={studentName}
      onClose={onClose}
      size="full"
    >
      <StudyProgramEditor
        lockedStudentId={studentId}
        lockedCoachId={coachId}
        initialProgramId={initialProgramId}
        initialWeekStart={initialWeekStart}
        initialWeekEnd={initialWeekEnd}
        initialHomeworkId={initialHomeworkId}
        embedded
        coachLayout
      />
    </CoachActionSheet>
  );
}
