// ─── Cari Hesap v2 — Tip Tanımları ──────────────────────────────

export type CariV2Turu =
  | "musteri"
  | "tedarikci"
  | "karma"
  | "gelir_hesabi"
  | "gider_hesabi"
  | "diger";

export type BakiyeDurumu = "borclu" | "alacakli" | "dengede";

export type RiskDurumu =
  | "normal"
  | "izlemede"
  | "limit_asildi"
  | "riskli"
  | "kritik";

export interface CariEtiket {
  id: number;
  ad: string;
  renk: string;
  sube_id?: number | null;
  cari_sayisi?: number;
}

export interface CariV2ListItem {
  id: number;
  hesap_kodu: string;
  unvan: string;
  kisa_ad: string;
  gorunen_ad: string;
  hesap_turu: CariV2Turu;
  hesap_turu_display: string;
  kategori: string;
  vergi_no: string;
  telefon: string;
  email: string;
  yetkili_kisi: string;
  il: string;
  ilce: string;
  etiketler: CariEtiket[];
  toplam_borc: number;
  toplam_alacak: number;
  bakiye: number;
  acik_borc: number;
  acik_alacak: number;
  bakiye_durumu: BakiyeDurumu;
  toplam_satis: number;
  toplam_alis: number;
  toplam_tahsilat: number;
  toplam_odeme: number;
  toplam_iade: number;
  toplam_mahsup: number;
  vadesi_gelen: number;
  vadesi_gecmis: number;
  gelecek_vadeli: number;
  risk_limiti: number;
  risk_durumu: RiskDurumu;
  risk_durumu_display: string;
  risk_skoru: number;
  son_islem_tarihi: string | null;
  son_islem_turu: string | null;
  son_islem_yapan: string | null;
  aktif_mi: boolean;
  created_at: string | null;
}

export interface CariV2ListTotals {
  toplam_cari: number;
  toplam_borc: number;
  toplam_alacak: number;
  net_bakiye: number;
  borclu_cari: number;
  alacakli_cari: number;
  sifir_bakiye_cari: number;
}

export interface CariV2ListResponse {
  results: CariV2ListItem[];
  count: number;
  page: number;
  page_size: number;
  total_pages: number;
  totals: CariV2ListTotals;
}

export interface CariV2Dashboard {
  toplam_cari: number;
  aktif_cari: number;
  pasif_cari: number;
  borclu_cari: number;
  alacakli_cari: number;
  dengede_cari: number;
  riskli_cari: number;
  bu_ay_tahsilat: number;
  bu_ay_odeme: number;
  bekleyen_tahsilat: number;
  bekleyen_odeme: number;
}

export interface CariV2Ozet {
  bakiye: number;
  bakiye_durumu: BakiyeDurumu;
  acik_borc: number;
  acik_alacak: number;
  vadesi_gelen: number;
  vadesi_gecmis: number;
  gelecek_vadeli: number;
  risk_durumu: RiskDurumu;
  risk_durumu_display: string;
  risk_skoru: number;
  risk_limiti: number;
  kategori: string;
  aktif_mi: boolean;
  etiketler: CariEtiket[];
  son_islem_tarihi: string | null;
  son_islem_turu: string | null;
  son_islem_yapan: string | null;
}

export interface CariV2Detail {
  id: number;
  kurum_id: number;
  unvan: string;
  kisa_ad: string;
  gorunen_ad: string;
  hesap_turu: CariV2Turu;
  hesap_turu_display: string;
  hesap_kodu: string;
  kategori: string;
  risk_limiti: number;
  varsayilan_vade_gun: number;
  para_birimi: string;
  etiketler: CariEtiket[];
  gider_kategorileri: { id: number; ad: string }[];
  gelir_kategorileri: { id: number; ad: string }[];
  vergi_no: string;
  vergi_dairesi: string;
  telefon: string;
  email: string;
  adres: string;
  il: string;
  ilce: string;
  yetkili_kisi: string;
  yetkili_telefon: string;
  banka_adi: string;
  iban: string;
  hesap_sahibi: string;
  toplam_borc: number;
  toplam_alacak: number;
  bakiye: number;
  bakiye_durumu: BakiyeDurumu;
  acik_borc: number;
  acik_alacak: number;
  serbest_bakiye: number;
  toplam_gider: number;
  toplam_gelir: number;
  gelir_alacagi: number;
  tahsil_edilen_gelir: number;
  gider_borcu: number;
  gider_kayit_sayisi: number;
  gelir_kayit_sayisi: number;
  notlar: string;
  aktif_mi: boolean;
  created_at: string;
  updated_at: string;
  ozet?: CariV2Ozet;
}

export interface AylikNokta {
  ay: string;
  toplam: number;
}
export interface KategoriDagilim {
  kategori: string;
  toplam: number;
  adet: number;
}

