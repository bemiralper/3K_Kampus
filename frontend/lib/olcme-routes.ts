export const ADMIN_OLCME_BASE = '/admin/olcme-degerlendirme';
export const COACH_OLCME_BASE = '/coach/olcme-degerlendirme';

export function getOlcmeBasePath(pathname?: string | null): string {
  if (pathname?.startsWith(COACH_OLCME_BASE)) return COACH_OLCME_BASE;
  return ADMIN_OLCME_BASE;
}

export function olcmeHref(base: string, segment?: string): string {
  if (!segment) return base;
  return `${base}/${segment.replace(/^\//, '')}`;
}

/** Sınav listesi aktif kalsın; yeni sınav ve oturum grupları kendi maddelerinde kalsın. */
export function isCoachOlcmeListPath(pathname: string): boolean {
  if (pathname === COACH_OLCME_BASE || pathname === `${COACH_OLCME_BASE}/`) return true;
  return /^\/coach\/olcme-degerlendirme\/\d+(?:\/|$)/.test(pathname);
}
