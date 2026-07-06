"use client";

import type { ReactNode } from "react";
import { useEffect, useMemo } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/lib/contexts/AuthContext";
import { canAccessCoachPortal, isCoachOnlyUser } from "@/lib/auth-routes";
import { KurumProvider } from "@/lib/contexts/KurumContext";
import CoachSidebar, { CoachBottomNav } from "@/components/coach/CoachSidebar";
import CoachTopbar from "@/components/coach/CoachTopbar";
import { CommunicationChatProvider } from "@/components/communication/CommunicationChatProvider";
import { useCoachSidebarCollapse } from "@/hooks/useCoachSidebarCollapse";
import GorevEkranMesajiOverlay from "@/components/gorev/GorevEkranMesajiOverlay";
import { ActiveKurumBranding } from "@/components/branding/KurumLogo";
import "./coach.css";

const PAGE_TITLES: Record<string, string> = {
  "/coach/dashboard": "Bugün",
  "/coach/ogrenciler": "Öğrencilerim",
  "/coach/profil": "Profilim",
  "/coach/profil/istatistikler": "İstatistiklerim",
  "/coach/odev/kontrol": "Ödev Kontrol",
  "/coach/odev/kaynaklar": "Kaynak Kütüphanesi",
  "/coach/odev/kaynak-havuzu": "Kaynak Havuzu",
  "/coach/kutuphane": "Kütüphane",
  "/coach/gorusmeler": "Görüşmeler",
  "/coach/gorevler": "Görevler",
  "/coach/takvim": "Takvim",
  "/coach/mesajlar": "Mesajlar",
  "/coach/raporlar": "Raporlar",
};

function resolvePageTitle(pathname: string): string {
  if (pathname.startsWith("/coach/ogrenciler/")) return "Öğrenci Profili";
  if (pathname.startsWith("/coach/odev/kontrol/") && pathname.endsWith("/rapor")) return "Ödev Sonuç Raporu";
  if (pathname.startsWith("/coach/odev/kontrol/")) return "Ödev Detayı";
  if (pathname.startsWith("/coach/odev/kaynak-havuzu/")) return "Kaynak Havuzu · Öğrenci";
  if (pathname.startsWith("/coach/odev/kaynak-havuzu")) return "Kaynak Havuzu";
  if (pathname.startsWith("/coach/odev/kaynaklar")) return "Kaynak Kütüphanesi";
  if (pathname.startsWith("/coach/kutuphane/")) {
    if (pathname.includes("/atamalar")) return "Kütüphane · Öğrenci Atamaları";
    if (pathname.includes("/salonlar")) return "Kütüphane · Salonlar";
    if (pathname.includes("/dolaplar")) return "Kütüphane · Dolaplar";
    if (pathname.includes("/izinler")) return "Kütüphane · İzinler";
    if (pathname.includes("/ders-programi")) return "Kütüphane · Ders Programı";
    if (pathname.includes("/analitik")) return "Kütüphane · Analitik";
  }
  const sorted = Object.keys(PAGE_TITLES).sort((a, b) => b.length - a.length);
  const match = sorted.find((p) => pathname.startsWith(p));
  return match ? PAGE_TITLES[match] : "Koç Portalı";
}

export default function CoachLayout({ children }: { children: ReactNode }) {
  const { user, isLoading, isAuthenticated, logout } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const { isOpen: sidebarOpen, toggle: toggleSidebar } = useCoachSidebarCollapse();

  const pageTitle = useMemo(() => resolvePageTitle(pathname), [pathname]);

  useEffect(() => {
    if (isLoading) return;

    if (!isAuthenticated) {
      router.replace("/login");
      return;
    }

    if (!canAccessCoachPortal(user)) {
      router.replace("/dashboard");
      return;
    }

    if (isCoachOnlyUser(user) && pathname.startsWith("/admin")) {
      router.replace("/coach/dashboard");
    }
  }, [isLoading, isAuthenticated, user, pathname, router]);

  const handleLogout = () => {
    logout().then(() => router.push("/login"));
  };

  if (isLoading || !isAuthenticated || !canAccessCoachPortal(user) || !user) {
    return (
      <div className="coach-auth-loading">
        <div className="coach-auth-spinner" />
      </div>
    );
  }

  return (
    <KurumProvider>
      <CommunicationChatProvider>
      <div className={`coach-shell${sidebarOpen ? " coach-sidebar-open" : " coach-shell-collapsed"}`}>
        {sidebarOpen && (
          <button
            type="button"
            className="coach-sidebar-backdrop"
            aria-label="Menüyü kapat"
            onClick={toggleSidebar}
          />
        )}

        <CoachSidebar
          isOpen={sidebarOpen}
          onToggle={toggleSidebar}
          onLogout={handleLogout}
        />

        <div className="coach-main">
          <CoachTopbar
            title={pageTitle}
            user={user}
            sidebarOpen={sidebarOpen}
            onToggleSidebar={toggleSidebar}
            onLogout={handleLogout}
          />
          <main className="coach-content">{children}</main>
        </div>

        <CoachBottomNav onMenuClick={toggleSidebar} menuOpen={sidebarOpen} />
      </div>
      <ActiveKurumBranding />
      <GorevEkranMesajiOverlay />
      </CommunicationChatProvider>
    </KurumProvider>
  );
}
