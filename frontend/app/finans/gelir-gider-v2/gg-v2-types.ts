// ─── Gelir & Gider v2 — Ortak Tipler ────────────────────────────
// Backend serialize çıktısıyla birebir uyumludur (frontend hesaplama yapmaz).

export type GGModul = "gelir" | "gider";

export interface Ref {
  id: number | null;
  ad?: string | null;
  unvan?: string | null;
}

export interface GGEtiket {
  id: number;
  ad: string;
  renk: string;
}

export interface GGListItem {
  id: number;
  fatura_no: string | null;
  fatura_tarihi: string | null;
  vade_tarihi: string | null;
  aciklama: string | null;
  cari_hesap: Ref;
  // gelir: gelir_kategorisi/gelir_kaynagi ; gider: gider_kategorisi/maliyet_merkezi
  gelir_kategorisi?: Ref;
  gider_kategorisi?: Ref;
  gelir_kaynagi?: Ref;
  maliyet_merkezi?: Ref;
  proje: Ref;
  odeme_yontemi: Ref;
  brut_tutar: string;
  kdv_orani: number;
  kdv_tutar: string;
  net_tutar: string;
  // gelir tarafı
  tahsil_edilen?: string;
  kalan_tutar: string;
  tahsilat_yuzdesi?: string;
  // gider tarafı
  odenen_toplam?: string;
  odeme_yuzdesi?: string;
  taksit_sayisi?: number;
  durum: string;
  durum_label: string;
  etiketler: GGEtiket[];
  olusturan: string | null;
  duzenlenebilir_mi: boolean;
  iptal_edilebilir_mi: boolean;
  odenebilir_mi?: boolean;
  tahsil_edilebilir_mi?: boolean;
  created_at: string | null;
}

export interface GGOdeme {
  id: number;
  gider_kaydi_id: number;
  gider_taksit_id: number | null;
  taksit_no: number | null;
  odeme_yontemi_id: number | null;
  odeme_yontemi_adi: string | null;
  mali_hesap_id: number | null;
  mali_hesap_adi: string | null;
  tutar: string;
  odeme_tarihi: string;
  aciklama: string;
  durum: string;
  durum_display: string;
  bakiyeden_mahsup: boolean;
  islem_yapan_adi: string | null;
  created_at: string | null;
}

export interface GGTahsilat {
  id: number;
  gelir_kaydi_id: number;
  cari_hesap_adi: string;
  fatura_no: string | null;
  odeme_yontemi_id: number | null;
  odeme_yontemi_adi: string | null;
  mali_hesap_id: number | null;
  mali_hesap_adi: string | null;
  tutar: string | number;
  tahsilat_tarihi: string;
  aciklama: string;
  durum: string;
  durum_display: string;
  islem_yapan_adi: string | null;
  created_at: string | null;
}

export interface GGTaksit {
  id: number;
  gider_kaydi_id: number;
  taksit_no: number;
  vade_tarihi: string;
  tutar: string;
  odenen_tutar: string;
  kalan_tutar: string;
  aciklama?: string;
  durum: string;
  durum_display: string;
}

// Form içi manuel taksit satırı (henüz kaydedilmemiş plan)
export interface GGTaksitPlanSatir {
  taksit_no: number;
  vade_tarihi: string; // ISO
  tutar: number;
  aciklama?: string;
}

export interface GGListResponse {
  results: GGListItem[];
  page: number;
  page_size: number;
  total: number;
  total_pages: number;
}

export interface GGDashboard {
  kartlar: Record<string, string | number>;
  en_buyuk_kalemler: { ad: string; tutar: string; adet: number }[];
}

export interface GGFilters {
  arama?: string;
  durum?: string;
  cari_hesap_id?: number | string;
  gelir_kategorisi_id?: number | string;
  gider_kategorisi_id?: number | string;
  gelir_kaynagi_id?: number | string;
  maliyet_merkezi_id?: number | string;
  proje_id?: number | string;
  odeme_yontemi_id?: number | string;
  olusturan_id?: number | string;
  etiket_id?: number | string;
  belge_no?: string;
  baslangic?: string;
  bitis?: string;
  tutar_min?: number | string;
  tutar_max?: number | string;
  kdv_var?: string;
  kdv_orani?: number | string;
  tahsil_durumu?: string;
  odeme_durumu?: string;
}

export interface GGDropdown {
  cariler: {
    id: number;
    unvan: string;
    hesap_turu: string;
    gelir_kategorileri?: number[];
    gider_kategorileri?: number[];
  }[];
  odeme_yontemleri: { id: number; ad: string; tip: string; mali_hesap_id?: number | null }[];
  /** Şube mali hesaplarına bağlı yöntemler (ödeme drawer cascade). */
  odeme_yontemleri_operasyon?: {
    id: number;
    ad: string;
    tip: string;
    mali_hesap_id?: number | null;
  }[];
  mali_hesaplar?: { id: number; ad: string; tip: string }[];
  projeler: { id: number; ad: string }[];
  etiketler: GGEtiket[];
  kdv_oranlari: { value: number; label: string }[];
  kdv_modlari?: { value: string; label: string }[];
  masraf_turleri?: {
    id: number;
    ad: string;
    odeme_tipi: string;
    kesinti_turu: string;
    varsayilan_tutar: string;
  }[];
  kategoriler: { id: number; ad: string; parent_id: number | null }[];
  durumlar: { value: string; label: string }[];
  gelir_kaynaklari?: { id: number; ad: string }[];
  maliyet_merkezleri?: { id: number; ad: string }[];
  aciklama_sablonlari?: { id: number; ad: string; icerik: string }[];
}

export interface GGReport {
  baslik: string;
  kpis: { label: string; value: number; format?: string }[];
  seriler?: Record<string, unknown>;
  columns: { key: string; label: string; format?: string }[];
  rows: Record<string, unknown>[];
}

export interface GGYetkiler {
  can_view: boolean;
  can_write: boolean;
  can_manage: boolean;
  can_delete?: boolean;
}

export interface GGLogItem {
  id: number;
  modul: string;
  eylem: string;
  kayit_tip: string;
  kayit_id: number | null;
  aciklama: string;
  tutar: string | null;
  kullanici: string | null;
  ip_adresi: string | null;
  created_at: string;
}

export interface GGTanim {
  id: number;
  ad: string;
  kod?: string | null;
  aciklama?: string | null;
  aktif_mi: boolean;
  [key: string]: unknown;
}

export const GG_RAPORLAR: { slug: string; ad: string }[] = [
  { slug: "gelir-analizi", ad: "Gelir Analizi" },
  { slug: "gider-analizi", ad: "Gider Analizi" },
  { slug: "kategori-analizi", ad: "Kategori Analizi" },
  { slug: "cari-analizi", ad: "Cari Bazlı Analiz" },
  { slug: "aylik-karsilastirma", ad: "Aylık Karşılaştırma" },
  { slug: "yillik-karsilastirma", ad: "Yıllık Karşılaştırma" },
  { slug: "trend-analizi", ad: "Trend Analizi" },
  { slug: "kdv-analizi", ad: "KDV Analizi" },
  { slug: "nakit-akisi", ad: "Nakit Akışı" },
  { slug: "finans-ozeti", ad: "Finans Özeti" },
];

export const TL = (n: number | string | null | undefined) =>
  new Intl.NumberFormat("tr-TR", {
    style: "currency",
    currency: "TRY",
    maximumFractionDigits: 2,
  }).format(Number(n) || 0);

export const DATE = (s: string | null | undefined) =>
  s ? new Date(s).toLocaleDateString("tr-TR") : "—";
