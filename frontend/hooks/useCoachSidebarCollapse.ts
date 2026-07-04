"use client";

import { useEffect, useState, useCallback } from "react";

const STORAGE_KEY = "coach-sidebar-open";

function readInitialOpen(): boolean {
  if (typeof window === "undefined") return true;
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved === "false") return false;
  if (saved === "true") return true;
  return window.innerWidth >= 992;
}

export function useCoachSidebarCollapse() {
  const [isOpen, setIsOpen] = useState(true);

  useEffect(() => {
    setIsOpen(readInitialOpen());
  }, []);

  const toggle = useCallback(() => {
    setIsOpen((prev) => {
      const next = !prev;
      localStorage.setItem(STORAGE_KEY, String(next));
      return next;
    });
  }, []);

  const setOpen = useCallback((open: boolean) => {
    setIsOpen(open);
    localStorage.setItem(STORAGE_KEY, String(open));
  }, []);

  return { isOpen, toggle, setOpen };
}
