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
  "/muhasebe/profil": "Profilim",
  "/muhasebe/kurum/egitim-tanimlari": "Eğitim Tanımları",
  "/muhasebe/kurum/egitim-paketleri": "Eğitim Paketleri",
  "/muhasebe/kurum/kimlik-cakismalari": "Kimlik Çakışmaları",
  "/muhasebe/kutuphane": "Kütüphane",
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
  if (pathname.startsWith("/muhasebe/kurum/")) {
    if (pathname.includes("kimlik-cakismalari")) return "Kimlik Çakışmaları";
    if (pathname.includes("egitim-paketleri")) return "Eğitim Paketleri";
    if (pathname.includes("egitim-tanimlari")) return "Eğitim Tanımları";
    return "Kurum";
  }
  if (pathname.startsWith("/muhasebe/kutuphane/")) {
    if (pathname.includes("salonlar")) return "Kütüphane · Salonlar";
    if (pathname.includes("dolaplar")) return "Kütüphane · Dolaplar";
    if (pathname.includes("atamalar")) return "Kütüphane · Atamalar";
    if (pathname.includes("ders-programi")) return "Kütüphane · Ders Programı";
    if (pathname.includes("izinler")) return "Kütüphane · İzinler";
    if (pathname.includes("analitik")) return "Kütüphane · Analitik";
    return "Kütüphane";
  }
  const sorted = Object.keys(PAGE_TITLES).sort((a, b) => b.length - a.length);
  const match = sorted.find((p) => pathname.startsWith(p));
  return match ? PAGE_TITLES[match] : "Muhasebe Portalı";
}

export default function MuhasebeLayout({ children }: { children: ReactNode }) {
  const { user, isLoading, isAuthenticated, logout } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const {
    isSidebarWide,
    isDesktop,
    mobileDrawerOpen,
    toggle: toggleSidebar,
    closeMobileDrawer,
  } = useMuhasebeSidebarCollapse();

  const pageTitle = useMemo(() => resolvePageTitle(pathname), [pathname]);

  useEffect(() => {
    if (!mobileDrawerOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeMobileDrawer();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [mobileDrawerOpen, closeMobileDrawer]);

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

  const shellClass = isSidebarWide ? " muhasebe-sidebar-open" : " muhasebe-shell-collapsed";

  return (
    <KurumProvider>
      <div className={`muhasebe-shell${shellClass}`}>
        <Suspense fallback={null}>
          <MuhasebeSidebar
            isOpen={isSidebarWide}
            isDesktop={isDesktop}
            mobileDrawerOpen={mobileDrawerOpen}
            onToggle={toggleSidebar}
            onCloseMobile={closeMobileDrawer}
            onLogout={handleLogout}
          />
        </Suspense>

        {!isDesktop && mobileDrawerOpen && (
          <button
            type="button"
            className="muhasebe-sidebar-backdrop"
            aria-label="Menüyü kapat"
            onClick={closeMobileDrawer}
          />
        )}

        <div className="muhasebe-main">
          <MuhasebeTopbar
            title={pageTitle}
            user={user}
            sidebarOpen={isSidebarWide}
            onToggleSidebar={toggleSidebar}
            onLogout={handleLogout}
          />
          <main className="muhasebe-content">{children}</main>
        </div>

        <MuhasebeBottomNav onMenuClick={toggleSidebar} menuOpen={mobileDrawerOpen} />
      </div>
      <ActiveKurumBranding />
      <GorevEkranMesajiOverlay />
    </KurumProvider>
  );
}
