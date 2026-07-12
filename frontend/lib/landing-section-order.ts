/** Anasayfa hero/footer hariç kaydırılabilir bölüm anahtarları */

import type { SiteSettings } from '@/lib/website-api';

export const LANDING_SECTION_LABELS: Record<string, string> = {
  'quick-access': 'Hızlı Erişim Kartları',
  'ders-formatlari': 'Ders Formatları',
  duyurular: 'Duyurular',
  'sinav-takvimi': 'Sınav Takvimi',
  neden: 'Neden 3K Kampüs?',
  sistem3k: '3K Sistemi Tanıtım',
  yorumlar: 'Öğrenci Yorumları',
  sss: 'Sıkça Sorulan Sorular',
};

export function bolumSectionKey(id: string): string {
  return `bolum:${id}`;
}

export function isBolumSectionKey(key: string): boolean {
  return key.startsWith('bolum:');
}

export function bolumIdFromKey(key: string): string {
  return key.startsWith('bolum:') ? key.slice(6) : key;
}

export function buildDefaultLandingSectionOrder(bolumIds: string[]): string[] {
  return [
    'quick-access',
    'ders-formatlari',
    ...bolumIds.map(bolumSectionKey),
    'duyurular',
    'sinav-takvimi',
    'neden',
    'sistem3k',
    'yorumlar',
    'sss',
  ];
}

/** Hızlı erişim hero altında sabit; sıralama listesinden çıkar */
export function orderableSectionKeys(order: string[]): string[] {
  return order.filter((key) => key !== 'quick-access');
}

export const QUICK_ACCESS_SECTION_KEY = 'quick-access';

export function resolveLandingSectionOrder(
  saved: string[] | undefined | null,
  bolumIds: string[],
): string[] {
  const defaults = buildDefaultLandingSectionOrder(bolumIds);
  if (!saved?.length) return defaults;

  const valid = new Set([
    'quick-access',
    'ders-formatlari',
    'duyurular',
    'sinav-takvimi',
    'neden',
    'sistem3k',
    'yorumlar',
    'sss',
    ...bolumIds.map(bolumSectionKey),
  ]);

  const merged: string[] = [];
  const seen = new Set<string>();

  for (const key of saved) {
    if (!valid.has(key) || seen.has(key)) continue;
    merged.push(key);
    seen.add(key);
  }
  for (const key of defaults) {
    if (!seen.has(key)) merged.push(key);
  }
  return merged;
}

export function sectionOrderLabel(
  key: string,
  bolumTitles?: Record<string, string>,
): string {
  if (isBolumSectionKey(key)) {
    const id = bolumIdFromKey(key);
    const title = bolumTitles?.[id];
    return title ? `Ek Bölüm: ${title}` : `Ek Bölüm (${id})`;
  }
  return LANDING_SECTION_LABELS[key] || key;
}

/** API + eski boolean bayraklarından gizli bölüm kümesi */
export function resolveHiddenSections(settings: SiteSettings | null | undefined): Set<string> {
  const hidden = new Set<string>(settings?.landing_sections_hidden ?? []);
  if (settings?.yorumlar_goster === false) hidden.add('yorumlar');
  if (settings?.sss_goster === false) hidden.add('sss');
  return hidden;
}

export function isLandingSectionVisible(key: string, settings: SiteSettings | null | undefined): boolean {
  return !resolveHiddenSections(settings).has(key);
}

export function isSectionVisible(key: string, hidden: string[]): boolean {
  return !hidden.includes(key);
}

/** Görünürlük değişince hem hidden listesi hem legacy boolean'ları senkronize et */
export function patchSectionVisibility(
  settings: SiteSettings,
  key: string,
  visible: boolean,
): Partial<SiteSettings> {
  const hidden = new Set(settings.landing_sections_hidden ?? []);
  if (visible) hidden.delete(key);
  else hidden.add(key);

  const patch: Partial<SiteSettings> = {
    landing_sections_hidden: Array.from(hidden),
  };
  if (key === 'yorumlar') patch.yorumlar_goster = visible;
  if (key === 'sss') patch.sss_goster = visible;
  return patch;
}

export function hiddenFromSettings(settings: SiteSettings | null | undefined): string[] {
  return Array.from(resolveHiddenSections(settings));
}
