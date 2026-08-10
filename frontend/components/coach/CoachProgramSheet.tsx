'use client';

import CoachActionSheet from '@/components/coach/CoachActionSheet';
import StudyProgramEditor from '@/components/coaching/study-program/StudyProgramEditor';

interface CoachProgramSheetProps {
  studentId: number;
  studentName: string;
  coachId?: number;
  /** Verilirse editör doğrudan bu programı açar */
  initialProgramId?: number;
  onClose: () => void;
  onSuccess?: () => void;
}

export default function CoachProgramSheet({
  studentId,
  studentName,
  coachId,
  initialProgramId,
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
        embedded
      />
    </CoachActionSheet>
  );
}
