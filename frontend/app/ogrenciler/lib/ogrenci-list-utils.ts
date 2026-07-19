export type KalemFilter = { tur: string; id: number };

export type EgitimKalemiRow = {
  kalem_turu: string;
  kalem_id: number;
  kalem_adi: string;
  kalem_turu_display?: string;
};

export type OgrenciListFilters = {
  q?: string;
  durum?: 'all' | 'aktif' | 'pasif';
  all_years?: boolean;
  sinif_seviyesi_ids?: number[];
  sinif_ids?: number[];
  school_ids?: number[];
  alan_ids?: number[];
  coach_ids?: number[];
  kalemler?: KalemFilter[];
  kayit_turu?: string;
  giris_turu?: string;
  cinsiyet?: string;
  kayit_tarihi_bas?: string;
  kayit_tarihi_bit?: string;
  sort?: string;
  page?: number;
  page_size?: number;
};

export type ExportColumnDef = {
  key: string;
  label: string;
  default?: boolean;
};

export const KALEM_GRUP_LABELS: Record<string, string> = {
  grup_dersi: 'Grup Dersleri',
  ozel_ders: 'Özel Dersler',
  premium: 'Premium Paketler',
  yayin: 'Yayın Paketleri',
  deneme: 'Denemeler',
  ek_hizmet: 'Ek Hizmetler',
};

export const EXPORT_COLUMNS: ExportColumnDef[] = [
  { key: 'tam_ad', label: 'Ad Soyad', default: true },
  { key: 'okul_no', label: 'Okul No', default: true },
  { key: 'tc_kimlik_no', label: 'TC Kimlik No' },
  { key: 'sinif_seviyesi', label: 'Sınıf Seviyesi', default: true },
  { key: 'sinif_ad', label: 'Sınıf' },
  { key: 'geldigi_okul', label: 'Geldiği / Mezun Olduğu Okul' },
  { key: 'sube_ad', label: 'Şube' },
  { key: 'kalem_ozet', label: 'Eğitim Kalemleri' },
  { key: 'telefon', label: 'Telefon' },
  { key: 'email', label: 'E-posta' },
  { key: 'veli_ad_soyad', label: 'Veli Ad Soyad', default: true },
  { key: 'veli_tc_kimlik_no', label: 'Veli TC Kimlik No', default: true },
  { key: 'veli_telefon', label: 'Veli Telefon', default: true },
  { key: 'veli_yakinlik_display', label: 'Veli Yakınlık' },
  { key: 'kayit_tarihi', label: 'Kayıt Tarihi' },
  { key: 'giris_turu_display', label: 'Giriş Türü' },
  { key: 'cinsiyet', label: 'Cinsiyet' },
  { key: 'dogum_tarihi', label: 'Doğum Tarihi' },
  { key: 'egitim_yili', label: 'Eğitim Yılı' },
  { key: 'aktif_mi', label: 'Durum', default: true },
];

export const DEFAULT_EXPORT_KEYS = EXPORT_COLUMNS.filter((c) => c.default).map((c) => c.key);

export function kalemKey(k: KalemFilter): string {
  return `${k.tur}:${k.id}`;
}

export function formatKalemFilterKey(k: KalemFilter): string {
  return kalemKey(k);
}

export function normalizeKalemFilters(filters: OgrenciListFilters): KalemFilter[] {
  return filters.kalemler || [];
}

export function parseIntListParam(raw: string | null): number[] {
  if (!raw) return [];
  const seen = new Set<number>();
  const result: number[] = [];
  for (const part of raw.split(',')) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const id = parseInt(trimmed, 10);
    if (!Number.isFinite(id) || seen.has(id)) continue;
    seen.add(id);
    result.push(id);
  }
  return result;
}

export function serializeIntListParam(ids: number[]): string {
  return ids.join(',');
}

