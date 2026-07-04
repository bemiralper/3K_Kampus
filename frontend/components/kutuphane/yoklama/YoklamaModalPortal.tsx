"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

/** Yoklama üstü modal katmanı — document.body'ye taşır (z-index çakışmasını önler). */
export default function YoklamaModalPortal({ children }: { children: React.ReactNode }) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) return null;
  return createPortal(children, document.body);
}
