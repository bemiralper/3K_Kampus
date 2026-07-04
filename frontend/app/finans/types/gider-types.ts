// ─── Gider Kaydı & Taksit & Ödeme Types ────────────────────────

export interface TaksitPlaniItem {
  taksit_no: number;
  vade_tarihi: string;
  tutar: number;
  odeme_yontemi_id?: number | null;
}

export interface GiderTaksit {
  id: number;
  gider_kaydi_id: number;
  taksit_no: number;
  vade_tarihi: string;
  tutar: number;
  odenen_tutar: number;
  kalan_tutar: number;
  durum: string;
  durum_display: string;
  cari_hesap_adi: string;
  fatura_no: string;
  aciklama?: string;
  odeme_yontemi_id?: number | null;
  odeme_yontemi_adi?: string;
  odeme_yontemi_tip?: string;
}

export interface GiderKaydiListItem {
  id: number;
  cari_hesap_id: number;
  cari_hesap_adi: string;
  gider_kategorisi_id: number;
  kategori_adi: string;
  sube_id: number | null;
  sube_adi: string | null;
  fatura_no: string;
  fatura_tarihi: string;
  vade_tarihi: string;
  aciklama: string;
  brut_tutar: number;
  kdv_orani: number;
  kdv_tutar: number;
  net_tutar: number;
  odenen_toplam: number;
  kalan_tutar: number;
  odeme_yuzdesi: number;
  taksit_sayisi: number;
  durum: string;
  durum_display: string;
  tekrar_mi: boolean;
  olusturan_adi: string | null;
  odeme_yontemi_id?: number | null;
  odeme_yontemi_adi?: string | null;
  odeme_yontemi_tip?: string | null;
  created_at: string;
}

export interface GiderKaydiDetail {
  id: number;
  kurum_id: number;
  sube_id: number | null;
  sube_adi: string | null;
  cari_hesap_id: number;
  cari_hesap_adi: string;
  gider_kategorisi_id: number;
  kategori_adi: string;
  mali_hesap_id: number | null;
  mali_hesap_adi: string | null;
  odeme_yontemi_id: number | null;
  odeme_yontemi_adi: string | null;
  egitim_yili_id: number | null;
  fatura_no: string;
  fatura_tarihi: string;
  vade_tarihi: string;
  aciklama: string;
  brut_tutar: number;
  kdv_orani: number;
  kdv_tutar: number;
  net_tutar: number;
  odenen_toplam: number;
  kalan_tutar: number;
  odeme_yuzdesi: number;
  taksit_sayisi: number;
  tekrar_mi: boolean;
  tekrar_sikligi: string;
  tekrar_bitis_tarihi: string | null;
  durum: string;
  durum_display: string;
  odenebilir_mi: boolean;
  iptal_edilebilir_mi: boolean;
  duzenlenebilir_mi: boolean;
  olusturan_adi: string | null;
  onaylayan_adi: string | null;
  onay_tarihi: string | null;
  belge: string | null;
  taksitler: GiderTaksit[];
  created_at: string;
  updated_at: string;
}

export interface GiderKaydiCreatePayload {
  kurum_id: number;
  cari_hesap_id: number;
  gider_kategorisi_id: number;
  sube_id?: number | null;
  mali_hesap_id?: number | null;
  odeme_yontemi_id?: number | null;
  egitim_yili_id?: number | null;
  fatura_no?: string;
  fatura_tarihi: string;
  vade_tarihi: string;
  aciklama?: string;
  brut_tutar: number;
  kdv_orani?: number;
  taksit_sayisi?: number;
  taksit_plani?: TaksitPlaniItem[];
  tekrar_mi?: boolean;
  tekrar_sikligi?: string;
  tekrar_bitis_tarihi?: string | null;
}

export interface GiderKaydiUpdatePayload {
  cari_hesap_id?: number;
  gider_kategorisi_id?: number;
  sube_id?: number | null;
  mali_hesap_id?: number | null;
  odeme_yontemi_id?: number | null;
  fatura_no?: string;
  fatura_tarihi?: string;
  vade_tarihi?: string;
  aciklama?: string;
  brut_tutar?: number;
  kdv_orani?: number;
  taksit_sayisi?: number;
  tekrar_mi?: boolean;
  tekrar_sikligi?: string;
  tekrar_bitis_tarihi?: string | null;
}

export interface GiderOdeme {
  id: number;
  gider_kaydi_id: number;
  gider_taksit_id: number | null;
  taksit_no: number | null;
  cari_hesap_adi: string;
  fatura_no: string;
  odeme_yontemi_id: number | null;
  odeme_yontemi_adi: string | null;
  mali_hesap_id: number | null;
  mali_hesap_adi: string | null;
  tutar: number;
  odeme_tarihi: string;
  aciklama: string;
  durum: string;
  durum_display: string;
  bakiyeden_mahsup: boolean;
  islem_yapan_adi: string | null;
  created_at: string;
}

export interface GiderOdemeCreatePayload {
  gider_kaydi_id: number;
  gider_taksit_id?: number | null;
  odeme_yontemi_id?: number | null;
  mali_hesap_id?: number | null;
  tutar: number;
  odeme_tarihi: string;
  aciklama?: string;
  bakiyeden_mahsup?: boolean;
  kesinti_turu?: string;
  kesinti_tutar?: number;
  kesinti_aciklama?: string;
}

export interface GiderOzet {
  toplam_gider: number;
  toplam_odenen: number;
  bekleyen_sayi: number;
  odenmemis_sayi: number;
  geciken_taksit_sayi: number;
  yaklasan_cek_vade_sayi?: number;
}

export const GIDER_DURUMLARI = [
  { value: 'taslak', label: 'Taslak', color: 'bg-gray-100 text-gray-700' },
  { value: 'onay_bekliyor', label: 'Onay Bekliyor', color: 'bg-yellow-100 text-yellow-700' },
  { value: 'onaylandi', label: 'Onaylandı', color: 'bg-blue-100 text-blue-700' },
  { value: 'kismi_odendi', label: 'Kısmi Ödendi', color: 'bg-orange-100 text-orange-700' },
  { value: 'odendi', label: 'Ödendi', color: 'bg-green-100 text-green-700' },
  { value: 'iptal', label: 'İptal', color: 'bg-red-100 text-red-700' },
] as const;

export const KDV_ORANLARI = [
  { value: 0, label: '%0' },
  { value: 1, label: '%1' },
  { value: 10, label: '%10' },
  { value: 20, label: '%20' },
] as const;
