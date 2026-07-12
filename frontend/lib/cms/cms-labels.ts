/** CMS yönetim panelinde ham backend kodlarını kullanıcıya Türkçe gösterir. */

const PAGE_STATUS: Record<string, string> = {
  draft: 'Taslak',
  published: 'Yayında',
  scheduled: 'Zamanlanmış',
  archived: 'Arşivlendi',
};

const CONTENT_KIND: Record<string, string> = {
  duyuru: 'Duyuru',
  haber: 'Haber',
  blog: 'Blog',
  etkinlik: 'Etkinlik',
  sayfa: 'Sayfa',
};

const MEDIA_KIND: Record<string, string> = {
  image: 'Görsel',
  video: 'Video',
  document: 'Belge',
  file: 'Dosya',
  audio: 'Ses',
};

const MENU_LOCATION: Record<string, string> = {
  header: 'Üst menü',
  footer: 'Alt menü',
  sidebar: 'Yan menü',
  mobile: 'Mobil menü',
};

function label(map: Record<string, string>, value?: string | null): string {
  if (!value) return '—';
  return map[value] ?? value;
}

export const pageStatusLabel = (v?: string | null) => label(PAGE_STATUS, v);
export const contentStatusLabel = (v?: string | null) => label(PAGE_STATUS, v);
export const contentKindLabel = (v?: string | null) => label(CONTENT_KIND, v);
export const mediaKindLabel = (v?: string | null) => label(MEDIA_KIND, v);
export const menuLocationLabel = (v?: string | null) => label(MENU_LOCATION, v);

/** Yayın durumuna göre rozet CSS sınıfı (published/draft). */
export const statusBadgeClass = (v?: string | null) => (v === 'published' ? 'published' : 'draft');
