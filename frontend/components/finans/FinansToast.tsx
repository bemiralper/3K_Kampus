"use client";

import { useEffect, useState } from "react";
import ReactDOM from "react-dom";

export type FinansToastType = "success" | "error" | "loading";

export interface FinansToastProps {
  message: string;
  type?: FinansToastType;
  onClose: () => void;
  autoCloseMs?: number;
}

export default function FinansToast({
  message,
  type = "success",
  onClose,
  autoCloseMs,
}: FinansToastProps) {
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

  useEffect(() => {
    if (!message || type === "loading") return;
    const ms = autoCloseMs ?? (type === "error" ? 6000 : 4000);
    const timer = window.setTimeout(onClose, ms);
    return () => window.clearTimeout(timer);
  }, [message, type, autoCloseMs, onClose]);

  if (!mounted || !message) return null;

  const styles: Record<FinansToastType, { bg: string; border: string; color: string; icon: string }> = {
    success: { bg: "linear-gradient(135deg, #f0fdf4, #dcfce7)", border: "#86efac", color: "#166534", icon: "✓" },
    error: { bg: "linear-gradient(135deg, #fef2f2, #fee2e2)", border: "#fca5a5", color: "#991b1b", icon: "⚠️" },
    loading: { bg: "linear-gradient(135deg, #eff6ff, #dbeafe)", border: "#93c5fd", color: "#1e40af", icon: "⏳" },
  };
  const s = styles[type];

  return ReactDOM.createPortal(
    <div
      role="status"
      aria-live="polite"
      style={{
        position: "fixed",
        top: 20,
        right: 20,
        zIndex: 10050,
        display: "flex",
        alignItems: "center",
        gap: 10,
        maxWidth: "min(420px, calc(100vw - 32px))",
        padding: "14px 16px",
        borderRadius: 14,
        fontSize: 14,
        fontWeight: 500,
        lineHeight: 1.4,
        boxShadow: "0 12px 32px rgba(15, 23, 42, 0.14)",
        background: s.bg,
        border: `1px solid ${s.border}`,
        color: s.color,
        opacity: visible ? 1 : 0,
        transform: visible ? "translateY(0)" : "translateY(-8px)",
        transition: "opacity 0.2s ease, transform 0.2s ease",
      }}
    >
      <span style={{ flexShrink: 0, fontSize: 16 }}>{s.icon}</span>
      <span style={{ flex: 1, minWidth: 0 }}>{message}</span>
      {type !== "loading" ? (
        <button
          type="button"
          onClick={onClose}
          aria-label="Kapat"
          style={{ flexShrink: 0, background: "none", border: "none", cursor: "pointer", fontSize: 16, color: "inherit", opacity: 0.7 }}
        >
          ✕
        </button>
      ) : (
        <button
          type="button"
          onClick={onClose}
          aria-label="İptal"
          style={{ flexShrink: 0, background: "none", border: "none", cursor: "pointer", fontSize: 12, color: "inherit", opacity: 0.85, fontWeight: 600 }}
        >
          İptal
        </button>
      )}
    </div>,
    document.body,
  );
}
