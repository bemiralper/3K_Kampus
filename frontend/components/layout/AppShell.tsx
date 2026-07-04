"use client";

import type { ReactNode } from "react";
import { Suspense, useState, useEffect } from "react";
import Sidebar from "@/components/layout/Sidebar";
import Topbar from "@/components/layout/Topbar";
import LegacyScripts from "@/components/LegacyScripts";
import GorevEkranMesajiOverlay from "@/components/gorev/GorevEkranMesajiOverlay";
import { ActiveKurumBranding } from "@/components/branding/KurumLogo";
import { KurumProvider } from "@/lib/contexts/KurumContext";

export default function AppShell({ children }: { children: ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [isInitialized, setIsInitialized] = useState(false);

  useEffect(() => {
    const checkMobile = () => {
      const mobile = window.innerWidth < 992;
      setIsMobile(mobile);
    };
    
    checkMobile();
    
    // localStorage'dan sidebar durumunu oku
    if (!isInitialized) {
      const savedState = localStorage.getItem("sidebarOpen");
      if (savedState !== null) {
        setSidebarOpen(JSON.parse(savedState));
      } else {
        // İlk açılışta masaüstünde açık, mobilde kapalı
        setSidebarOpen(window.innerWidth >= 992);
      }
      setIsInitialized(true);
    }
    
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, [isInitialized]);

  const toggleSidebar = () => {
    const newState = !sidebarOpen;
    setSidebarOpen(newState);
    // Durumu localStorage'a kaydet
    localStorage.setItem("sidebarOpen", JSON.stringify(newState));
  };

  const closeSidebar = () => {
    if (isMobile) {
      setSidebarOpen(false);
      localStorage.setItem("sidebarOpen", JSON.stringify(false));
    }
  };

  return (
    <KurumProvider>
      <div className="app-container">
        <Suspense fallback={null}>
          <Sidebar isOpen={sidebarOpen && isInitialized} onToggle={toggleSidebar} />
        </Suspense>
        <div 
          className={`sidebar-overlay ${sidebarOpen && isMobile && isInitialized ? "show" : ""}`}
          onClick={closeSidebar}
        />
        <div 
          className="app-main"
          style={{
            marginLeft: isInitialized && !isMobile ? (sidebarOpen ? "250px" : "78px") : !isMobile ? "78px" : "0",
            width: isInitialized && !isMobile ? `calc(100% - ${sidebarOpen ? "250px" : "78px"})` : !isMobile ? "calc(100% - 78px)" : "100%",
            maxWidth: isInitialized && !isMobile ? `calc(100% - ${sidebarOpen ? "250px" : "78px"})` : !isMobile ? "calc(100% - 78px)" : "100%",
            transition: "all 0.4s cubic-bezier(0.4, 0, 0.2, 1)"
          }}
        >
          <Topbar onMenuClick={toggleSidebar} />
          <main className="app-content">{children}</main>
        </div>
        <ActiveKurumBranding />
        <GorevEkranMesajiOverlay />
        <LegacyScripts />
      </div>
    </KurumProvider>
  );
}
