export const ADMIN_KUTUPHANE_BASE = '/admin/kutuphane';
export const COACH_KUTUPHANE_BASE = '/coach/kutuphane';

export const KUTUPHANE_NAV_ITEMS = [
  { segment: '', label: 'Dashboard', icon: '📊' },
  { segment: 'salonlar', label: 'Salonlar', icon: '🏛️' },
  { segment: 'dolaplar', label: 'Dolaplar', icon: '🗄️' },
  { segment: 'atamalar', label: 'Öğrenci Atamaları', icon: '👤' },
  { segment: 'ders-programi', label: 'Ders Programı', icon: '📅' },
  { segment: 'izinler', label: 'İzinler', icon: '📝' },
  { segment: 'analitik', label: 'Analitik', icon: '📈' },
] as const;

export function getKutuphaneBasePath(pathname?: string | null): string {
  if (pathname?.startsWith(COACH_KUTUPHANE_BASE)) {
    return COACH_KUTUPHANE_BASE;
  }
  return ADMIN_KUTUPHANE_BASE;
}

export function kutuphaneHref(basePath: string, segment?: string): string {
  if (!segment) return basePath;
  return `${basePath}/${segment.replace(/^\//, '')}`;
}

export function isCoachKutuphanePath(pathname?: string | null): boolean {
  return Boolean(pathname?.startsWith(COACH_KUTUPHANE_BASE));
}
