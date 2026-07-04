"use client";

import { useEffect, useState } from "react";
import ReactDOM from "react-dom";

interface UnsavedChangesModalProps {
  open: boolean;
  title?: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export default function UnsavedChangesModal({
  open,
  title = "Sayfadan Ayrıl",
  message,
  confirmLabel = "Ayrıl",
  cancelLabel = "Sayfada Kal",
  onConfirm,
  onCancel,
}: UnsavedChangesModalProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onCancel]);

  if (!open || !mounted) return null;

  return ReactDOM.createPortal(
    <div className="unsaved-modal-overlay" role="presentation" onClick={onCancel}>
      <div
        className="unsaved-modal-card"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="unsaved-modal-title"
        aria-describedby="unsaved-modal-desc"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="unsaved-modal-top">
          <div className="unsaved-modal-icon">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
              <line x1="12" y1="9" x2="12" y2="13" />
              <line x1="12" y1="17" x2="12.01" y2="17" />
            </svg>
          </div>
          <div className="unsaved-modal-text">
            <h3 id="unsaved-modal-title" className="unsaved-modal-title">{title}</h3>
            <p id="unsaved-modal-desc">{message}</p>
          </div>
        </div>
        <div className="unsaved-modal-footer">
          <button type="button" className="unsaved-modal-btn cancel" onClick={onCancel}>
            {cancelLabel}
          </button>
          <button type="button" className="unsaved-modal-btn confirm" onClick={onConfirm}>
            {confirmLabel}
          </button>
        </div>
      </div>
      <style jsx>{`
        .unsaved-modal-overlay {
          position: fixed;
          inset: 0;
          z-index: 10000;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 16px;
          background: rgba(15, 23, 42, 0.4);
          backdrop-filter: blur(4px);
        }
        .unsaved-modal-card {
          width: min(340px, 100%);
          background: #fff;
          border-radius: 14px;
          overflow: hidden;
          box-shadow: 0 12px 32px rgba(15, 23, 42, 0.18);
          animation: unsavedModalIn 0.2s ease;
        }
        @keyframes unsavedModalIn {
          from {
            opacity: 0;
            transform: translateY(8px) scale(0.98);
          }
          to {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
        }
        .unsaved-modal-top {
          display: flex;
          gap: 12px;
          align-items: flex-start;
          padding: 18px 18px 16px;
        }
        .unsaved-modal-icon {
          flex-shrink: 0;
          width: 36px;
          height: 36px;
          border-radius: 10px;
          background: linear-gradient(135deg, #fef3c7, #fde68a);
          color: #d97706;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .unsaved-modal-text {
          flex: 1;
          min-width: 0;
        }
        .unsaved-modal-title {
          margin: 0 0 4px;
          font-size: 15px;
          font-weight: 700;
          color: #1e293b;
          line-height: 1.3;
        }
        .unsaved-modal-text p {
          margin: 0;
          font-size: 13px;
          line-height: 1.5;
          color: #64748b;
        }
        .unsaved-modal-footer {
          display: flex;
          gap: 8px;
          padding: 0 18px 18px;
        }
        .unsaved-modal-btn {
          flex: 1;
          padding: 8px 14px;
          border-radius: 8px;
          font-size: 13px;
          font-weight: 600;
          cursor: pointer;
          border: none;
          transition: background 0.15s ease;
        }
        .unsaved-modal-btn.cancel {
          background: #f1f5f9;
          color: #475569;
        }
        .unsaved-modal-btn.cancel:hover {
          background: #e2e8f0;
        }
        .unsaved-modal-btn.confirm {
          background: #dc2626;
          color: #fff;
        }
        .unsaved-modal-btn.confirm:hover {
          background: #b91c1c;
        }
      `}</style>
    </div>,
    document.body,
  );
}