export function parseKalemlerParam(raw: string | null): KalemFilter[] {
  if (!raw) return [];
  const seen = new Set<string>();
  const result: KalemFilter[] = [];
  for (const part of raw.split(',')) {
    const trimmed = part.trim();
    if (!trimmed || !trimmed.includes(':')) continue;
    const [tur, idStr] = trimmed.split(':', 2);
    const id = parseInt(idStr, 10);
    if (!tur || !Number.isFinite(id)) continue;
    const key = `${tur}:${id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push({ tur, id });
  }
  return result;
}

export function serializeKalemlerParam(kalemler: KalemFilter[]): string {
  return kalemler.map((k) => `${k.tur}:${k.id}`).join(',');
}

export function parseFiltersFromSearchParams(params: URLSearchParams): OgrenciListFilters {
  let kalemler = parseKalemlerParam(params.get('kalemler'));
  if (kalemler.length === 0) {
    const legacyTur = params.get('kalem_turu');
    const legacyId = params.get('kalem_id');
    if (legacyTur && legacyId) {
      const id = parseInt(legacyId, 10);
      if (Number.isFinite(id)) kalemler = [{ tur: legacyTur, id }];
    }
  }

  let sinifSeviyesiIds = parseIntListParam(params.get('sinif_seviyesi_ids'));
  if (sinifSeviyesiIds.length === 0) {
    const legacy = params.get('sinif_seviyesi_id');
    if (legacy) sinifSeviyesiIds = parseIntListParam(legacy);
  }

  let sinifIds = parseIntListParam(params.get('sinif_ids'));
  if (sinifIds.length === 0) {
    const legacy = params.get('sinif_id');
    if (legacy) sinifIds = parseIntListParam(legacy);
  }

  const schoolIds = parseIntListParam(params.get('school_ids'));
  const alanIds = parseIntListParam(params.get('alan_ids'));
  const coachIds = parseIntListParam(params.get('coach_ids'));

  return {
    q: params.get('q') || '',
    durum: (params.get('durum') as OgrenciListFilters['durum']) || 'all',
    all_years: params.get('all_years') === '1',
    sinif_seviyesi_ids: sinifSeviyesiIds,
    sinif_ids: sinifIds,
    school_ids: schoolIds,
    alan_ids: alanIds,
    coach_ids: coachIds,
    kalemler,
    kayit_turu: params.get('kayit_turu') || '',
    giris_turu: params.get('giris_turu') || '',
    cinsiyet: params.get('cinsiyet') || '',
    kayit_tarihi_bas: params.get('kayit_tarihi_bas') || '',
    kayit_tarihi_bit: params.get('kayit_tarihi_bit') || '',
    sort: params.get('sort') || 'created_at_desc',
    page: parseInt(params.get('page') || '1', 10) || 1,
    page_size: parseInt(params.get('page_size') || '25', 10) || 25,
  };
}

export function filtersToSearchParams(filters: OgrenciListFilters): URLSearchParams {
  const p = new URLSearchParams();
  if (filters.q) p.set('q', filters.q);
  if (filters.durum && filters.durum !== 'all') p.set('durum', filters.durum);
  if (filters.all_years) p.set('all_years', '1');
  if (filters.sinif_seviyesi_ids && filters.sinif_seviyesi_ids.length > 0) {
    p.set('sinif_seviyesi_ids', serializeIntListParam(filters.sinif_seviyesi_ids));
  }
  if (filters.sinif_ids && filters.sinif_ids.length > 0) {
    p.set('sinif_ids', serializeIntListParam(filters.sinif_ids));
  }
  if (filters.school_ids && filters.school_ids.length > 0) {
    p.set('school_ids', serializeIntListParam(filters.school_ids));
  }
  if (filters.alan_ids && filters.alan_ids.length > 0) {
    p.set('alan_ids', serializeIntListParam(filters.alan_ids));
  }
  if (filters.coach_ids && filters.coach_ids.length > 0) {
    p.set('coach_ids', serializeIntListParam(filters.coach_ids));
  }
  if (filters.kalemler && filters.kalemler.length > 0) {
    p.set('kalemler', serializeKalemlerParam(filters.kalemler));
  }
  if (filters.kayit_turu) p.set('kayit_turu', filters.kayit_turu);
  if (filters.giris_turu) p.set('giris_turu', filters.giris_turu);
  if (filters.cinsiyet) p.set('cinsiyet', filters.cinsiyet);
  if (filters.kayit_tarihi_bas) p.set('kayit_tarihi_bas', filters.kayit_tarihi_bas);
  if (filters.kayit_tarihi_bit) p.set('kayit_tarihi_bit', filters.kayit_tarihi_bit);
  if (filters.sort) p.set('sort', filters.sort);
  if (filters.page && filters.page > 1) p.set('page', String(filters.page));
  if (filters.page_size && filters.page_size !== 25) p.set('page_size', String(filters.page_size));
  return p;
}

export function buildListApiQuery(filters: OgrenciListFilters): string {
  const p = filtersToSearchParams(filters);
  const qs = p.toString();
  return qs ? `?${qs}` : '';
}

export function getContextHeadersFromStorage(): Record<string, string> {
  if (typeof window === 'undefined') return {};
  const headers: Record<string, string> = {};
  const read = (key: string, header: string) => {
    const raw = localStorage.getItem(key);
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw);
      const id = typeof parsed === 'object' && parsed?.id != null ? parsed.id : parsed;
      if (id) headers[header] = String(id);
    } catch {
      if (raw.trim()) headers[header] = raw.trim();
    }
  };
  read('3k_active_kurum', 'X-Kurum-ID');
  read('3k_active_sube', 'X-Sube-ID');
  read('3k_active_egitim_yili', 'X-EgitimYili-ID');
  return headers;
}
