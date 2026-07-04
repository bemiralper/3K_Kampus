// ─── Finans Modülü — Mali Hesap Types ──────────────────────────

export interface MaliHesap {
  id: number;
  ad: string;
  tip: string;
  tip_display: string;
  banka: string;
  banka_display: string;
  iban: string;
  banka_adi: string;
  hesap_no: string;
  baslangic_bakiye: number;
  para_birimi: string;
  siralama: number;
  aktif_mi: boolean;
  aciklama: string;
  sube: number;
  sube_ad: string;
  silindi_mi: boolean;
  silinme_tarihi: string | null;
  created_at: string;
  updated_at: string;
}

/** Mali Hesap Detay Paneli — bakiye/son işlem/ödeme yöntemi sayısı dahil. */
export interface MaliHesapDetay extends MaliHesap {
  bakiye: number;
  son_islem_tarihi: string | null;
  odeme_yontemi_sayisi: number;
}

export interface MaliHesapCreatePayload {
  sube_id: number;
  ad: string;
  tip: string;
  banka?: string;
  iban?: string;
  banka_adi?: string;
  hesap_no?: string;
  baslangic_bakiye?: number;
  para_birimi?: string;
  siralama?: number;
  aktif_mi?: boolean;
  aciklama?: string;
}

export interface MaliHesapUpdatePayload {
  ad?: string;
  tip?: string;
  banka?: string;
  iban?: string;
  banka_adi?: string;
  hesap_no?: string;
  baslangic_bakiye?: number;
  para_birimi?: string;
  siralama?: number;
  aktif_mi?: boolean;
  aciklama?: string;
}

export interface MaliHesapListResponse {
  mali_hesaplar: MaliHesap[];
  toplam: number;
  tip_secenekleri: [string, string][];
  banka_secenekleri: [string, string][];
}

// ─── TreeView (Şube bazlı ağaç) ─────────────────────────────────

export interface MaliHesapAgacHesap {
  id: number;
  ad: string;
  tip: string;
  tip_label: string;
  bakiye: number;
  para_birimi: string;
  aktif_mi: boolean;
  odeme_yontemi_sayisi: number;
}

export interface MaliHesapAgacSube {
  sube_id: number;
  sube_ad: string;
  hesaplar: MaliHesapAgacHesap[];
}

export interface MaliHesapAgacResponse {
  subeler: MaliHesapAgacSube[];
}

// ─── Mali Hesap Yetkilisi (bilgilendirme amaçlı) ────────────────

export interface MaliHesapYetkilisi {
  id: number;
  mali_hesap: number;
  personel: number | null;
  personel_ad: string | null;
  ad_soyad: string;
  rol: string;
  telefon: string;
  email: string;
  notlar: string;
  siralama: number;
  created_at: string;
  updated_at: string;
}

export interface MaliHesapYetkilisiPayload {
  personel_id?: number | null;
  ad_soyad?: string;
  rol?: string;
  telefon?: string;
  email?: string;
  notlar?: string;
  siralama?: number;
}

// ─── Tip Sabitleri ──────────────────────────────────────────────
export const MALI_HESAP_TIPLERI: { value: string; label: string }[] = [
  { value: "banka", label: "Banka Hesabı" },
  { value: "kasa", label: "Nakit Kasa" },
  { value: "pos", label: "POS Hesabı" },
  { value: "sanal_pos", label: "Sanal POS" },
  { value: "e_cuzdan", label: "E-Cüzdan" },
  { value: "diger", label: "Diğer" },
];

export const BANKA_SECENEKLERI: { value: string; label: string }[] = [
  { value: "vakifbank", label: "VakıfBank" },
  { value: "ziraat", label: "Ziraat Bankası" },
  { value: "halkbank", label: "Halkbank" },
  { value: "is_bankasi", label: "İş Bankası" },
  { value: "garanti", label: "Garanti BBVA" },
  { value: "akbank", label: "Akbank" },
  { value: "yapi_kredi", label: "Yapı Kredi" },
  { value: "qnb", label: "QNB" },
  { value: "teb", label: "TEB" },
  { value: "denizbank", label: "Denizbank" },
  { value: "ing", label: "ING" },
  { value: "hsbc", label: "HSBC" },
  { value: "fibabank", label: "Fibabanka" },
  { value: "sekerbank", label: "Şekerbank" },
  { value: "odeabank", label: "Odea Bank" },
  { value: "albaraka", label: "Albaraka Türk" },
  { value: "kuveyt", label: "Kuveyt Türk" },
  { value: "diger", label: "Diğer" },
];

export const PARA_BIRIMLERI: { value: string; label: string }[] = [
  { value: "TRY", label: "TRY" },
  { value: "USD", label: "USD" },
  { value: "EUR", label: "EUR" },
  { value: "GBP", label: "GBP" },
];

/** Banka dropdown'u gösterilecek tipler */
export const BANKA_ZORUNLU_TIPLER = ["banka", "pos"];

/** Banka hesabı detay alanları (IBAN, hesap no) — opsiyonel */
export const BANKA_DETAY_TIPLER = ["banka"];

export const hesapTipLabel = (tip: string): string => {
  const found = MALI_HESAP_TIPLERI.find((t) => t.value === tip);
  return found ? found.label : tip;
};

export const bankaLabel = (code: string): string => {
  const found = BANKA_SECENEKLERI.find((b) => b.value === code);
  return found ? found.label : code;
};
