'use client';

import { useEffect } from 'react';
import type { SinavTakvim } from '@/lib/website-api';
import SinavSecimKarti from './SinavSecimKarti';
import './public-home.css';
import './sinav-takvim.css';

type SinavDetailModalProps = {
  sinav: SinavTakvim | null;
  onClose: () => void;
  kurumAdi?: string;
  /** Yönetim ekranındaki formun üstünde açılması için. */
  front?: boolean;
};

export default function SinavDetailModal({ sinav, onClose, kurumAdi, front = false }: SinavDetailModalProps) {
  useEffect(() => {
    if (!sinav) return undefined;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [sinav, onClose]);

  if (!sinav) return null;

  return (
    <div className={front ? 'stk-modal stk-modal--front' : 'stk-modal'}>
      <div className="stk-modal__shade" onClick={onClose} aria-hidden />
      <div
        className="stk-modal__panel stk-side stk-side--window"
        role="dialog"
        aria-modal="true"
        aria-labelledby="sinav-modal-title"
      >
        <button type="button" onClick={onClose} className="stk-modal__x" aria-label="Kapat">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
            <path d="M18 6L6 18M6 6l12 12" />
          </svg>
        </button>
        <SinavSecimKarti sinav={sinav} kurumAdi={kurumAdi} titleId="sinav-modal-title" />
      </div>
    </div>
  );
}
