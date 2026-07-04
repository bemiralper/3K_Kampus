// ─── Gelir Kaydı Types ──────────────────────────────────────────

export interface GelirKaydiListItem {
  id: number;
  cari_hesap_id: number;
  cari_hesap_adi: string;
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
  tahsil_edilen: number;
  kalan_tutar: number;
  tahsilat_yuzdesi: number;
  durum: string;
  durum_display: string;
  odeme_yontemi_id?: number | null;
  odeme_yontemi_adi?: string | null;
  odeme_yontemi_tip?: string | null;
  gelir_kategorisi_id?: number | null;
  kategori_adi?: string | null;
  created_at: string;
}

export interface GelirKaydiDetail {
  id: number;
  kurum_id: number;
  sube_id: number | null;
  sube_adi: string | null;
  cari_hesap_id: number;
  cari_hesap_adi: string;
  mali_hesap_id: number | null;
  mali_hesap_adi: string | null;
  odeme_yontemi_id: number | null;
  odeme_yontemi_adi: string | null;
  gelir_kategorisi_id: number | null;
  kategori_adi: string | null;
  egitim_yili_id: number | null;
  fatura_no: string;
  fatura_tarihi: string;
  vade_tarihi: string;
  aciklama: string;
  brut_tutar: number;
  kdv_orani: number;
  kdv_tutar: number;
  net_tutar: number;
  tahsil_edilen: number;
  kalan_tutar: number;
  tahsilat_yuzdesi: number;
  durum: string;
  durum_display: string;
  duzenlenebilir_mi: boolean;
  iptal_edilebilir_mi: boolean;
  olusturan_adi: string | null;
  belge: string | null;
  created_at: string;
  updated_at: string;
}

export interface GelirKaydiCreatePayload {
  kurum_id: number;
  cari_hesap_id: number;
  gelir_kategorisi_id?: number;
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
}

export interface GelirKaydiUpdatePayload {
  cari_hesap_id?: number;
  gelir_kategorisi_id?: number;
  sube_id?: number | null;
  mali_hesap_id?: number | null;
  odeme_yontemi_id?: number | null;
  egitim_yili_id?: number | null;
  fatura_no?: string;
  fatura_tarihi?: string;
  vade_tarihi?: string;
  aciklama?: string;
  brut_tutar?: number;
  kdv_orani?: number;
}

export interface GelirOzet {
  toplam_gelir: number;
  toplam_tahsil: number;
  bekleyen_sayi: number;
  tahsil_edilmemis_sayi: number;
}

export const GELIR_DURUMLARI = [
  { value: 'taslak', label: 'Taslak', color: 'bg-gray-100 text-gray-700' },
  { value: 'onaylandi', label: 'Onaylandı', color: 'bg-blue-100 text-blue-700' },
  { value: 'kismi_tahsil', label: 'Kısmi Tahsil', color: 'bg-orange-100 text-orange-700' },
  { value: 'tahsil_edildi', label: 'Tahsil Edildi', color: 'bg-green-100 text-green-700' },
  { value: 'iptal', label: 'İptal', color: 'bg-red-100 text-red-700' },
] as const;
