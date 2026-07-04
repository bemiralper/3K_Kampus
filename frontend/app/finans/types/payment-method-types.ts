// ─── Finans Modülü — Ödeme Yöntemi Types ──────────────────────
// Not: Her ödeme yöntemi artık tam olarak bir Mali Hesaba (mali_hesap) bağlıdır.

export interface OdemeYontemi {
  id: number;
  ad: string;
  tip: string;
  tip_display: string;
  komisyon_orani: number;
  valor_gun: number;
  siralama: number;
  aktif_mi: boolean;
  aciklama: string;
  kurum: number;
  kurum_ad: string;
  mali_hesap: number;
  mali_hesap_ad: string | null;
  silinebilir?: boolean;
  kullanimda?: boolean;
  silindi_mi: boolean;
  silinme_tarihi: string | null;
  created_at: string;
  updated_at: string;
}

export interface OdemeYontemiCreatePayload {
  kurum_id: number;
  mali_hesap_id?: number | null;
  ad: string;
  tip: string;
  komisyon_orani?: number | null;
  valor_gun?: number | null;
  siralama?: number;
  aktif_mi?: boolean;
  aciklama?: string | null;
}

export interface OdemeYontemiUpdatePayload {
  mali_hesap_id?: number;
  ad?: string;
  tip?: string;
  komisyon_orani?: number | null;
  valor_gun?: number | null;
  siralama?: number;
  aktif_mi?: boolean;
  aciklama?: string | null;
}

export interface OdemeYontemiListResponse {
  odeme_yontemleri: OdemeYontemi[];
  toplam: number;
  tip_secenekleri: [string, string][];
}

// ─── Tip Sabitleri ──────────────────────────────────────────────
export const ODEME_YONTEMI_TIPLERI: { value: string; label: string }[] = [
  { value: "nakit", label: "Nakit" },
  { value: "pos", label: "POS Cihazı" },
  { value: "havale_eft", label: "Havale / EFT" },
  { value: "online", label: "Online Ödeme" },
  { value: "cek", label: "Çek" },
  { value: "senet", label: "Senet" },
];

export const tipLabel = (tip: string): string => {
  const found = ODEME_YONTEMI_TIPLERI.find((t) => t.value === tip);
  return found ? found.label : tip;
};
