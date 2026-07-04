// ─── Finans Raporlama — TypeScript Types ──────────────────────

// ═══ Gelir-Gider Raporu ═══════════════════════════════════════
export interface AylikGelirGider {
  ay: string;
  ay_label: string;
  gelir: number;
  iade: number;
  gider: number;
  net: number;
}

export interface YontemDagilimi {
  yontem: string;
  toplam: number;
  adet: number;
}

export interface GelirGiderRapor {
  aylik: AylikGelirGider[];
  toplam_gelir: number;
  toplam_iade: number;
  toplam_gider: number;
  net_gelir: number;
  yontem_dagilimi: YontemDagilimi[];
}

// ═══ Tahsilat Analiz ══════════════════════════════════════════
export interface TaksitDurumDagilimi {
  durum: string;
  adet: number;
  toplam: number;
}

export interface AylikPerformans {
  ay: string;
  ay_label: string;
  tahsil_edilen: number;
  beklenen: number;
  adet: number;
  oran: number;
}

export interface SozlesmeDagilimi {
  durum: string;
  adet: number;
  toplam: number;
}

export interface TahsilatAnaliz {
  toplam_alacak: number;
  toplam_tahsil: number;
  kalan_borc: number;
  genel_oran: number;
  taksit_durum_dagilimi: TaksitDurumDagilimi[];
  aylik_performans: AylikPerformans[];
  sozlesme_dagilimi: SozlesmeDagilimi[];
}

// ═══ Borç Yaşlandırma ════════════════════════════════════════
export interface YaslandirmaDetay {
  sozlesme_id: number;
  sozlesme_no: string;
  ogrenci_adi: string;
  taksit_no: number;
  vade_tarihi: string;
  tutar: number;
  kalan: number;
  gecikme_gun: number;
}

export interface YaslandirmaGrup {
  label: string;
  adet: number;
  toplam: number;
  detay: YaslandirmaDetay[];
}

export interface BorcYaslandirma {
  gruplar: {
    '0_30': YaslandirmaGrup;
    '31_60': YaslandirmaGrup;
    '61_90': YaslandirmaGrup;
    '90_plus': YaslandirmaGrup;
  };
  toplam_geciken_tutar: number;
  toplam_geciken_adet: number;
  tarih: string;
}

// ═══ Dönem Raporu ═════════════════════════════════════════════
export interface DonemHesap {
  id: number;
  mali_hesap_id: number;
  mali_hesap_ad: string;
  mali_hesap_tip: string;
  donem_basi_bakiye: number;
  toplam_gelir: number;
  toplam_gider: number;
  donem_sonu_bakiye: number;
  durum: string;
  durum_label: string;
}

export interface DonemOzet {
  hesaplar?: DonemHesap[];
  toplam_donem_basi?: number;
  toplam_gelir: number;
  toplam_gider: number;
  toplam_bakiye: number;
  net_kar: number;
  // Kurum özet (şube bazlı)
  subeler?: Array<{
    sube_id: number;
    sube_ad: string;
    donem_basi_bakiye: number;
    toplam_gelir: number;
    toplam_gider: number;
    donem_sonu_bakiye: number;
  }>;
}

export interface YillarArasiKarsilastirma {
  egitim_yili_id: number;
  yil: string;
  donem_basi: number;
  toplam_gelir: number;
  toplam_gider: number;
  net_kar: number;
  donem_sonu_bakiye: number;
  gider_gelir_orani: number | null;
  degisim_yuzde: number | null;
}

export interface DonemRapor {
  donem_ozet: DonemOzet | null;
  yillar_arasi: YillarArasiKarsilastirma[];
}

// ═══ Aktif Rapor Tab (legacy RaporlamaClient) ═════════════════
export type RaporTab = 'gelir-gider' | 'tahsilat' | 'yaslandirma' | 'donem';

// ═══ Rapor Merkezi — yeni + mevcut rapor slug'ları ════════════
export type ReportSlug =
  | 'cek-bilgileri'
  | 'cek-senet-listesi'
  | 'gunluk-satis'
  | 'gunluk-satis-detay'
  | 'aylik-satis'
  | 'tahsilat-analiz'
  | 'gelir-gider'
  | 'borc-yaslandirma'
  | 'tahsilat-analiz-legacy'
  | 'donem';

export type ReportFormat = 'json' | 'csv' | 'xlsx' | 'pdf';

export interface ReportMeta {
  slug: ReportSlug;
  title: string;
  description: string;
  icon: string;
  category: 'tahsilat' | 'satis' | 'cek-senet' | 'finans';
  legacy?: boolean;
}

export interface ReportFilterParams {
  kurum_id: number;
  sube_id?: number;
  egitim_yili_id?: number;
  baslangic?: string;
  bitis?: string;
  odeme_yontemi_tipi?: string;
  kaynak?: string;
}

export interface ReportColumn {
  key: string;
  label: string;
  align?: 'left' | 'right' | 'center';
}

export interface ReportJsonResponse {
  slug: string;
  title: string;
  generated_at: string;
  filters: Record<string, string | number | null>;
  columns: ReportColumn[];
  rows: Record<string, string | number | null>[];
  summary?: Record<string, string | number | null>;
}

/** Column definitions mirroring backend _report_columns — used when API omits columns. */
export const REPORT_COLUMN_FALLBACKS: Partial<Record<ReportSlug, ReportColumn[]>> = {
  "cek-bilgileri": [
    { key: "cek_senet_no", label: "No" },
    { key: "banka_adi", label: "Banka" },
    { key: "vade_tarihi", label: "Vade" },
    { key: "durum_label", label: "Durum" },
    { key: "tutar", label: "Tutar", align: "right" },
    { key: "sozlesme_no", label: "Sözleşme" },
  ],
  "cek-senet-listesi": [
    { key: "cek_senet_no", label: "No" },
    { key: "banka_adi", label: "Banka" },
    { key: "vade_tarihi", label: "Vade" },
    { key: "durum_label", label: "Durum" },
    { key: "tutar", label: "Tutar", align: "right" },
    { key: "sozlesme_no", label: "Sözleşme" },
  ],
  "gunluk-satis": [
    { key: "tarih", label: "Tarih" },
    { key: "toplam", label: "Toplam (TL)", align: "right" },
  ],
  "gunluk-satis-detay": [
    { key: "tarih", label: "Tarih" },
    { key: "kaynak", label: "Kaynak" },
    { key: "tutar", label: "Tutar (TL)", align: "right" },
    { key: "aciklama", label: "Açıklama" },
    { key: "sube_ad", label: "Şube" },
    { key: "odeme_yontemi_tipi", label: "Ödeme Yöntemi" },
  ],
  "aylik-satis": [
    { key: "ay", label: "Ay" },
    { key: "ay_label", label: "Dönem" },
    { key: "toplam", label: "Toplam (TL)", align: "right" },
  ],
  "tahsilat-analiz": [
    { key: "kaynak", label: "Kaynak" },
    { key: "toplam", label: "Toplam (TL)", align: "right" },
    { key: "adet", label: "Adet", align: "right" },
  ],
};
