"use client";

import { useCallback, useState } from "react";

export type ToastType = "success" | "error" | "info";
export type ToastState = { message: string; type: ToastType } | null;

export function useToast() {
  const [toast, setToast] = useState<ToastState>(null);
  const showToast = useCallback((message: string, type: ToastType = "success") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  }, []);
  return { toast, showToast };
}

export function ToastBanner({ toast }: { toast: ToastState }) {
  if (!toast) return null;
  const bgMap: Record<ToastType, string> = {
    success: "#172b4c",
    error: "#dc2626",
    info: "#0262a7",
  };
  return (
    <div
      style={{
        position: "fixed",
        bottom: 24,
        right: 24,
        background: bgMap[toast.type],
        color: "white",
        padding: "14px 24px",
        borderRadius: 12,
        fontSize: 14,
        fontWeight: 600,
        zIndex: 9999,
        boxShadow: "0 8px 30px rgba(0,0,0,0.2)",
        maxWidth: 420,
        whiteSpace: "pre-line",
      }}
    >
      {toast.message}
    </div>
  );
}
