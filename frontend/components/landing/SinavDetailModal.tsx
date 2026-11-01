'use client';

import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import type { SinavTakvim } from '@/lib/website-api';
import SinavSecimKarti from './SinavSecimKarti';
import s from './sinavDetail.module.css';

type SinavDetailModalProps = {
  sinav: SinavTakvim | null;
  onClose: () => void;
  kurumAdi?: string;
  /** Yönetim ekranındaki formun üstünde açılması için. */
  front?: boolean;
};

export default function SinavDetailModal({ sinav, onClose, kurumAdi, front = false }: SinavDetailModalProps) {
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!sinav) return undefined;
    const previousFocus = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    closeRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = previousOverflow;
      previousFocus?.focus();
    };
  }, [sinav, onClose]);

  if (!sinav || typeof document === 'undefined') return null;

  return createPortal(
    <div className={`${s.overlay} ${front ? s.front : ''}`} onClick={event => { if (event.target === event.currentTarget) onClose(); }}>
      <div
        className={s.panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby="sinav-modal-title"
      >
        <button ref={closeRef} type="button" onClick={onClose} className={s.close} aria-label="Kapat">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
            <path d="M18 6L6 18M6 6l12 12" />
          </svg>
        </button>
        <SinavSecimKarti sinav={sinav} kurumAdi={kurumAdi} titleId="sinav-modal-title" />
      </div>
    </div>, document.body,
  );
}
