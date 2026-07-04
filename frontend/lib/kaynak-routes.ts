export const ADMIN_KAYNAK_BASE = '/admin/odev/kaynaklar';
export const ADMIN_KAYNAK_HAVUZU_BASE = '/admin/odev/kaynak-havuzu';
export const COACH_KAYNAK_BASE = '/coach/odev/kaynaklar';
export const COACH_KAYNAK_HAVUZU_BASE = '/coach/odev/kaynak-havuzu';

export function getKaynakBasePath(pathname?: string | null): string {
  if (pathname?.startsWith(COACH_KAYNAK_BASE)) {
    return COACH_KAYNAK_BASE;
  }
  return ADMIN_KAYNAK_BASE;
}

export function getKaynakHavuzuBasePath(pathname?: string | null): string {
  if (pathname?.startsWith(COACH_KAYNAK_HAVUZU_BASE)) {
    return COACH_KAYNAK_HAVUZU_BASE;
  }
  return ADMIN_KAYNAK_HAVUZU_BASE;
}

export function kaynakHref(basePath: string, segment?: string): string {
  if (!segment) return basePath;
  return `${basePath}/${segment.replace(/^\//, '')}`;
}

export function isCoachKaynakPath(pathname?: string | null): boolean {
  return Boolean(
    pathname?.startsWith(COACH_KAYNAK_BASE) || pathname?.startsWith(COACH_KAYNAK_HAVUZU_BASE),
  );
}
