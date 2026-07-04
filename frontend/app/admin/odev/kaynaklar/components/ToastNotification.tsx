// ========== Toast Notification ==========
"use client";
import React from "react";
import type { Toast } from "../types";

interface ToastNotificationProps {
  toast: Toast | null;
}

export function ToastNotification({ toast }: ToastNotificationProps) {
  if (!toast) return null;

  const bgMap = { success: "#172b4c", error: "#dc2626", info: "#0262a7" };

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
        animation: "slideIn 0.3s ease-out",
        maxWidth: 400,
      }}
    >
      {toast.message}
    </div>
  );
}
