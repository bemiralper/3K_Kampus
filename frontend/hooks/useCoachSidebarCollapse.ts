"use client";

import { useEffect, useState } from "react";
import { useMediaQuery } from "@/hooks/useMediaQuery";

const DESKTOP_STORAGE_KEY = "coach-sidebar-expanded";

export function useCoachSidebarCollapse() {
  const isDesktop = useMediaQuery("(min-width: 992px)");
  const [desktopExpanded, setDesktopExpanded] = useState(true);
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem(DESKTOP_STORAGE_KEY);
    if (saved === "false") setDesktopExpanded(false);
    else if (saved === "true") setDesktopExpanded(true);
    // Eski anahtar temizliği
    localStorage.removeItem("coach-sidebar-open");
  }, []);

  useEffect(() => {
    if (isDesktop) setMobileDrawerOpen(false);
  }, [isDesktop]);

  /** Geniş menü: masaüstünde expanded, mobilde çekmece açık */
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

  const closeMobileDrawer = () => setMobileDrawerOpen(false);

  return {
    isSidebarWide,
    isDesktop,
    mobileDrawerOpen,
    desktopExpanded,
    toggle,
    closeMobileDrawer,
    setMobileDrawerOpen,
  };
}
