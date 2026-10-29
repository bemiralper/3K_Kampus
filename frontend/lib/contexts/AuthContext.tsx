"use client";

import React, { createContext, useContext, useState, useEffect, ReactNode, useCallback, useRef } from "react";
import { isIdleTimedOut, touchActivity, useIdleTimeout } from "@/lib/hooks/useIdleTimeout";

// Use relative URLs to go through Next.js proxy (same origin = no CORS/cookie issues)
// The proxy is configured in next.config.js to forward /api/* to backend
const USE_PROXY = true;

function getApiBaseUrl(): string {
  if (USE_PROXY) {
    // Use Next.js proxy - requests go to same origin, then proxied to backend
    return "/api";
  }
  
  // Direct backend URL (cross-origin, may have cookie issues)
  const ENV_BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL;
  if (typeof window !== "undefined") {
    const hostname = window.location.hostname;
    if (ENV_BACKEND_URL) {
      try {
        const envUrl = new URL(ENV_BACKEND_URL);
        if (envUrl.hostname === "localhost" && hostname !== "localhost") {
          return `http://${hostname}:8000`;
        }
        return ENV_BACKEND_URL;
      } catch {
        return `http://${hostname}:8000`;
      }
    }
    return `http://${hostname}:8000`;
  }
  return ENV_BACKEND_URL || "http://localhost:8000";
}

// Types
export interface User {
  id: number;
  username: string;
  email: string;
  first_name: string;
  last_name: string;
  is_staff: boolean;
  is_superuser: boolean;
  role_code?: string | null;
  personel_id?: number | null;
  coach_profile_id?: number | null;
  personel_fotograf?: string | null;
  personel_telefon?: string | null;
  personel_email?: string | null;
  must_change_password?: boolean;
  permissions?: string[];
  portals?: { code: "admin" | "coach" | "muhasebe"; label: string; role_code?: string | null }[];
  teacher_portal?: boolean;
  active_portal?: "admin" | "coach" | "muhasebe" | null;
}

interface AuthContextData {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (username: string, password: string) => Promise<{ success: boolean; error?: string; user?: User }>;
  logout: () => Promise<void>;
  checkAuth: () => Promise<void>;
}

const AuthContext = createContext<AuthContextData | undefined>(undefined);

const AUTH_USER_CACHE_KEY = "3k_auth_user";
const AUTH_RETRY_LIMIT = 4;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Sunucu yeniden başlarken veya vekil 502 dönerken oturum bitmiş sayılmaz. */
function isTransientAuthFailure(status: number): boolean {
  return status === 408 || status === 429 || status >= 500;
}

function readCachedUser(): User | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(AUTH_USER_CACHE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as User;
  } catch {
    return null;
  }
}

