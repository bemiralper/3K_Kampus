'use client';

import GorusmeFormDrawer from '@/components/coaching/meetings/GorusmeFormDrawer';

interface GorusmeEkleDrawerProps {
  studentId: number;
  studentName: string;
  coachId?: number;
  editId?: number | null;
  onClose: () => void;
  onSuccess?: () => void;
}

export default function GorusmeEkleDrawer({
  studentId,
  studentName,
  coachId,
  editId,
  onClose,
  onSuccess,
}: GorusmeEkleDrawerProps) {
  return (
    <GorusmeFormDrawer
      mode="coach"
      initialStudentId={studentId}
      initialCoachId={coachId}
      studentName={studentName}
      editId={editId}
      onClose={onClose}
      onSuccess={onSuccess}
    />
  );
}
