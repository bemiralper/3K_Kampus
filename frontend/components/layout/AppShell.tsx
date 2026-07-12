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
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [isMobile, setIsMobile] = useState(false);
  const [isInitialized, setIsInitialized] = useState(false);

  useEffect(() => {
    const checkMobile = () => {
      const mobile = window.innerWidth < 992;
      setIsMobile(mobile);
      // Mobilde daraltılmış (gizli) kalsın; masaüstünde kayıtlı tercihi koru
      if (mobile && !isInitialized) {
        setSidebarOpen(false);
      }
    };
    
    checkMobile();
    
    if (!isInitialized) {
      const savedState = localStorage.getItem("sidebarOpen");
      if (window.innerWidth < 992) {
        setSidebarOpen(false);
      } else if (savedState !== null) {
        try {
          setSidebarOpen(JSON.parse(savedState));
        } catch {
          setSidebarOpen(true);
        }
      } else {
        setSidebarOpen(true);
      }
      setIsInitialized(true);
    }
    
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, [isInitialized]);

  const toggleSidebar = () => {
    setSidebarOpen((prev) => {
      const newState = !prev;
      localStorage.setItem("sidebarOpen", JSON.stringify(newState));
      return newState;
    });
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
          <Sidebar isOpen={isInitialized ? sidebarOpen : true} onToggle={toggleSidebar} />
        </Suspense>
        <div 
          className={`sidebar-overlay ${sidebarOpen && isMobile && isInitialized ? "show" : ""}`}
          onClick={closeSidebar}
        />
        <div 
          className="app-main"
          style={{
            marginLeft: isInitialized && !isMobile ? (sidebarOpen ? "250px" : "78px") : !isMobile ? "250px" : "0",
            width: isInitialized && !isMobile ? `calc(100% - ${sidebarOpen ? "250px" : "78px"})` : !isMobile ? "calc(100% - 250px)" : "100%",
            maxWidth: isInitialized && !isMobile ? `calc(100% - ${sidebarOpen ? "250px" : "78px"})` : !isMobile ? "calc(100% - 250px)" : "100%",
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
