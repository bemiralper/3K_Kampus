'use client';

import { useEffect, useState } from 'react';
import ReactDOM from 'react-dom';

export interface KutuphaneConfirmModalProps {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: 'danger' | 'warning';
  loading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export default function KutuphaneConfirmModal({
  open,
  title,
  message,
  confirmLabel = 'Onayla',
  cancelLabel = 'Vazgeç',
  tone = 'danger',
  loading = false,
  onConfirm,
  onCancel,
}: KutuphaneConfirmModalProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onCancel]);

  if (!open || !mounted) return null;

  const headerGradient =
    tone === 'warning'
      ? 'linear-gradient(135deg, #fef3c7, #fffbeb)'
      : 'linear-gradient(135deg, #fee2e2, #fff1f2)';
  const iconBg =
    tone === 'warning'
      ? 'linear-gradient(135deg, #f59e0b, #d97706)'
      : 'linear-gradient(135deg, #ef4444, #dc2626)';
  const titleColor = tone === 'warning' ? '#92400e' : '#991b1b';
  const icon = tone === 'warning' ? '⚠️' : '🪑';

  return ReactDOM.createPortal(
    <div
      className="kutuphane-confirm-overlay"
      role="presentation"
      onClick={onCancel}
    >
      <div
        className="kutuphane-confirm-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="kutuphane-confirm-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="kutuphane-confirm-header" style={{ background: headerGradient }}>
          <div className="kutuphane-confirm-icon" style={{ background: iconBg }}>
            {icon}
          </div>
          <h3 id="kutuphane-confirm-title" className="kutuphane-confirm-title" style={{ color: titleColor }}>
            {title}
          </h3>
        </div>
        <div className="kutuphane-confirm-body">
          <p>{message}</p>
        </div>
        <div className="kutuphane-confirm-footer">
          <button type="button" className="kutuphane-confirm-cancel" onClick={onCancel} disabled={loading}>
            {cancelLabel}
          </button>
          <button
            type="button"
            className={`kutuphane-confirm-submit is-${tone}`}
            onClick={onConfirm}
            disabled={loading}
          >
            {loading ? 'İşleniyor…' : confirmLabel}
          </button>
        </div>
      </div>
      <style>{`
        .kutuphane-confirm-overlay {
          position: fixed;
          inset: 0;
          z-index: 10000;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 16px;
          background: rgba(15, 23, 42, 0.45);
          backdrop-filter: blur(4px);
        }
        .kutuphane-confirm-card {
          width: min(420px, 100%);
          background: #fff;
          border-radius: 16px;
          overflow: hidden;
          box-shadow: 0 24px 48px rgba(15, 23, 42, 0.18);
          animation: kutuphaneConfirmIn 0.2s ease;
        }
        @keyframes kutuphaneConfirmIn {
          from { opacity: 0; transform: translateY(8px) scale(0.98); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
        .kutuphane-confirm-header {
          padding: 24px 24px 16px;
          text-align: center;
          border-bottom: 1px solid rgba(0, 0, 0, 0.06);
        }
        .kutuphane-confirm-icon {
          width: 56px;
          height: 56px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 24px;
          margin: 0 auto 12px;
          box-shadow: 0 4px 14px rgba(0, 0, 0, 0.12);
        }
        .kutuphane-confirm-title {
          margin: 0;
          font-size: 18px;
          font-weight: 700;
        }
        .kutuphane-confirm-body {
          padding: 20px 24px;
        }
        .kutuphane-confirm-body p {
          margin: 0;
          font-size: 14px;
          line-height: 1.6;
          color: #475569;
          text-align: center;
        }
        .kutuphane-confirm-footer {
          display: flex;
          justify-content: flex-end;
          gap: 10px;
          padding: 16px 24px 20px;
          border-top: 1px solid #f1f5f9;
          background: #fafbfc;
        }
        .kutuphane-confirm-cancel,
        .kutuphane-confirm-submit {
          padding: 10px 18px;
          border-radius: 10px;
          font-size: 14px;
          font-weight: 600;
          cursor: pointer;
          border: none;
        }
        .kutuphane-confirm-cancel {
          background: #fff;
          color: #64748b;
          border: 1px solid #e2e8f0;
        }
        .kutuphane-confirm-cancel:hover:not(:disabled) {
          background: #f8fafc;
        }
        .kutuphane-confirm-submit.is-danger {
          background: linear-gradient(135deg, #ef4444, #dc2626);
          color: #fff;
          box-shadow: 0 2px 8px rgba(239, 68, 68, 0.3);
        }
        .kutuphane-confirm-submit.is-warning {
          background: linear-gradient(135deg, #f59e0b, #d97706);
          color: #fff;
          box-shadow: 0 2px 8px rgba(245, 158, 11, 0.3);
        }
        .kutuphane-confirm-submit:disabled,
        .kutuphane-confirm-cancel:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }
      `}</style>
    </div>,
    document.body,
  );
}
