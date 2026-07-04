"use client";

import type { ReactNode } from "react";
import { Suspense, useEffect, useMemo } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/lib/contexts/AuthContext";
import { canAccessMuhasebePortal, isMuhasebeOnlyUser } from "@/lib/auth-routes";
import { KurumProvider } from "@/lib/contexts/KurumContext";
import MuhasebeSidebar, { MuhasebeBottomNav } from "@/components/muhasebe/MuhasebeSidebar";
import MuhasebeTopbar from "@/components/muhasebe/MuhasebeTopbar";
import { useMuhasebeSidebarCollapse } from "@/hooks/useMuhasebeSidebarCollapse";
import GorevEkranMesajiOverlay from "@/components/gorev/GorevEkranMesajiOverlay";
import { ActiveKurumBranding } from "@/components/branding/KurumLogo";
import "./muhasebe.css";

const PAGE_TITLES: Record<string, string> = {
  "/muhasebe/dashboard": "Dashboard",
  "/muhasebe/ogrenci/liste": "Öğrenci Listesi",
  "/muhasebe/ogrenci/yeni-kayit": "Yeni Kayıt",
  "/muhasebe/odeme-takip": "Sözleşme/Tahsilat",
  "/muhasebe/finans": "Finans",
  "/muhasebe/personel": "Personel",
  "/muhasebe/personel/gorevlendirmeler": "Görevlendirmeler",
  "/muhasebe/gorevler": "Görevler",
  "/muhasebe/takvim": "Takvim",
};

function resolvePageTitle(pathname: string): string {
  if (pathname.startsWith("/muhasebe/ogrenci/liste/")) return "Öğrenci Detayı";
  if (pathname.startsWith("/muhasebe/personel/") && !pathname.includes("gorevlendirmeler")) {
    if (/^\/muhasebe\/personel\/\d+/.test(pathname)) return "Personel Detayı";
  }
  if (pathname.startsWith("/muhasebe/finans/")) {
    if (pathname.includes("cari-hesaplar")) return "Finans · Cari Hesaplar";
    if (pathname.includes("gelir")) return "Finans · Gelir";
    if (pathname.includes("gider")) return "Finans · Gider";
    if (pathname.includes("rapor")) return "Finans · Raporlama";
    return "Finans";
  }
  if (pathname.startsWith("/muhasebe/odeme-takip/")) return "Sözleşme/Tahsilat";
  const sorted = Object.keys(PAGE_TITLES).sort((a, b) => b.length - a.length);
  const match = sorted.find((p) => pathname.startsWith(p));
  return match ? PAGE_TITLES[match] : "Muhasebe Portalı";
}

export default function MuhasebeLayout({ children }: { children: ReactNode }) {
  const { user, isLoading, isAuthenticated, logout } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const { isOpen: sidebarOpen, toggle: toggleSidebar } = useMuhasebeSidebarCollapse();

  const pageTitle = useMemo(() => resolvePageTitle(pathname), [pathname]);

  useEffect(() => {
    if (isLoading) return;

    if (!isAuthenticated) {
      router.replace("/?giris=1");
      return;
    }

    if (!canAccessMuhasebePortal(user)) {
      router.replace("/dashboard");
      return;
    }

    if (isMuhasebeOnlyUser(user) && pathname.startsWith("/admin")) {
      router.replace("/muhasebe/dashboard");
    }
  }, [isLoading, isAuthenticated, user, pathname, router]);

  const handleLogout = () => {
    logout().then(() => router.push("/?giris=1"));
  };

  if (isLoading || !isAuthenticated || !canAccessMuhasebePortal(user) || !user) {
    return (
      <div className="muhasebe-auth-loading">
        <div className="muhasebe-auth-spinner" />
      </div>
    );
  }

  return (
    <KurumProvider>
      <div className={`muhasebe-shell${sidebarOpen ? " muhasebe-sidebar-open" : " muhasebe-shell-collapsed"}`}>
        {sidebarOpen && (
          <button
            type="button"
            className="muhasebe-sidebar-backdrop"
            aria-label="Menüyü kapat"
            onClick={toggleSidebar}
          />
        )}

        <Suspense fallback={null}>
          <MuhasebeSidebar
            isOpen={sidebarOpen}
            onToggle={toggleSidebar}
            onLogout={handleLogout}
          />
        </Suspense>

        <div className="muhasebe-main">
          <MuhasebeTopbar
            title={pageTitle}
            user={user}
            sidebarOpen={sidebarOpen}
            onToggleSidebar={toggleSidebar}
            onLogout={handleLogout}
          />
          <main className="muhasebe-content">{children}</main>
        </div>

        <MuhasebeBottomNav onMenuClick={toggleSidebar} menuOpen={sidebarOpen} />
      </div>
      <ActiveKurumBranding />
      <GorevEkranMesajiOverlay />
    </KurumProvider>
  );
}