function writeCachedUser(user: User | null) {
  if (typeof window === "undefined") return;
  try {
    if (user) sessionStorage.setItem(AUTH_USER_CACHE_KEY, JSON.stringify(user));
    else sessionStorage.removeItem(AUTH_USER_CACHE_KEY);
  } catch {
    /* ignore quota / private mode */
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  // Always start as null so SSR HTML and the first client paint match.
  // Reading sessionStorage here made phones (iOS) hydrate the landing footer
  // as a spinner and throw "text node for <vergi no> in <p>".
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const isCheckingRef = useRef(false);
  const hasCheckedRef = useRef(false);
  const authEpochRef = useRef(0);
  
  // Get API base URL
  const apiBaseUrl = getApiBaseUrl();

  const holdCachedSession = useCallback(() => {
    const cached = readCachedUser();
    if (cached) setUser(cached);
    return cached;
  }, []);

  // Check authentication status
  const checkAuth = useCallback(async () => {
    // Prevent concurrent auth checks
    if (isCheckingRef.current) {
      console.log("[Auth] Auth check already in progress, skipping");
      return;
    }
    
    isCheckingRef.current = true;
    const epoch = authEpochRef.current;
    
    try {
      const url = `${apiBaseUrl}/auth/api/me/`;
      console.log("[Auth] Checking auth, URL:", url);

      let response: Response | null = null;
      let lastError: unknown = null;
      for (let attempt = 0; attempt <= AUTH_RETRY_LIMIT; attempt += 1) {
        if (authEpochRef.current !== epoch) return;
        try {
          response = await fetch(url, {
            method: "GET",
            credentials: "include",
            headers: {
              "Content-Type": "application/json",
              "Cache-Control": "no-cache, no-store, must-revalidate",
              "Pragma": "no-cache",
              "Expires": "0",
            },
          });
          lastError = null;
          if (!isTransientAuthFailure(response.status) || attempt === AUTH_RETRY_LIMIT) {
            break;
          }
        } catch (error) {
          lastError = error;
          response = null;
          if (attempt === AUTH_RETRY_LIMIT) break;
        }
        // Önbellekteki oturumu ekranda tut. Sunucu kalkınca aynı kontrol yenilenir.
        if (attempt === 0 && authEpochRef.current === epoch && holdCachedSession()) {
          setIsLoading(false);
        }
        await sleep(400 * (attempt + 1));
      }

      if (authEpochRef.current !== epoch) return;

      if (!response) {
        console.error("[Auth] Auth check failed:", lastError);
        if (!holdCachedSession()) {
          setUser(null);
        }
        return;
      }

      console.log("[Auth] Response status:", response.status);

      if (response.ok) {
        const data = await response.json();
        if (authEpochRef.current !== epoch) return;
        console.log("[Auth] Response data:", data);
        if (data.authenticated && data.user) {
          setUser(data.user);
          writeCachedUser(data.user);
          touchActivity();
        } else {
          if (data.session_expired) {
            window.dispatchEvent(new CustomEvent("3k:session-expired"));
          }
          console.log("[Auth] Not authenticated. Cookies visible to JS:", document.cookie);
          setUser(null);
          writeCachedUser(null);
        }
        return;
      }

      console.log("[Auth] Auth failed with status", response.status);
      if (response.status === 401) {
        let idle = false;
        try {
          const data = await response.json();
          idle = data.code === "session_idle_timeout";
        } catch {
          /* ignore parse errors */
        }
        setUser(null);
        writeCachedUser(null);
        if (idle) {
          window.dispatchEvent(new CustomEvent("3k:session-expired"));
        }
        return;
      }

      if (!holdCachedSession()) {
        setUser(null);
      }
    } finally {
      isCheckingRef.current = false;
      hasCheckedRef.current = true;
      setIsLoading(false);
    }
  }, [apiBaseUrl, holdCachedSession]);

  // Login
  const login = useCallback(async (username: string, password: string): Promise<{ success: boolean; error?: string; user?: User }> => {
    const trimmedUsername = username.trim();
    const trimmedPassword = password.trim();
    try {
      const response = await fetch(`${apiBaseUrl}/auth/api/login/`, {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ username: trimmedUsername, password: trimmedPassword }),
      });

      let data: { success?: boolean; error?: string; user?: User } = {};
      const contentType = response.headers.get("content-type") || "";
      if (contentType.includes("application/json")) {
        try {
          data = await response.json();
        } catch (parseError) {
          console.error("Login JSON parse failed:", parseError);
          return {
            success: false,
            error: response.ok ? "Giris basarisiz" : `Sunucu yaniti okunamadi (${response.status})`,
          };
        }
      } else if (!response.ok) {
        return { success: false, error: `Sunucu hatasi (${response.status})` };
      }

      if (response.ok && data.success && data.user) {
        setUser(data.user);
        writeCachedUser(data.user);
        touchActivity();
        return { success: true, user: data.user };
      } else {
        return { success: false, error: data.error || "Giris basarisiz" };
      }
    } catch (error) {
      console.error("Login failed:", error);
      return { success: false, error: "Baglanti hatasi. Lutfen tekrar deneyin." };
    }
  }, [apiBaseUrl]);

  // Logout
  const logout = useCallback(async () => {
    authEpochRef.current += 1;
    try {
      await fetch(`${apiBaseUrl}/auth/api/logout/`, {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
        },
      });
    } catch (error) {
      console.error("Logout error:", error);
    } finally {
      setUser(null);
      writeCachedUser(null);
      if (typeof sessionStorage !== 'undefined') {
        sessionStorage.removeItem('gorev-ekran-sound-played');
      }
    }
  }, [apiBaseUrl]);

  const handleIdleLogout = useCallback(async () => {
    if (!user) return;
    await logout();
    if (typeof window !== "undefined") {
      window.location.href = "/?giris=1&timeout=1";
    }
  }, [logout, user]);

  // Çıkıştan hemen önce ortak sayacı tekrar oku. Aralık dolmuşken diğer sekme
  // işlem yaptıysa bu sekme oturumu kapatmasın. Sunucunun bildirdiği bitiş
  // (3k:session-expired) bu kontrolden geçmez; handleIdleLogout doğrudan çağrılır.
  useIdleTimeout(() => {
    if (!isIdleTimedOut()) return;
    void handleIdleLogout();
  }, !!user);

  // Tek bir uç noktanın geçici 401'i (worker timeout, rapor widget'ı, yarış durumu)
  // tüm oturumu düşürmesin: çıkıştan önce /auth/api/me/ ile gerçekten bitmiş mi doğrula.
  const isSessionTrulyExpired = useCallback(async (): Promise<boolean> => {
    try {
      const response = await fetch(`${apiBaseUrl}/auth/api/me/`, {
        method: "GET",
        credentials: "include",
        headers: { "Cache-Control": "no-cache, no-store, must-revalidate" },
      });
      let data: unknown = null;
      try {
        data = await response.json();
      } catch {
        data = null;
      }
      if (!response.ok) {
        // 502/500 ve gövdesiz 401 çıkış yaptırmaz; aksi halde logout çerezi siler.
        if (isTransientAuthFailure(response.status)) return false;
        if (data && typeof data === "object") {
          const code = (data as { code?: string }).code;
          return code === "session_idle_timeout" || code === "not_authenticated";
        }
        return false;
      }
      if (!data || typeof data !== "object") return false;
      const body = data as { authenticated?: boolean; user?: unknown; session_expired?: boolean; code?: string };
      if (body.session_expired || body.code === "session_idle_timeout") return true;
      return !(body.authenticated && body.user);
    } catch {
      // Ağ hatasında oturumu düşürme — kullanıcı çalışmaya devam edebilsin.
      return false;
    }
  }, [apiBaseUrl]);

  useEffect(() => {
    const onExpired = () => {
      // Tam DB restore oturum tablosunu siler; polling 401'i "oturum bitti" sanıp
      // hemen çıkışa atmasın — kullanıcıya restore sonrası login mesajı bırakılsın.
      try {
        if (window.sessionStorage.getItem('yedekleme_restore_in_progress') === '1') {
          window.sessionStorage.removeItem('yedekleme_restore_in_progress');
          // Eski eğitim yılı localStorage'da kalırsa boş liste görünür (ör. 2027-2028).
          window.localStorage.removeItem('3k_active_egitim_yili');
          window.location.href = '/login?restored=1';
          return;
        }
      } catch {
        /* ignore */
      }
      void isSessionTrulyExpired().then((expired) => {
        if (expired) void handleIdleLogout();
      });
    };
    window.addEventListener("3k:session-expired", onExpired);
    return () => window.removeEventListener("3k:session-expired", onExpired);
  }, [handleIdleLogout, isSessionTrulyExpired]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      if (new URLSearchParams(window.location.search).get('restored') === '1') {
        localStorage.removeItem('3k_active_egitim_yili');
      }
    } catch {
      /* ignore */
    }
  }, []);

  // Check auth on mount - only once
  useEffect(() => {
    if (!hasCheckedRef.current) {
      checkAuth();
    }
  }, [checkAuth]);

  return (
    <AuthContext.Provider
      value={{
        user,
        isAuthenticated: !!user,
        isLoading,
        login,
        logout,
        checkAuth,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
