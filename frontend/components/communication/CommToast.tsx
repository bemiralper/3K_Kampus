"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type CommToastTone = "success" | "error" | "info";

export interface CommToastState {
  message: string;
  tone: CommToastTone;
}

/**
 * Küçük, kendi kendine kapanan bildirim. `ChatWorkspace` içindeki
 * `chat-toast` deseninin `comm-*` karşılığı; sayfa başına bir tane yeter.
 */
export function useCommToast(durationMs = 3200) {
  const [toast, setToast] = useState<CommToastState | null>(null);
  const timer = useRef<number | null>(null);

  const show = useCallback(
    (message: string, tone: CommToastTone = "success") => {
      if (timer.current) window.clearTimeout(timer.current);
      setToast({ message, tone });
      timer.current = window.setTimeout(() => setToast(null), durationMs);
    },
    [durationMs],
  );

  useEffect(
    () => () => {
      if (timer.current) window.clearTimeout(timer.current);
    },
    [],
  );

  return { toast, show, clear: () => setToast(null) };
}

export function CommToast({ toast }: { toast: CommToastState | null }) {
  if (!toast) return null;
  return (
    <div
      className={`comm-toast comm-toast--${toast.tone}`}
      role={toast.tone === "error" ? "alert" : "status"}
      aria-live="polite"
    >
      {toast.message}
    </div>
  );
}
