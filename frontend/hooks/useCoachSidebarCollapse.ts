"use client";

import { useEffect, useState } from "react";
import { useMediaQuery } from "@/hooks/useMediaQuery";

const DESKTOP_STORAGE_KEY = "coach-sidebar-expanded";

export type CoachLayoutMode = "phone" | "tablet" | "desktop";

export function useCoachSidebarCollapse() {
  // Desktop sidebar (kalıcı menü) 992px+ — 1280 eşiği laptop'ta menüyü çekmeceye düşürüp kaydırıyordu
  const isDesktop = useMediaQuery("(min-width: 992px)");
  const isTablet = useMediaQuery("(min-width: 768px) and (max-width: 991px)");
  const isPhone = !isDesktop && !isTablet;
  const [desktopExpanded, setDesktopExpanded] = useState(true);
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem(DESKTOP_STORAGE_KEY);
    if (saved === "false") setDesktopExpanded(false);
    else if (saved === "true") setDesktopExpanded(true);
    localStorage.removeItem("coach-sidebar-open");
  }, []);

  useEffect(() => {
    if (isDesktop) setMobileDrawerOpen(false);
  }, [isDesktop]);

  /** Geniş menü: masaüstünde expanded, telefon/tablet overlay açık */
  const isSidebarWide = isDesktop ? desktopExpanded : mobileDrawerOpen;

  const layoutMode: CoachLayoutMode = isDesktop ? "desktop" : isTablet ? "tablet" : "phone";

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
    isTablet,
    isPhone,
    layoutMode,
    mobileDrawerOpen,
    desktopExpanded,
    toggle,
    closeMobileDrawer,
    setMobileDrawerOpen,
  };
}