export interface CariV2Panel {
  hesap_turu: CariV2Turu;
  panel_tipi: CariV2Turu;
  musteri?: {
    toplam_satis: number;
    toplam_tahsilat: number;
    acik_alacak: number;
    son_odeme_tarihi: string | null;
    satis_analizi: AylikNokta[];
  };
  tedarikci?: {
    toplam_alis: number;
    toplam_odeme: number;
    acik_borc: number;
    son_alis_tarihi: string | null;
    tedarik_analizi: AylikNokta[];
  };
  gelir?: {
    toplam_gelir: number;
    tahsil_edilen: number;
    bekleyen_gelir: number;
    aylik_grafik: AylikNokta[];
    kategori_analizi: KategoriDagilim[];
    son_hareketler: Record<string, unknown>[];
  };
  gider?: {
    toplam_gider: number;
    odenen: number;
    kalan: number;
    onay_bekleyen: number;
    aylik_grafik: AylikNokta[];
    kategori_analizi: KategoriDagilim[];
    son_hareketler: Record<string, unknown>[];
  };
  net?: {
    net_bakiye: number;
    bakiye_durumu: BakiyeDurumu;
    acik_borc: number;
    acik_alacak: number;
  };
  diger?: {
    net_bakiye: number;
    toplam_borc: number;
    toplam_alacak: number;
    bakiye_durumu: BakiyeDurumu;
  };
}

export interface CariV2Hareket {
  id: number;
  islem_turu: string;
  islem_turu_display: string;
  yon: "borc" | "alacak";
  yon_display: string;
  tutar: number;
  bakiye_sonrasi: number;
  kaynak_tip: string;
  kategori_adi?: string | null;
  odeme_yontemi_adi?: string | null;
  aciklama: string;
  belge_no: string;
  islem_tarihi: string;
  islem_yapan_adi: string | null;
}

export interface CariV2HareketResponse {
  results: CariV2Hareket[];
  count: number;
  page: number;
  page_size: number;
  total_pages: number;
}

export interface CariV2ReportKpi {
  label: string;
  value: number;
  format?: "tl" | "int" | "percent";
}
export interface CariV2ReportColumn {
  key: string;
  label: string;
  format?: string;
}
export interface CariV2Report {
  baslik: string;
  kpis: CariV2ReportKpi[];
  seriler?: Record<string, unknown>;
  columns: CariV2ReportColumn[];
  rows: Record<string, unknown>[];
  ozet?: Record<string, unknown>;
  error?: string;
}

export interface CariV2Gorunum {
  id: number;
  ad: string;
  config: Record<string, unknown>;
  varsayilan_mi: boolean;
  sube_id?: number | null;
  created_at: string | null;
}

export interface CariEffectivePermissions {
  can_view: boolean;
  can_create: boolean;
  can_edit: boolean;
  can_delete: boolean;
  can_manage: boolean;
  can_export: boolean;
  is_superuser: boolean;
  role_code: string | null;
  role_name: string | null;
}

export interface CariV2Filters {
  arama?: string;
  hesap_turu?: string;
  durum?: string;
  etiketler?: string;
  kategori?: string;
  bakiye_durumu?: string;
  bakiye_min?: string;
  bakiye_max?: string;
  borc_min?: string;
  borc_max?: string;
  alacak_min?: string;
  alacak_max?: string;
  son_islem_baslangic?: string;
  son_islem_bitis?: string;
  il?: string;
  ilce?: string;
  yetkili?: string;
  risk_durumu?: string;
  vade?: string;
}

export const CARI_V2_TURLERI: {
  value: CariV2Turu;
  label: string;
  renk: string;
  ikon: string;
}[] = [
  { value: "musteri", label: "Müşteri", renk: "#2563eb", ikon: "👤" },
  { value: "tedarikci", label: "Tedarikçi", renk: "#7c3aed", ikon: "🏢" },
  { value: "karma", label: "Karma", renk: "#d97706", ikon: "🔄" },
  { value: "gelir_hesabi", label: "Gelir Hesabı", renk: "#059669", ikon: "📈" },
  { value: "gider_hesabi", label: "Gider Hesabı", renk: "#dc2626", ikon: "📉" },
  { value: "diger", label: "Diğer", renk: "#64748b", ikon: "📁" },
];

export const RISK_META: Record<RiskDurumu, { label: string; renk: string; bg: string }> = {
  normal: { label: "Normal", renk: "#059669", bg: "#ecfdf5" },
  izlemede: { label: "İzlemede", renk: "#d97706", bg: "#fffbeb" },
  limit_asildi: { label: "Limit Aşıldı", renk: "#ea580c", bg: "#fff7ed" },
  riskli: { label: "Riskli", renk: "#dc2626", bg: "#fef2f2" },
  kritik: { label: "Kritik", renk: "#b91c1c", bg: "#fee2e2" },
};

export function turMeta(tur: CariV2Turu) {
  return CARI_V2_TURLERI.find((t) => t.value === tur) ?? CARI_V2_TURLERI[5];
}
