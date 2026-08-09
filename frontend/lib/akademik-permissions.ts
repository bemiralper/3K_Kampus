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
  "egitim_tanimlari.manage",
];

export const AKADEMIK_WRITE_PERMISSIONS = [
  "sinif.write",
  "sinif.manage",
  "egitim_tanimlari.manage",
];

export function canReadAkademik(userPermissions: string[] = []): boolean {
  return PermissionChecks.hasAnyPermission(userPermissions, AKADEMIK_READ_PERMISSIONS);
}

export function canWriteAkademik(userPermissions: string[] = []): boolean {
  return PermissionChecks.hasAnyPermission(userPermissions, AKADEMIK_WRITE_PERMISSIONS);
}
