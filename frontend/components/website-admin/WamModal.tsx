'use client';

import type { ReactNode } from 'react';

type WamModalProps = {
  open: boolean;
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
  /** false ise backdrop tıklaması kapatmayı tetiklemez */
  closeOnBackdrop?: boolean;
};

export default function WamModal({
  open,
  title,
  subtitle,
  onClose,
  children,
  footer,
  wide,
  closeOnBackdrop = true,
}: WamModalProps) {
  if (!open) return null;

  return (
    <div
      className="wam-modal-backdrop"
      onClick={closeOnBackdrop ? onClose : undefined}
      role="presentation"
    >
      <div
        className={`wam-modal ${wide ? 'wam-modal-wide' : ''}`}
        onClick={e => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="wam-modal-title"
      >
        <div className="wam-modal-header">
          <div>
            <h4 id="wam-modal-title">{title}</h4>
            {subtitle && <p>{subtitle}</p>}
          </div>
          <button type="button" className="wam-modal-close" onClick={onClose} aria-label="Kapat">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="wam-modal-body">{children}</div>
        {footer && <div className="wam-modal-footer">{footer}</div>}
      </div>
    </div>
  );
}
