'use client';

import type { CoachStudentProfileStudent } from '@/lib/coach-api';
import CoachStudentInfoPanel from '@/components/coach/CoachStudentInfoPanel';

interface BilgiTabProps {
  student: CoachStudentProfileStudent;
  onPhotoUpdate?: (url: string | null) => void;
  onNavigateVeli?: () => void;
}

export default function BilgiTab({ student, onPhotoUpdate, onNavigateVeli }: BilgiTabProps) {
  return (
    <div className="student360-panel student360-bilgi-panel">
      <p className="s360-kayit-hint">
        Öğrenci kimlik ve iletişim bilgileri (salt okunur). Fotoğraf ekleyebilir veya
        değiştirebilirsiniz.
      </p>
      <CoachStudentInfoPanel
        student={student}
        onPhotoUpdate={onPhotoUpdate}
        onNavigateVeli={onNavigateVeli}
        variant="panel"
      />
    </div>
  );
}
