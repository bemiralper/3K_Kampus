"use client";

import React, { createContext, useContext, useState, useEffect, ReactNode, useCallback, useRef } from "react";
import { useIdleTimeout, touchActivity } from "@/lib/hooks/useIdleTimeout";

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
  const [user, setUser] = useState<User | null>(() =>
    typeof window !== "undefined" ? readCachedUser() : null,
  );
  const [isLoading, setIsLoading] = useState(true);
  const isCheckingRef = useRef(false);
  const hasCheckedRef = useRef(false);
  
  // Get API base URL
  const apiBaseUrl = getApiBaseUrl();

  // Check authentication status
  const checkAuth = useCallback(async () => {
    // Prevent concurrent auth checks
    if (isCheckingRef.current) {
      console.log("[Auth] Auth check already in progress, skipping");
      return;
    }
    
    isCheckingRef.current = true;
    
    try {
      const url = `${apiBaseUrl}/auth/api/me/`;
      console.log("[Auth] Checking auth, URL:", url);

      const response = await fetch(url, {
        method: "GET",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "no-cache, no-store, must-revalidate",
          "Pragma": "no-cache",
          "Expires": "0",
        },
      });

      console.log("[Auth] Response status:", response.status);

      if (response.ok) {
        const data = await response.json();
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
      } else {
        console.log("[Auth] Auth failed with status", response.status);
        if (response.status === 401) {
          try {
            const data = await response.json();
            if (data.code === "session_idle_timeout") {
              window.dispatchEvent(new CustomEvent("3k:session-expired"));
            }
          } catch {
            /* ignore parse errors */
          }
        }
        setUser(null);
        writeCachedUser(null);
      }
    } catch (error) {
      console.error("[Auth] Auth check failed:", error);
      if (!readCachedUser()) {
        setUser(null);
        writeCachedUser(null);
      }
    } finally {
      isCheckingRef.current = false;
      hasCheckedRef.current = true;
      setIsLoading(false);
    }
  }, [apiBaseUrl]);

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

  useIdleTimeout(handleIdleLogout, !!user);

  useEffect(() => {
    const onExpired = () => {
      void handleIdleLogout();
    };
    window.addEventListener("3k:session-expired", onExpired);
    return () => window.removeEventListener("3k:session-expired", onExpired);
  }, [handleIdleLogout]);

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
