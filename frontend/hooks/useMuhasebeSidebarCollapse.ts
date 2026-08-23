"use client";

import { useCallback, useEffect, useState } from "react";
import { useMediaQuery } from "@/hooks/useMediaQuery";

const DESKTOP_STORAGE_KEY = "muhasebe-sidebar-expanded";

export function useMuhasebeSidebarCollapse() {
  const isDesktop = useMediaQuery("(min-width: 992px)");
  const [desktopExpanded, setDesktopExpanded] = useState(true);
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem(DESKTOP_STORAGE_KEY);
    if (saved === "false") setDesktopExpanded(false);
    else if (saved === "true") setDesktopExpanded(true);
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

  // Referansı sabit: layout içindeki route değişimi efekti buna bağlı,
  // her render'da yenilenirse çekmece açılır açılmaz kapanıyor.
  const closeMobileDrawer = useCallback(() => setMobileDrawerOpen(false), []);

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
