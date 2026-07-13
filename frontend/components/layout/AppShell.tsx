"use client";

import type { ReactNode } from "react";
import { Suspense, useEffect } from "react";
import { usePathname } from "next/navigation";
import Sidebar from "@/components/layout/Sidebar";
import Topbar from "@/components/layout/Topbar";
import AdminBottomNav from "@/components/layout/AdminBottomNav";
import LegacyScripts from "@/components/LegacyScripts";
import GorevEkranMesajiOverlay from "@/components/gorev/GorevEkranMesajiOverlay";
import { ActiveKurumBranding } from "@/components/branding/KurumLogo";
import { KurumProvider } from "@/lib/contexts/KurumContext";
import { useAdminSidebarCollapse } from "@/hooks/useAdminSidebarCollapse";

export default function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const {
    isSidebarWide,
    isDesktop,
    mobileDrawerOpen,
    toggle: toggleSidebar,
    openMobileDrawer,
    closeMobileDrawer,
  } = useAdminSidebarCollapse();

  useEffect(() => {
    closeMobileDrawer();
  }, [pathname, closeMobileDrawer]);

  useEffect(() => {
    if (!mobileDrawerOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeMobileDrawer();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [mobileDrawerOpen, closeMobileDrawer]);

  useEffect(() => {
    if (!isDesktop && mobileDrawerOpen) {
      const prev = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      return () => {
        document.body.style.overflow = prev;
      };
    }
  }, [isDesktop, mobileDrawerOpen]);

  const shellClass = [
    "app-container",
    isDesktop && isSidebarWide ? "admin-sidebar-expanded" : "admin-sidebar-collapsed",
    !isDesktop && isSidebarWide ? "admin-mobile-drawer-open" : "",
    !isDesktop ? "admin-mobile-shell" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <KurumProvider>
      <div className={shellClass}>
        <Suspense fallback={null}>
          <Sidebar
            isOpen={isSidebarWide}
            isDesktop={isDesktop}
            onToggle={toggleSidebar}
            onCloseMobile={closeMobileDrawer}
          />
        </Suspense>
        {!isDesktop && mobileDrawerOpen && (
          <button
            type="button"
            className="sidebar-overlay show admin-sidebar-backdrop"
            aria-label="Menüyü kapat"
            onClick={closeMobileDrawer}
          />
        )}
        <div className="app-main">
          <Topbar
            onMenuClick={() => {
              if (!isDesktop) {
                if (mobileDrawerOpen) closeMobileDrawer();
                else openMobileDrawer();
                return;
              }
              toggleSidebar();
            }}
            isMobile={!isDesktop}
            onSearchClick={() => {
              window.dispatchEvent(new CustomEvent("admin-open-command-palette"));
            }}
          />
          <main className="app-content">{children}</main>
        </div>
        {!isDesktop && (
          <AdminBottomNav
            menuOpen={mobileDrawerOpen}
            onMenuClick={() => {
              if (mobileDrawerOpen) closeMobileDrawer();
              else openMobileDrawer();
            }}
            onSearchClick={() => {
              window.dispatchEvent(new CustomEvent("admin-open-command-palette"));
            }}
          />
        )}
        <ActiveKurumBranding />
        <GorevEkranMesajiOverlay />
        <LegacyScripts />
      </div>
    </KurumProvider>
  );
}
