"use client";

import { useEffect } from "react";
import {
  clearChunkReloadFlag,
  isChunkLoadError,
  reloadAfterChunkError,
} from "@/lib/chunk-load-error";

/** Stale .next cache sonrası ChunkLoadError — oturumda bir kez cache-bust yenileme */
export default function ChunkLoadRecovery() {
  useEffect(() => {
    const onError = (event: ErrorEvent) => {
      const msg = event.message || "";
      const stack = event.error instanceof Error ? event.error.stack || "" : "";
      if (!isChunkLoadError(msg, stack)) return;
      reloadAfterChunkError();
    };

    const onRejection = (event: PromiseRejectionEvent) => {
      const reason = event.reason;
      const msg =
        typeof reason === "string"
          ? reason
          : reason instanceof Error
            ? reason.message
            : "";
      const stack = reason instanceof Error ? reason.stack || "" : "";
      if (!isChunkLoadError(msg, stack)) return;
      reloadAfterChunkError();
    };

    window.addEventListener("error", onError, true);
    window.addEventListener("unhandledrejection", onRejection);
    clearChunkReloadFlag();

    return () => {
      window.removeEventListener("error", onError, true);
      window.removeEventListener("unhandledrejection", onRejection);
    };
  }, []);

  return null;
}
