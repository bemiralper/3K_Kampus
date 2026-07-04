"use client";

import { useEffect } from "react";

const RELOAD_KEY = "lms_chunk_reload";
const STABLE_MS = 5000;

/** Stale .next cache sonrası ChunkLoadError / webpack modül hatası — oturumda bir kez yenile */
export default function ChunkLoadRecovery() {
  useEffect(() => {
    const reloadOnce = () => {
      try {
        if (sessionStorage.getItem(RELOAD_KEY)) return;
        sessionStorage.setItem(RELOAD_KEY, "1");
      } catch {
        /* ignore */
      }
      window.location.reload();
    };

    const isRecoverableLoadError = (msg: string) =>
      msg.includes("ChunkLoadError") ||
      msg.includes("Loading chunk") ||
      msg.includes("Cannot find module") ||
      msg.includes("Failed to fetch dynamically imported module") ||
      msg.includes("originalFactory.call") ||
      msg.includes("parallelRoutes.get");

    const onError = (event: ErrorEvent) => {
      const msg = event.message || "";
      if (!isRecoverableLoadError(msg)) return;
      reloadOnce();
    };

    const onRejection = (event: PromiseRejectionEvent) => {
      const reason = event.reason;
      const msg =
        typeof reason === "string"
          ? reason
          : reason instanceof Error
            ? reason.message
            : "";
      if (!isRecoverableLoadError(msg)) return;
      reloadOnce();
    };

    window.addEventListener("error", onError, true);
    window.addEventListener("unhandledrejection", onRejection);

    // Başarılı yükleme sonrası gelecekteki recovery için bayrağı sıfırla.
    // Mount anında silmek reload döngüsüne yol açar — bunu yapma.
    const stableTimer = window.setTimeout(() => {
      try {
        sessionStorage.removeItem(RELOAD_KEY);
      } catch {
        /* ignore */
      }
    }, STABLE_MS);

    return () => {
      window.clearTimeout(stableTimer);
      window.removeEventListener("error", onError, true);
      window.removeEventListener("unhandledrejection", onRejection);
    };
  }, []);

  return null;
}
