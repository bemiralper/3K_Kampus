import type { User } from "@/lib/contexts/AuthContext";
import { portalHomePath, readStoredPortal, type PortalView } from "@/lib/profile-api";

export type PortalCode = PortalView;

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

export function assignedPortalCodes(user: User | null): PortalCode[] {
  const codes: PortalCode[] = [];
  for (const portal of user?.portals ?? []) {
    if (portal.code !== "admin" && portal.code !== "coach" && portal.code !== "muhasebe") continue;
    if (!codes.includes(portal.code)) codes.push(portal.code);
  }
  return codes;
}

/** Hatırlanan veya oturumdaki panel. Birden fazla panelde seçim yoksa null. */
export function resolveActivePortal(user: User | null): PortalCode | null {
  if (!user) return null;
  const assigned = assignedPortalCodes(user);
  const session = user.active_portal;
  const stored = readStoredPortal();
  const explicit =
    session === "admin" || session === "coach" || session === "muhasebe"
      ? session
      : stored;

  if (assigned.length > 1) {
    if (explicit && assigned.includes(explicit)) return explicit;
    if (isAdminUser(user) && explicit) return explicit;
    return null;
  }

  if (isAdminUser(user)) {
    if (explicit) return explicit;
    return "admin";
  }

  if (assigned.length === 1) return assigned[0];
  return null;
}

export function needsPortalPicker(user: User | null): boolean {
  if (!user) return false;
  return assignedPortalCodes(user).length > 1 && resolveActivePortal(user) === null;
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
  const assigned = assignedPortalCodes(user);
  if (assigned.length > 1) return false;
  if (assigned.length === 1) return assigned[0] === "coach";
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
  const assigned = assignedPortalCodes(user);
  if (assigned.length > 1) return false;
  if (assigned.length === 1) return assigned[0] === "muhasebe";
  if (isCoachOnlyUser(user)) return false;
  return isMuhasebeRole(user) || hasMuhasebePortalPermissions(user);
}

/** Koç kabuğunda kalınabilir mi? Birden fazla paneli olan kişide yalnızca seçili panel koç ise. */
export function canStayOnCoachPortal(user: User | null): boolean {
  if (!user || needsPortalPicker(user)) return false;
  if (assignedPortalCodes(user).length > 1) return resolveActivePortal(user) === "coach";
  return canAccessCoachPortal(user);
}

/** Muhasebe kabuğunda kalınabilir mi? */
export function canStayOnMuhasebePortal(user: User | null): boolean {
  if (!user || needsPortalPicker(user)) return false;
  if (assignedPortalCodes(user).length > 1) return resolveActivePortal(user) === "muhasebe";
  return canAccessMuhasebePortal(user);
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
  if (needsPortalPicker(user)) return "/portal-sec";
  const active = resolveActivePortal(user);
  if (active) return portalHomePath(active);
  if (isCoachOnlyUser(user)) return "/coach/dashboard";
  if (isMuhasebeOnlyUser(user)) return "/muhasebe/dashboard";
  return "/dashboard";
}

/** Admin iletişim derin bağlantısını portal kullanıcısının sohbetler sayfasına taşı. */
export function toPortalInboxPath(
  user: User | null,
  pathname: string,
  search = "",
): string | null {
  const isInbox =
    pathname.startsWith("/admin/iletisim/sohbetler")
    || pathname.startsWith("/admin/iletisim/mesajlar")
    || pathname.startsWith("/coach/sohbetler")
    || pathname.startsWith("/coach/mesajlar")
    || pathname.startsWith("/muhasebe/iletisim/sohbetler")
    || pathname.startsWith("/muhasebe/iletisim/mesajlar");
  if (!isInbox) return null;
  const conv = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search)
    .get("conversation");
  const suffix = conv ? `?conversation=${encodeURIComponent(conv)}` : "";
  const active = resolveActivePortal(user);
  if (active === "muhasebe" || isMuhasebeOnlyUser(user)) return `/muhasebe/iletisim/sohbetler${suffix}`;
  if (active === "coach" || isCoachOnlyUser(user)) return `/coach/sohbetler${suffix}`;
  if (suffix) return `/admin/iletisim/sohbetler${suffix}`;
  return null;
}
