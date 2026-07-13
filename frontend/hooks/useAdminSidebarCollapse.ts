"use client";

import { useCallback, useEffect, useState } from "react";
import { useMediaQuery } from "@/hooks/useMediaQuery";

const DESKTOP_STORAGE_KEY = "admin-sidebar-expanded";

export function useAdminSidebarCollapse() {
  const isDesktop = useMediaQuery("(min-width: 992px)");
  const [desktopExpanded, setDesktopExpanded] = useState(true);
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem(DESKTOP_STORAGE_KEY);
    if (saved === "false") setDesktopExpanded(false);
    else if (saved === "true") setDesktopExpanded(true);
    // Eski tek anahtar — mobil/masaüstü karışıklığını önlemek için taşı
    const legacy = localStorage.getItem("sidebarOpen");
    if (legacy !== null && saved === null) {
      try {
        setDesktopExpanded(JSON.parse(legacy));
      } catch {
        /* ignore */
      }
    }
    localStorage.removeItem("sidebarOpen");
  }, []);

  useEffect(() => {
    if (isDesktop) setMobileDrawerOpen(false);
  }, [isDesktop]);

  const isSidebarWide = isDesktop ? desktopExpanded : mobileDrawerOpen;

  const toggle = () => {
    if (isDesktop) {
      setDesktopExpanded((prev) => {
        const next = !prev;
        localStorage.setItem(DESKTOP_STORAGE_KEY, String(next));
        return next;
      });
      return;
    }
    setMobileDrawerOpen((prev) => !prev);
  };

  const openMobileDrawer = useCallback(() => setMobileDrawerOpen(true), []);
  const closeMobileDrawer = useCallback(() => setMobileDrawerOpen(false), []);

  return {
    isSidebarWide,
    isDesktop,
    mobileDrawerOpen,
    desktopExpanded,
    toggle,
    openMobileDrawer,
    closeMobileDrawer,
  };
}
