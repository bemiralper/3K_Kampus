// ─── Dönem Tahsilat — TypeScript Types ────────────────────────

export type PeriodMode = "alinan" | "beklenen";
export type PeriodKaynak = "hepsi" | "sozlesme" | "gelir" | "cari";

export interface YontemDagilimItem {
  yontem: string;
  yontem_tipi: string;
  toplam: number;
  adet: number;
  oran: number;
}

export interface KaynakKirilimItem {
  kaynak: string;
  kaynak_label: string;
  toplam: number;
  adet: number;
}

export interface PeriodSummary {
  toplam_tutar: number;
  toplam_adet: number;
  toplam_alinan?: number;
  toplam_kalan?: number;
  tahsil_orani?: number | null;
  beklenen_tutar?: number | null;
  yontem_dagilimi: YontemDagilimItem[];
  kaynak_kirilimi: KaynakKirilimItem[];
  grafik: { label: string; tutar: number }[];
}

export interface PeriodSummaryResponse {
  mode: PeriodMode;
  baslangic: string;
  bitis: string;
  ozet: PeriodSummary;
}

export type TahsilDurumu = "odendi" | "kismi" | "bekliyor";

export interface PeriodDetailItem {
  id: number;
  kaynak: PeriodKaynak;
  kaynak_label: string;
  kisi_adi: string;
  tutar: number;
  toplam_tutar?: number;
  odenen_tutar?: number;
  kalan_tutar?: number;
  tahsil_durumu?: TahsilDurumu;
  tahsil_durumu_label?: string;
  odeme_yontemi: string | null;
  odeme_yontemi_tipi: string | null;
  tarih: string;
  vade_tarihi?: string | null;
  aciklama?: string | null;
  sozlesme_id?: number | null;
  sozlesme_no?: string | null;
  gelir_id?: number | null;
  cari_hesap_id?: number | null;
}

export interface PeriodDetailsResponse {
  mode: PeriodMode;
  baslangic: string;
  bitis: string;
  results: PeriodDetailItem[];
  count: number;
  page: number;
  page_size: number;
  total_pages: number;
}

export interface PeriodQueryParams {
  kurum_id: number;
  sube_id?: number;
  egitim_yili_id?: number;
  baslangic: string;
  bitis: string;
  mode: PeriodMode;
  odeme_yontemi_tipi?: string[];
  odeme_yontemi_id?: number[];
  kaynak?: PeriodKaynak;
  page?: number;
  page_size?: number;
}
