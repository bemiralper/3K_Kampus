export const ADMIN_COACHING_BASE = '/admin/coaching';
export const MUHASEBE_COACHING_BASE = '/muhasebe/coaching';

export const COACHING_NAV_ITEMS = [
  { segment: 'coaches', label: 'Koç Yönetimi' },
  { segment: 'assignments', label: 'Koç Atama' },
] as const;

export function getCoachingBasePath(pathname?: string | null): string {
  if (pathname?.startsWith(MUHASEBE_COACHING_BASE)) {
    return MUHASEBE_COACHING_BASE;
  }
  return ADMIN_COACHING_BASE;
}

export function coachingHref(basePath: string, segment?: string): string {
  if (!segment) return `${basePath}/coaches`;
  return `${basePath}/${segment.replace(/^\//, '')}`;
}

export function isMuhasebeCoachingPath(pathname?: string | null): boolean {
  return Boolean(pathname?.startsWith(MUHASEBE_COACHING_BASE));
}
