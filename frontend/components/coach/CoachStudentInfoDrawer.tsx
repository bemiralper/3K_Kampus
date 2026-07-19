'use client';

import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import type { CoachStudentProfileStudent } from '@/lib/coach-api';
import CoachStudentInfoPanel from '@/components/coach/CoachStudentInfoPanel';

interface CoachStudentInfoDrawerProps {
  student: CoachStudentProfileStudent;
  onClose: () => void;
  onNavigateVeli?: () => void;
  onPhotoUpdate?: (url: string | null) => void;
}

export default function CoachStudentInfoDrawer({
  student,
  onClose,
  onNavigateVeli,
  onPhotoUpdate,
}: CoachStudentInfoDrawerProps) {
  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, []);

  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [onClose]);

  if (typeof document === 'undefined') return null;

  return createPortal(
    <div className="coach-drawer-overlay coach-info-drawer-overlay" onClick={onClose} role="presentation">
      <div
        className="coach-drawer coach-info-drawer coach-info-drawer-enter"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="coach-info-drawer-title"
      >
        <div className="coach-drawer-handle" aria-hidden="true" />

        <div className="coach-drawer-header">
          <h2 id="coach-info-drawer-title" className="coach-drawer-title">
            Öğrenci Bilgileri
          </h2>
          <button
            type="button"
            className="coach-drawer-close"
            onClick={onClose}
            aria-label="Kapat"
          >
            ×
          </button>
        </div>

        <div className="coach-info-drawer-body">
          <CoachStudentInfoPanel
            student={student}
            onPhotoUpdate={onPhotoUpdate}
            onNavigateVeli={onNavigateVeli}
            variant="drawer"
          />
        </div>
      </div>
    </div>,
    document.body
  );
}
