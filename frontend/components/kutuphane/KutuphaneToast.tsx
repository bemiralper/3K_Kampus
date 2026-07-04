'use client';

import { useEffect, useState } from 'react';
import ReactDOM from 'react-dom';

export interface KutuphaneToastProps {
  message: string;
  type?: 'success' | 'error';
  onClose: () => void;
}

export default function KutuphaneToast({
  message,
  type = 'success',
  onClose,
}: KutuphaneToastProps) {
  const [mounted, setMounted] = useState(false);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!message) return;
    const showTimer = window.setTimeout(() => setVisible(true), 10);
    return () => window.clearTimeout(showTimer);
  }, [message]);

  if (!mounted || !message) return null;

  const isSuccess = type === 'success';

  return ReactDOM.createPortal(
    <div
      className={`kutuphane-toast${visible ? ' is-visible' : ''}${isSuccess ? ' is-success' : ' is-error'}`}
      role="status"
      aria-live="polite"
    >
      <span className="kutuphane-toast-icon">{isSuccess ? '✓' : '⚠️'}</span>
      <span className="kutuphane-toast-text">{message}</span>
      <button type="button" className="kutuphane-toast-close" onClick={onClose} aria-label="Kapat">
        ✕
      </button>
      <style>{`
        .kutuphane-toast {
          position: fixed;
          top: 20px;
          right: 20px;
          z-index: 10050;
          display: flex;
          align-items: center;
          gap: 10px;
          max-width: min(420px, calc(100vw - 32px));
          padding: 14px 16px;
          border-radius: 14px;
          font-size: 14px;
          font-weight: 500;
          line-height: 1.4;
          box-shadow: 0 12px 32px rgba(15, 23, 42, 0.14);
          pointer-events: auto;
          opacity: 0;
          transform: translateY(-8px);
          transition: opacity 0.2s ease, transform 0.2s ease;
        }
        .kutuphane-toast.is-visible {
          opacity: 1;
          transform: translateY(0);
        }
        .kutuphane-toast.is-success {
          background: linear-gradient(135deg, #f0fdf4, #dcfce7);
          border: 1px solid #86efac;
          color: #166534;
        }
        .kutuphane-toast.is-error {
          background: linear-gradient(135deg, #fef2f2, #fee2e2);
          border: 1px solid #fca5a5;
          color: #991b1b;
        }
        .kutuphane-toast-icon {
          flex-shrink: 0;
          font-size: 16px;
          line-height: 1;
        }
        .kutuphane-toast-text {
          flex: 1;
          min-width: 0;
        }
        .kutuphane-toast-close {
          flex-shrink: 0;
          background: none;
          border: none;
          cursor: pointer;
          font-size: 16px;
          padding: 0 2px;
          color: inherit;
          opacity: 0.7;
        }
        .kutuphane-toast-close:hover {
          opacity: 1;
        }
        @media (max-width: 640px) {
          .kutuphane-toast {
            top: 12px;
            right: 12px;
            left: 12px;
            max-width: none;
          }
        }
      `}</style>
    </div>,
    document.body,
  );
}
