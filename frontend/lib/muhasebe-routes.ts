export const ADMIN_FINANS_BASE = '/finans';
export const MUHASEBE_FINANS_BASE = '/muhasebe/finans';

export const ADMIN_ODEME_TAKIP_BASE = '/odeme-takip';
export const MUHASEBE_ODEME_TAKIP_BASE = '/muhasebe/odeme-takip';

export const ADMIN_OGRENCI_BASE = '/ogrenciler';
export const MUHASEBE_OGRENCI_BASE = '/muhasebe/ogrenci';

export const ADMIN_PERSONEL_BASE = '/personel';
export const MUHASEBE_PERSONEL_BASE = '/muhasebe/personel';

export const MUHASEBE_PORTAL_BASE = '/muhasebe';
export const MUHASEBE_KURUM_BASE = '/muhasebe/kurum';

export function getFinansBasePath(pathname?: string | null): string {
  if (pathname?.startsWith(MUHASEBE_FINANS_BASE)) return MUHASEBE_FINANS_BASE;
  return ADMIN_FINANS_BASE;
}

export function getOdemeTakipBasePath(pathname?: string | null): string {
  if (pathname?.startsWith(MUHASEBE_ODEME_TAKIP_BASE)) return MUHASEBE_ODEME_TAKIP_BASE;
  if (pathname?.startsWith(MUHASEBE_PORTAL_BASE)) return MUHASEBE_ODEME_TAKIP_BASE;
  return ADMIN_ODEME_TAKIP_BASE;
}

export function getOgrenciBasePath(pathname?: string | null): string {
  if (pathname?.startsWith(MUHASEBE_OGRENCI_BASE)) return MUHASEBE_OGRENCI_BASE;
  return ADMIN_OGRENCI_BASE;
}

export function getPersonelBasePath(pathname?: string | null): string {
  if (pathname?.startsWith(MUHASEBE_PERSONEL_BASE)) return MUHASEBE_PERSONEL_BASE;
  return ADMIN_PERSONEL_BASE;
}

export function isMuhasebePortalPath(pathname?: string | null): boolean {
  return Boolean(pathname?.startsWith(MUHASEBE_PORTAL_BASE));
}

export function finansHref(basePath: string, segment?: string): string {
  if (!segment) return basePath;
  return `${basePath}/${segment.replace(/^\//, '')}`;
}

export function odemeTakipHref(basePath: string, segment?: string): string {
  if (!segment) return basePath;
  return `${basePath}/${segment.replace(/^\//, '')}`;
}

export function ogrenciHref(basePath: string, segment?: string): string {
  if (!segment) return basePath;
  return `${basePath}/${segment.replace(/^\//, '')}`;
}

export function personelHref(basePath: string, segment?: string): string {
  if (!segment) return basePath;
  return `${basePath}/${segment.replace(/^\//, '')}`;
}

export function muhasebeHomeHref(): string {
  return `${MUHASEBE_PORTAL_BASE}/dashboard`;
}

/** Tahsilat & Raporlar sekmesine birleştirilmiş eski finans alt yolları. */
export const TAHSILAT_RAPOR_LEGACY_SEGMENTS = [
  'gun-sonu',
  'gecikmis-odemeler',
  'vadesi-gelenler',
  'donem-tahsilat',
  'raporlar',
  'raporlama',
  'para-hareketleri',
] as const;

export function getPortalHomeHref(finansBase: string): string {
  return finansBase === MUHASEBE_FINANS_BASE ? muhasebeHomeHref() : '/dashboard';
}

export function isTahsilatRaporlarFinansPath(
  pathname: string,
  finansBase: string = ADMIN_FINANS_BASE,
): boolean {
  if (pathname.startsWith(`${finansBase}/tahsilat-raporlar`)) return true;
  if (!pathname.startsWith(`${finansBase}/`)) return false;
  const segment = pathname.slice(finansBase.length + 1).split('/')[0]?.split('?')[0];
  return (TAHSILAT_RAPOR_LEGACY_SEGMENTS as readonly string[]).includes(segment);
}

export function tahsilatRaporTabHref(
  finansBase: string,
  tab: string,
  extraQuery?: Record<string, string>,
): string {
  const qs = new URLSearchParams({ tab, ...extraQuery });
  return `${finansBase}/tahsilat-raporlar?${qs.toString()}`;
}
