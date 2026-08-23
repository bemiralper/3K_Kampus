"use client";

import { useEffect } from "react";

/**
 * Tam ekran / yan panel çekmeceler için gövde kaydırma kilidi + Esc ile kapatma.
 * Telefonda arka planın kaymaması ve klavye erişilebilirliği için gerekli.
 */
export function useSheetChrome(open: boolean, onClose: () => void) {
  useEffect(() => {
    if (!open) return;
    const { body } = document;
    const previous = body.style.overflow;
    body.style.overflow = "hidden";
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      body.style.overflow = previous;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open, onClose]);
}

export default useSheetChrome;
