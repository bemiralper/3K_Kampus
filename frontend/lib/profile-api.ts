import { apiPatch, resolveApiUrl, type ApiResponse } from "@/lib/api";
import type { User } from "@/lib/contexts/AuthContext";
import { changePassword, type ChangePasswordPayload } from "@/lib/coach-profile-api";

export type ProfileUpdatePayload = {
  username?: string;
  email?: string;
  first_name?: string;
  last_name?: string;
  telefon?: string;
  cep_telefon?: string;
  personel_email?: string;
};

export async function fetchMyProfile(): Promise<{ success: boolean; user?: User; error?: string }> {
  try {
    const res = await fetch(resolveApiUrl("/auth/api/me/"), { credentials: "include" });
    const data = await res.json();
    if (!data.success || !data.user) {
      return { success: false, error: data.error || "Profil yüklenemedi" };
    }
    return { success: true, user: data.user as User };
  } catch {
    return { success: false, error: "Bağlantı hatası" };
  }
}

export async function updateMyProfile(
  payload: ProfileUpdatePayload,
): Promise<ApiResponse<{ user: User; message?: string }>> {
  return apiPatch<{ user: User; message?: string }>("/auth/api/me/", payload);
}

export { changePassword, type ChangePasswordPayload };

export type PortalView = "admin" | "coach" | "muhasebe";

const PORTAL_STORAGE_KEY = "3k_admin_portal_view";

export function getAdminPortalView(): PortalView {
  if (typeof window === "undefined") return "admin";
  const v = localStorage.getItem(PORTAL_STORAGE_KEY);
  if (v === "coach" || v === "muhasebe" || v === "admin") return v;
  return "admin";
}

export function setAdminPortalView(view: PortalView) {
  if (typeof window === "undefined") return;
  localStorage.setItem(PORTAL_STORAGE_KEY, view);
}

export function portalHomePath(view: PortalView): string {
  if (view === "coach") return "/coach/dashboard";
  if (view === "muhasebe") return "/muhasebe/dashboard";
  return "/dashboard";
}
