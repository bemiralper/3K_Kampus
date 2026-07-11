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

/**
 * Portal + inline stiller: styled-jsx portal'da bazen uygulanmaz;
 * görünmez overlay tüm tıklamaları yutar (menü “kilitlenir”).
 */
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
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prevOverflow;
      document.removeEventListener("keydown", onKey);
    };
  }, [open, onCancel]);

  if (!open || !mounted) return null;

  return ReactDOM.createPortal(
    <div
      data-unsaved-modal
      role="presentation"
      onClick={onCancel}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 10000,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
        background: "rgba(15, 23, 42, 0.4)",
        backdropFilter: "blur(4px)",
      }}
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="unsaved-modal-title"
        aria-describedby="unsaved-modal-desc"
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "min(340px, 100%)",
          background: "#fff",
          borderRadius: 14,
          overflow: "hidden",
          boxShadow: "0 12px 32px rgba(15, 23, 42, 0.18)",
        }}
      >
        <div style={{ display: "flex", gap: 12, alignItems: "flex-start", padding: "18px 18px 16px" }}>
          <div
            style={{
              flexShrink: 0,
              width: 36,
              height: 36,
              borderRadius: 10,
              background: "linear-gradient(135deg, #fef3c7, #fde68a)",
              color: "#d97706",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
              <line x1="12" y1="9" x2="12" y2="13" />
              <line x1="12" y1="17" x2="12.01" y2="17" />
            </svg>
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <h3 id="unsaved-modal-title" style={{ margin: "0 0 4px", fontSize: 15, fontWeight: 700, color: "#1e293b", lineHeight: 1.3 }}>
              {title}
            </h3>
            <p id="unsaved-modal-desc" style={{ margin: 0, fontSize: 13, lineHeight: 1.5, color: "#64748b" }}>
              {message}
            </p>
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, padding: "0 18px 18px" }}>
          <button
            type="button"
            onClick={onCancel}
            style={{
              flex: 1,
              padding: "8px 14px",
              borderRadius: 8,
              fontSize: 13,
              fontWeight: 600,
              cursor: "pointer",
              border: "none",
              background: "#f1f5f9",
              color: "#475569",
            }}
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            style={{
              flex: 1,
              padding: "8px 14px",
              borderRadius: 8,
              fontSize: 13,
              fontWeight: 600,
              cursor: "pointer",
              border: "none",
              background: "#dc2626",
              color: "#fff",
            }}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
