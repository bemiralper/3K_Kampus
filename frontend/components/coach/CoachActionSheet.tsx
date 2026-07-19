'use client';

import { useCallback, useEffect } from 'react';
import { createPortal } from 'react-dom';

export interface CoachActionSheetProps {
  title: string;
  subtitle?: string;
  studentName?: string;
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
  size?: 'default' | 'full';
}

export default function CoachActionSheet({
  title,
  subtitle,
  studentName,
  onClose,
  children,
  footer,
  size = 'default',
}: CoachActionSheetProps) {
  const handleClose = useCallback(() => {
    onClose();
  }, [onClose]);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') handleClose();
    };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [handleClose]);

  if (typeof document === 'undefined') return null;

  const sheetClass =
    size === 'full'
      ? 'coach-action-sheet coach-action-sheet-full'
      : 'coach-action-sheet';

  return createPortal(
    <div className="coach-action-sheet-overlay" onClick={handleClose} role="presentation">
      <div
        className={sheetClass}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-labelledby="coach-action-sheet-title"
        aria-modal="true"
      >
        <div className="coach-drawer-handle" aria-hidden="true" />

        <div className="coach-action-sheet-header">
          <div className="coach-action-sheet-header-text">
            <h2 id="coach-action-sheet-title" className="coach-action-sheet-title">
              {title}
            </h2>
            {subtitle && <p className="coach-action-sheet-subtitle">{subtitle}</p>}
            {studentName && (
              <p className="coach-action-sheet-student">{studentName}</p>
            )}
          </div>
          <button
            type="button"
            className="coach-drawer-close"
            onClick={handleClose}
            aria-label="Kapat"
          >
            ×
          </button>
        </div>

        <div className="coach-action-sheet-body">{children}</div>

        {footer && <div className="coach-action-sheet-footer">{footer}</div>}
      </div>
    </div>,
    document.body
  );
}
