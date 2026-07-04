/**
 * Rol Yönetimi Modülü - Sabitler
 * 
 * Sistem rolleri ve yetki tanımları
 */

/**
 * Sistem rol kodları - değiştirilemez
 */
export const SYSTEM_ROLE_CODES = {
  SUPER_ADMIN: 'super_admin',
  KURUM_YONETICISI: 'kurum_yoneticisi',
  SUBE_YONETICISI: 'sube_yoneticisi',
  EGITIM_YONETICISI: 'egitim_yoneticisi',
  OGRETMEN: 'ogretmen',
  KOC: 'koc',
  MUHASEBE: 'muhasebe',
  IK: 'ik',
  BILGI_ISLEM: 'bilgi_islem',
  TEMIZLIK_PERSONELI: 'temizlik_personeli',
  DESTEK_PERSONELI: 'destek_personeli',
  OGRENCI: 'ogrenci',
  OKUYUCU: 'okuyucu',
} as const;

/**
 * Rol seviye tanımları
 * Düşük değer = yüksek öncelik
 */
export const ROLE_LEVELS = {
  SUPER_ADMIN: 0,
  KURUM_YONETICISI: 10,
  SUBE_YONETICISI: 20,
  EGITIM_YONETICISI: 30,
  BILGI_ISLEM: 40,
  MUHASEBE: 50,
  IK: 50,
  OGRETMEN: 100,
  KOC: 100,
  DESTEK_PERSONELI: 200,
  OKUYUCU: 500,
  OGRENCI: 1000,
} as const;

/**
 * Modül adları (görüntüleme için)
 */
export const MODULE_NAMES: Record<string, string> = {
  ogrenci: 'Öğrenci',
  personel: 'Personel',
  finans: 'Finans',
  kurum: 'Kurum',
  sube: 'Şube',
  egitim_tanimlari: 'Eğitim Tanımları',
  egitim_paketleri: 'Eğitim Paketleri',
  sinif: 'Sınıf',
  rapor: 'Rapor',
  roller: 'Rol Yönetimi',
  sistem: 'Sistem',
};

/**
 * Yetki türü adları
 */
export const PERMISSION_TYPE_NAMES: Record<string, string> = {
  read: 'Okuma',
  write: 'Yazma',
  delete: 'Silme',
  manage: 'Yönetme',
  admin: 'Tam Yetki',
};

/**
 * Yetki türü renkleri (badge için)
 */
export const PERMISSION_TYPE_COLORS: Record<string, string> = {
  read: '#3b82f6',    // blue
  write: '#22c55e',   // green
  delete: '#ef4444',  // red
  manage: '#f59e0b',  // amber
  admin: '#8b5cf6',   // purple
};

/**
 * Rol durumu etiketleri
 */
export const ROLE_STATUS_LABELS = {
  active: 'Aktif',
  inactive: 'Pasif',
  system: 'Sistem Rolü',
  custom: 'Özel Rol',
} as const;

/**
 * API endpoint'leri
 */
export const ROLE_API_ENDPOINTS = {
  LIST: '/roller/api/roles/',
  CREATE: '/roller/api/roles/create/',
  DETAIL: (id: number) => `/roller/api/roles/${id}/`,
  RESTORE: (id: number) => `/roller/api/roles/${id}/restore/`,
  STATS: '/roller/api/roles/stats/',
  PERMISSIONS: '/roller/api/permissions/',
} as const;

/**
 * Varsayılan değerler
 */
export const DEFAULT_ROLE_LEVEL = 100;

/**
 * UI Sabitleri
 */
export const UI_CONSTANTS = {
  DRAWER_WIDTH: 600,
  TABLE_PAGE_SIZE: 20,
  SEARCH_DEBOUNCE_MS: 300,
} as const;
