import { PermissionChecks } from "@/app/roles/role.permissions";

/**
 * Akademik Operasyon modülü yetki kodları — backend
 * `apps/academic/interfaces/permissions.py` ile birebir aynı.
 */
export const AKADEMIK_READ_PERMISSIONS = [
  "sinif.read",
  "sinif.write",
  "sinif.manage",
  "egitim_tanimlari.read",
  "egitim_tanimlari.write",
  "egitim_tanimlari.manage",
  "ozel_ders.read",
  "ozel_ders.write",
  "ozel_ders.manage",
];

export const AKADEMIK_WRITE_PERMISSIONS = [
  "sinif.write",
  "sinif.manage",
  "egitim_tanimlari.write",
  "egitim_tanimlari.manage",
  "ozel_ders.write",
  "ozel_ders.manage",
];

/** Admin / muhasebe — Akademik Operasyonlarda tam yetki (backend ile uyumlu). */
export function hasAkademikFullAccess(user?: {
  role_code?: string | null;
  is_staff?: boolean;
  is_superuser?: boolean;
  permissions?: string[];
} | null): boolean {
  if (!user) return false;
  if (user.is_staff || user.is_superuser) return true;
  if ((user.role_code || "").trim().toLowerCase() === "muhasebe") return true;
  if (user.permissions?.includes("sistem.admin")) return true;
  return false;
}

export function canReadAkademik(
  userPermissions: string[] = [],
  user?: { role_code?: string | null; is_staff?: boolean; is_superuser?: boolean; permissions?: string[] } | null,
): boolean {
  if (hasAkademikFullAccess(user ?? { permissions: userPermissions })) return true;
  return PermissionChecks.hasAnyPermission(userPermissions, AKADEMIK_READ_PERMISSIONS);
}

export function canWriteAkademik(
  userPermissions: string[] = [],
  user?: { role_code?: string | null; is_staff?: boolean; is_superuser?: boolean; permissions?: string[] } | null,
): boolean {
  if (hasAkademikFullAccess(user ?? { permissions: userPermissions })) return true;
  return PermissionChecks.hasAnyPermission(userPermissions, AKADEMIK_WRITE_PERMISSIONS);
}
