'use client';

import CoachActionSheet from '@/components/coach/CoachActionSheet';
import StudyProgramEditor from '@/components/coaching/study-program/StudyProgramEditor';

interface CoachProgramSheetProps {
  studentId: number;
  studentName: string;
  coachId?: number;
  onClose: () => void;
  onSuccess?: () => void;
}

export default function CoachProgramSheet({
  studentId,
  studentName,
  coachId,
  onClose,
  onSuccess,
}: CoachProgramSheetProps) {
  return (
    <CoachActionSheet
      title="Çalışma Programı"
      subtitle="Haftalık programı düzenleyin"
      studentName={studentName}
      onClose={onClose}
      size="full"
    >
      <StudyProgramEditor
        lockedStudentId={studentId}
        lockedCoachId={coachId}
        embedded
      />
    </CoachActionSheet>
  );
}
