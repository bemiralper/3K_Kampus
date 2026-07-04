"use client";

import React, { useEffect, useState } from "react";
import ReactDOM from "react-dom";

interface FinansModalProps {
  title: string;
  subtitle?: string;
  icon?: string;
  accent?: string;
  width?: number;
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
}

/** Ortak modal kabuğu — Para Hareketleri hızlı işlem formları için. */
export default function FinansModal({
  title,
  subtitle,
  icon = "💰",
  accent = "#2563eb",
  width = 560,
  onClose,
  children,
  footer,
}: FinansModalProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  if (!mounted) return null;

  return ReactDOM.createPortal(
    <>
      <div
        onClick={onClose}
        style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,.45)", zIndex: 3000 }}
      />
      <div
        role="dialog"
        aria-modal="true"
        style={{
          position: "fixed",
          top: "50%",
          left: "50%",
          transform: "translate(-50%, -50%)",
          width: `min(${width}px, calc(100vw - 32px))`,
          maxHeight: "90vh",
          background: "#fff",
          borderRadius: 20,
          boxShadow: "0 24px 64px rgba(15,23,42,.25)",
          zIndex: 3001,
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            padding: "18px 22px",
            borderBottom: "1px solid #f1f5f9",
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "space-between",
            gap: 12,
            flexShrink: 0,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div
              style={{
                width: 40,
                height: 40,
                borderRadius: 12,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 20,
                background: `${accent}1a`,
                flexShrink: 0,
              }}
            >
              {icon}
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: "#1e293b" }}>{title}</h3>
              {subtitle && <p style={{ margin: "2px 0 0", fontSize: 12.5, color: "#94a3b8" }}>{subtitle}</p>}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Kapat"
            style={{ border: "none", background: "none", fontSize: 18, cursor: "pointer", color: "#94a3b8", lineHeight: 1, padding: 4 }}
          >
            ✕
          </button>
        </div>

        <div style={{ flex: 1, overflowY: "auto", padding: 22 }}>{children}</div>

        {footer && (
          <div
            style={{
              padding: "14px 22px",
              borderTop: "1px solid #f1f5f9",
              display: "flex",
              justifyContent: "flex-end",
              gap: 10,
              flexShrink: 0,
              background: "#fafbfc",
            }}
          >
            {footer}
          </div>
        )}
      </div>
    </>,
    document.body,
  );
}

export const finansModalInputStyle: React.CSSProperties = {
  width: "100%",
  padding: "9px 12px",
  border: "1px solid #e2e8f0",
  borderRadius: 10,
  fontSize: 13.5,
  outline: "none",
  color: "#1e293b",
  background: "#fff",
};

export const finansModalLabelStyle: React.CSSProperties = {
  display: "block",
  fontSize: 12,
  fontWeight: 700,
  color: "#64748b",
  marginBottom: 5,
};

export function FinansModalField({
  label,
  children,
  hint,
  error,
}: {
  label: string;
  children: React.ReactNode;
  hint?: string;
  error?: string;
}) {
  return (
    <div style={{ marginBottom: 14 }}>
      <label style={finansModalLabelStyle}>{label}</label>
      {children}
      {hint && !error && <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 4 }}>{hint}</div>}
      {error && <div style={{ fontSize: 11.5, color: "#dc2626", marginTop: 4, fontWeight: 600 }}>{error}</div>}
    </div>
  );
}

export function FinansModalButton({
  children,
  onClick,
  variant = "primary",
  disabled,
  type = "button",
}: {
  children: React.ReactNode;
  onClick?: () => void;
  variant?: "primary" | "secondary" | "danger";
  disabled?: boolean;
  type?: "button" | "submit";
}) {
  const variants: Record<string, React.CSSProperties> = {
    primary: { background: "#2563eb", color: "#fff", border: "1px solid #2563eb" },
    secondary: { background: "#fff", color: "#475569", border: "1px solid #e2e8f0" },
    danger: { background: "#dc2626", color: "#fff", border: "1px solid #dc2626" },
  };
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      style={{
        padding: "9px 18px",
        borderRadius: 10,
        fontSize: 13.5,
        fontWeight: 700,
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.6 : 1,
        transition: "opacity .15s",
        ...variants[variant],
      }}
    >
      {children}
    </button>
  );
}
