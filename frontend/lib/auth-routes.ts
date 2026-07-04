import type { User } from "@/lib/contexts/AuthContext";

function normalizeRoleCode(roleCode?: string | null): string | null {
  if (!roleCode) return null;
  return roleCode.trim().toLowerCase();
}

function hasPermission(user: User | null, code: string): boolean {
  return !!user?.permissions?.includes(code);
}

function hasActiveCoachProfile(user: User | null): boolean {
  return !!user?.coach_profile_id;
}

function isAdminUser(user: User | null): boolean {
  return !!user && (user.is_staff || user.is_superuser);
}

function isMuhasebeRole(user: User | null): boolean {
  return normalizeRoleCode(user?.role_code) === "muhasebe";
}

function hasMuhasebePortalPermissions(user: User | null): boolean {
  if (!user || isAdminUser(user)) return false;
  return (
    hasPermission(user, "finans.manage") ||
    hasPermission(user, "finans.write") ||
    hasPermission(user, "finans.read")
  );
}

/** Koç portalına erişebilen kullanıcı (aktif koç profili veya yönetici). */
export function canAccessCoachPortal(user: User | null): boolean {
  if (!user) return false;
  if (normalizeRoleCode(user.role_code) === "koc" || hasActiveCoachProfile(user)) return true;
  return isAdminUser(user);
}

/** Yalnızca koç portalını kullanan kullanıcı (admin paneli ana girişi değil). */
export function isCoachOnlyUser(user: User | null): boolean {
  if (!user || isAdminUser(user)) return false;
  if (normalizeRoleCode(user.role_code) === "koc" || hasActiveCoachProfile(user)) return true;
  return false;
}

/** Muhasebe portalına erişebilen kullanıcı (muhasebe rolü veya yönetici). */
export function canAccessMuhasebePortal(user: User | null): boolean {
  if (!user) return false;
  if (isMuhasebeRole(user) || hasMuhasebePortalPermissions(user)) return true;
  return isAdminUser(user);
}

/** Yalnızca muhasebe portalını kullanan kullanıcı (admin paneli ana girişi değil). */
export function isMuhasebeOnlyUser(user: User | null): boolean {
  if (!user || isAdminUser(user)) return false;
  if (isCoachOnlyUser(user)) return false;
  return isMuhasebeRole(user) || hasMuhasebePortalPermissions(user);
}

/** Öğrenci detayında koç atama/değiştirme (muhasebe, yönetici, admin). */
export function canManageCoachAssignment(user: User | null): boolean {
  if (!user) return false;
  if (isAdminUser(user)) return true;
  if (isMuhasebeRole(user)) return true;
  return hasPermission(user, "ogrenci.manage");
}

/** Giriş sonrası varsayılan ana sayfa yolu. */
export function getDefaultHomePath(user: User | null): string {
  if (isCoachOnlyUser(user)) return "/coach/dashboard";
  if (isMuhasebeOnlyUser(user)) return "/muhasebe/dashboard";
  return "/dashboard";
}
