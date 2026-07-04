// ─── Geciken Taksitler — TypeScript Types ─────────────────────

export type OverdueDurumFilter = "gecikmis" | "bugun_vadeli" | "yaklasan";
export type GecikmeAraligi = "1-7" | "8-15" | "16-30" | "30+";
export type DurumRenk = "yellow" | "orange" | "red" | "blue";

export interface OverduePaymentItem {
  taksit_id: number;
  sozlesme_id: number;
  sozlesme_no: string;
  ogrenci_id: number | null;
  ogrenci_adi: string;
  ogrenci_no: string;
  veli_adi: string | null;
  veli_telefon: string | null;
  veli_email?: string | null;
  sube_id: number | null;
  sube_ad: string | null;
  sinif_id: number | null;
  sinif_ad: string;
  rehber_ogretmen: string;
  taksit_no: number;
  vade_tarihi: string;
  taksit_tutari: number;
  kalan_tutar: number;
  gecikme_gun: number;
  son_tahsilat_tarihi: string | null;
  toplam_gecikmis_tutar: number;
  durum_label: string;
  durum_renk: DurumRenk;
  liste_durumu?: string;
  egitim_yili_id: number | null;
  already_sent_24h?: boolean;
  cari_hesap_id?: number | null;
}

export interface OverduePaymentsSummary {
  toplam_geciken_tutar: number;
  geciken_ogrenci_sayisi: number;
  bugun_vadesi_gelen: number;
  otuz_artı_geciken: number;
  ortalama_gecikme_gun: number;
  tahsilat_basarisi_orani: number;
  // geriye dönük
  toplam_kalan_tutar?: number;
  toplam_taksit_sayisi?: number;
  kisi_sayisi?: number;
}

export interface OverduePaymentsResponse {
  ozet: OverduePaymentsSummary;
  results: OverduePaymentItem[];
  count: number;
  page: number;
  page_size: number;
  total_pages: number;
}

export interface OverduePaymentsParams {
  kurum_id: number;
  sube_id?: number;
  egitim_yili_id?: number;
  durum?: OverdueDurumFilter;
  baslangic?: string;
  bitis?: string;
  sinif_id?: number;
  ogrenci_id?: number;
  rehber_id?: number;
  gecikme_araligi?: GecikmeAraligi;
  min_tutar?: number;
  max_tutar?: number;
  min_gecikme_gun?: number;
  arama?: string;
  ordering?: string;
  page?: number;
  page_size?: number;
  bu_ay_vadesi?: boolean;
  /** Export için virgülle ayrılmış sütun anahtarları (örn. ogrenci_adi,veli_adi) */
  columns?: string;
  /** portrait | landscape — PDF ve Excel yazdırma yönü */
  orientation?: "portrait" | "landscape";
}

export interface OverduePaymentDetail extends OverduePaymentItem {
  ogrenci: {
    id: number | null;
    ad_soyad: string;
    numara: string;
    sube: string | null;
    sinif: string;
  };
  finans: {
    sozlesme_no: string;
    sozlesme_tutari: number;
    toplam_odenen: number;
    kalan_borc: number;
    geciken_tutar: number;
    geciken_taksit_sayisi: number;
    son_tahsilat_tarihi: string | null;
  };
  iletisim: {
    veli: string | null;
    telefon: string | null;
    email: string | null;
  };
  gecmis: {
    son_arama: string | null;
    son_whatsapp: string | null;
    son_not: string | null;
  };
}

export interface OverdueReminderRecipient {
  taksit_id: number;
  veli_id?: number | null;
  veli_adi: string;
  ogrenci_adi: string;
  telefon: string | null;
  rendered_body: string;
  skip_reason?: string | null;
  already_sent_24h?: boolean;
}

export interface OverdueReminderPreviewRequest {
  taksit_ids: number[];
  template?: string;
}

export interface OverdueReminderPreviewResponse {
  recipients: OverdueReminderRecipient[];
  template: string;
  sendable_count: number;
  skipped_count: number;
}

export interface OverdueReminderSendRequest {
  taksit_ids: number[];
  template: string;
  force_resend?: boolean;
}

export interface OverdueReminderSendResult {
  taksit_id: number;
  veli_adi: string;
  status: "sent" | "skipped" | "error";
  message?: string;
}

export interface OverdueReminderSendResponse {
  sent: number;
  skipped: number;
  errors: string[];
  results: OverdueReminderSendResult[];
}

export type GecikenColumnKey =
  | "ogrenci"
  | "veli"
  | "telefon"
  | "sube"
  | "sinif"
  | "rehber"
  | "vade"
  | "gecikme"
  | "taksit_tutari"
  | "kalan"
  | "son_tahsilat"
  | "durum";

/** UI kolon anahtarı → export API sütun anahtarları */
export const GECIKEN_COLUMN_EXPORT_KEYS: Record<GecikenColumnKey, string[]> = {
  ogrenci: ["ogrenci_adi", "ogrenci_no"],
  veli: ["veli_adi"],
  telefon: ["veli_telefon"],
  sube: ["sube_ad"],
  sinif: ["sinif_ad"],
  rehber: ["rehber_ogretmen"],
  vade: ["vade_tarihi"],
  gecikme: ["gecikme_gun"],
  taksit_tutari: ["taksit_tutari"],
  kalan: ["kalan_tutar"],
  son_tahsilat: ["son_tahsilat_tarihi"],
  durum: ["durum_label"],
};
