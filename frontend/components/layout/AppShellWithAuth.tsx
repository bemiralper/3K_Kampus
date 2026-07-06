"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
import { useAuth } from "@/lib/contexts/AuthContext";
import { getDefaultHomePath, isCoachOnlyUser, isMuhasebeOnlyUser } from "@/lib/auth-routes";
import { getContextGate } from "@/lib/post-login-routing";
import AppShell from "@/components/layout/AppShell";

/** router.replace yerine — Next.js 14 parallelRoutes.get önbellek hatasını önler */
function hardReplace(path: string) {
  if (typeof window === "undefined") return;
  const target = path.startsWith("/") ? path : `/${path}`;
  const current = `${window.location.pathname}${window.location.search}`;
  if (current === target) return;
  window.location.replace(target);
}

// Routes that don't require authentication
const PUBLIC_ROUTE_PREFIXES = ["/login", "/yasal", "/duyurular", "/3k-sistemi", "/hakkimizda"];
const CONTEXT_PICKER_ROUTES = ["/kurum-sec", "/sube-sec"];
const PRINT_ROUTES = ["/print"];

function isPublicPath(pathname: string): boolean {
  if (pathname === "/") return true;
  return PUBLIC_ROUTE_PREFIXES.some(
    (route) => pathname === route || pathname.startsWith(`${route}/`),
  );
}

function isContextPickerPath(pathname: string): boolean {
  return CONTEXT_PICKER_ROUTES.some(
    (route) => pathname === route || pathname.startsWith(`${route}/`),
  );
}

function AuthLoadingSpinner() {
  return (
    <div className="auth-loading">
      <div className="auth-loading-spinner"></div>
      <style jsx>{`
        .auth-loading {
          min-height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
          background: linear-gradient(135deg, #1e3a5f 0%, #2d5a87 50%, #1e3a5f 100%);
        }
        .auth-loading-spinner {
          width: 50px;
          height: 50px;
          border: 4px solid rgba(255, 255, 255, 0.3);
          border-top-color: white;
          border-radius: 50%;
          animation: spin 1s linear infinite;
        }
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}

export default function AppShellWithAuth({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { user, isAuthenticated, isLoading } = useAuth();
  const hasRedirectedRef = useRef(false);

  const isPublicRoute = isPublicPath(pathname);
  const isContextPickerRoute = isContextPickerPath(pathname);
  const isPrintRoute = PRINT_ROUTES.some(route => pathname.startsWith(route));
  const isCoachRoute = pathname.startsWith("/coach");
  const isMuhasebeRoute = pathname.startsWith("/muhasebe");
  const isPortalRoute = isCoachRoute || isMuhasebeRoute;

  useEffect(() => {
    // Reset redirect flag on path change
    hasRedirectedRef.current = false;
  }, [pathname]);

  useEffect(() => {
    console.log("[AppShell] State - isLoading:", isLoading, "isAuthenticated:", isAuthenticated, "path:", pathname);
    
    // Wait for auth check to complete
    if (isLoading) {
      return;
    }

    // Prevent multiple redirects
    if (hasRedirectedRef.current) {
      return;
    }

    // Print route: token ile erişilir, auth yönlendirmesi yapma
    if (isPrintRoute) {
      return;
    }

    // If on public route and authenticated, redirect to role home
    if (isPublicRoute && isAuthenticated) {
      const home = getDefaultHomePath(user);
      console.log("[AppShell] Authenticated user on public route, redirecting to", home);
      hasRedirectedRef.current = true;
      hardReplace(home);
      return;
    }

    // If on protected route and not authenticated, redirect to landing
    if (!isPublicRoute && !isAuthenticated) {
      console.log("[AppShell] Not authenticated on protected route, redirecting to landing");
      hasRedirectedRef.current = true;
      hardReplace(isPortalRoute ? "/?giris=1" : "/");
      return;
    }

    // Portal-only user on admin route
    if (
      isAuthenticated &&
      !isPortalRoute &&
      !isPublicRoute &&
      !isContextPickerRoute &&
      (isCoachOnlyUser(user) || isMuhasebeOnlyUser(user))
    ) {
      const home = getDefaultHomePath(user);
      console.log("[AppShell] Portal-only user on admin route, redirecting to", home);
      hasRedirectedRef.current = true;
      hardReplace(home);
    }

    // Kurum/şube seçimi tamamlanmadan uygulamaya geçilmesin
    if (
      isAuthenticated &&
      !isPortalRoute &&
      !isPublicRoute &&
      !isContextPickerRoute &&
      !isPrintRoute
    ) {
      const gate = getContextGate();
      if (gate === "kurum") {
        hasRedirectedRef.current = true;
        hardReplace("/kurum-sec");
        return;
      }
      if (gate === "sube") {
        hasRedirectedRef.current = true;
        hardReplace("/sube-sec");
        return;
      }
    }
  }, [isAuthenticated, isLoading, isPortalRoute, isPublicRoute, isContextPickerRoute, isPrintRoute, pathname, user]);

  // Public sayfalar (landing vb.) auth kontrolü beklenmeden gösterilir
  if (isLoading && !isPrintRoute && !isPublicRoute) {
    return <AuthLoadingSpinner />;
  }

  // Print route: AppShell ve auth olmadan sadece içerik
  if (isPrintRoute) {
    return <>{children}</>;
  }

  // Kurum/şube seçim ekranları — sidebar olmadan tam sayfa
  if (isContextPickerRoute) {
    if (isLoading || !isAuthenticated) {
      return <AuthLoadingSpinner />;
    }
    return <>{children}</>;
  }

  // For public routes (like login), render without AppShell
  if (isPublicRoute) {
    return <>{children}</>;
  }

  // Portal rotaları kendi layout'larını kullanır (app/coach, app/muhasebe)
  if (isPortalRoute) {
    if (isLoading) {
      return <AuthLoadingSpinner />;
    }
    if (!isAuthenticated) {
      return <AuthLoadingSpinner />;
    }
    return <>{children}</>;
  }

  // For protected routes, show loading while redirecting if not authenticated
  if (!isAuthenticated) {
    return <AuthLoadingSpinner />;
  }

  // Render protected content with AppShell
  return <AppShell>{children}</AppShell>;
}
