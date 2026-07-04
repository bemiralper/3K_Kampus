/* ═══════════════════════════════════════════
   Personel Sözleşmeleri — TypeScript Tipleri
   ═══════════════════════════════════════════ */

export type SozlesmeTuru = 'TAM_ZAMANLI' | 'DERS_UCRETLI' | 'KARMA';
export type SozlesmeDurumu = 'TASLAK' | 'AKTIF' | 'ASKIDA' | 'SONA_ERDI' | 'FESHEDILDI';
export type UcretTipi = 'SAAT_BASI' | 'DERS_BASI' | 'AYLIK_PAKET';
export type HakedisDurumu = 'HESAPLANDI' | 'ONAYLANDI' | 'ODENDI' | 'IPTAL';

export interface DersUcret {
  id?: number;
  brans_id: number | null;
  brans_ad?: string;
  ucret_tipi: UcretTipi;
  ucret_tipi_display?: string;
  birim_ucret: number;
  haftalik_saat: number;
  min_saat: number | null;
  max_saat: number | null;
  notlar: string;
}

export interface UcretDonemi {
  id?: number;
  baslangic_ay: number;
  bitis_ay: number;
  brut_maas: number;
  net_maas: number;
  aciklama: string;
}

export interface Sozlesme {
  id: number;
  personel_id: number;
  personel_ad: string;
  personel_foto: string | null;
  egitim_yili_id: number;
  egitim_yili_display: string;
  sozlesme_turu: SozlesmeTuru;
  sozlesme_turu_display: string;
  durum: SozlesmeDurumu;
  durum_display: string;
  baslangic_tarihi: string;
  bitis_tarihi: string;
  brut_maas: number;
  net_maas: number;
  sgk_gun: number;
  ders_ucreti_aktif: boolean;
  notlar: string;
  sozlesme_dosya: string | null;
  ders_ucretleri: DersUcret[];
  ucret_donemleri: UcretDonemi[];
  fesih_tarihi: string | null;
  fesih_sebebi: string;
  created_at: string;
}

export interface SozlesmeFormData {
  personel_id: number;
  sozlesme_turu: SozlesmeTuru;
  durum?: SozlesmeDurumu;
  baslangic_tarihi: string;
  bitis_tarihi: string;
  brut_maas: number;
  net_maas: number;
  sgk_gun: number;
  ders_ucreti_aktif: boolean;
  notlar: string;
  ders_ucretleri: DersUcret[];
  ucret_donemleri: UcretDonemi[];
}

export interface Hakedis {
  id: number;
  sozlesme_id: number;
  personel_ad: string;
  personel_id: number;
  sozlesme_turu: SozlesmeTuru;
  sozlesme_turu_display: string;
  yil: number;
  ay: number;
  ay_display: string;
  sabit_maas: number;
  toplam_ders_saati: number;
  ders_basi_ucret: number;
  ders_ucreti_toplam: number;
  prim: number;
  fazla_mesai: number;
  ek_odeme: number;
  avans: number;
  kesintiler: number;
  brut_toplam: number;
  net_hakedis: number;
  durum: HakedisDurumu;
  durum_display: string;
  odeme_tarihi: string | null;
  notlar: string;
}

export interface SozlesmeStats {
  toplam: number;
  aktif: number;
  taslak: number;
  tur_dagilimi: Record<string, number>;
  toplam_brut_maas: number;
}

export interface HakedisStats {
  kayit_sayisi: number;
  toplam_brut: number;
  toplam_net: number;
  toplam_ders_saat: number;
  durum_dagilimi: Record<string, number>;
}

export interface HelperData {
  personeller: { id: number; ad: string; soyad: string; tam_ad: string; tc_kimlik_no: string }[];
  branslar: { id: number; ad: string; kod: string }[];
  sozlesme_turleri: { value: string; label: string }[];
  sozlesme_durumlari: { value: string; label: string }[];
  ucret_tipleri: { value: string; label: string }[];
}

// ── Sabitler ──
export const SOZLESME_TURU_LABELS: Record<SozlesmeTuru, string> = {
  TAM_ZAMANLI: 'Tam Zamanlı (Maaşlı)',
  DERS_UCRETLI: 'Ders Ücretli',
  KARMA: 'Karma (Maaş + Ders Ücreti)',
};

export const SOZLESME_TURU_COLORS: Record<SozlesmeTuru, string> = {
  TAM_ZAMANLI: '#3b82f6',
  DERS_UCRETLI: '#8b5cf6',
  KARMA: '#f59e0b',
};

export const DURUM_LABELS: Record<SozlesmeDurumu, string> = {
  TASLAK: 'Taslak',
  AKTIF: 'Aktif',
  ASKIDA: 'Askıda',
  SONA_ERDI: 'Sona Erdi',
  FESHEDILDI: 'Feshedildi',
};

export const DURUM_COLORS: Record<SozlesmeDurumu, string> = {
  TASLAK: '#6b7280',
  AKTIF: '#10b981',
  ASKIDA: '#f59e0b',
  SONA_ERDI: '#6b7280',
  FESHEDILDI: '#ef4444',
};

export const HAKEDIS_DURUM_COLORS: Record<HakedisDurumu, string> = {
  HESAPLANDI: '#3b82f6',
  ONAYLANDI: '#f59e0b',
  ODENDI: '#10b981',
  IPTAL: '#ef4444',
};

export const AY_ADLARI: Record<number, string> = {
  1: 'Ocak', 2: 'Şubat', 3: 'Mart', 4: 'Nisan',
  5: 'Mayıs', 6: 'Haziran', 7: 'Temmuz', 8: 'Ağustos',
  9: 'Eylül', 10: 'Ekim', 11: 'Kasım', 12: 'Aralık',
};

// ── Avans Kayıt Tipleri ──
export interface AvansKaydi {
  id: number;
  sozlesme_id: number;
  personel_ad: string;
  personel_id: number;
  tarih: string;
  tutar: number;
  aciklama: string;
  mahsup_yil: number;
  mahsup_ay: number;
  mahsup_ay_display: string;
  olusturan: string | null;
  created_at: string;
}

export interface AvansFormData {
  sozlesme_id: number;
  tarih: string;
  tutar: number;
  aciklama: string;
  mahsup_yil: number;
  mahsup_ay: number;
}

// ── Personel Ödeme Geçmişi ──
export interface PersonelOdemeGecmisi {
  personel: {
    id: number;
    ad: string;
    soyad: string;
    tam_ad: string;
    fotograf: string | null;
  };
  hakedisler: Hakedis[];
  avanslar: AvansKaydi[];
  ozet: {
    toplam_ay: number;
    toplam_brut: number;
    toplam_net: number;
    toplam_ders_saat: number;
    toplam_avans: number;
    toplam_odenen: number;
    odenen_ay: number;
  };
}

// ── Finans Entegrasyonu ──
export interface GiderKategorisi {
  id: number;
  ad: string;
  ikon: string;
  renk: string;
  ust_kategori_id: number | null;
}

export interface FesihData {
  fesih_sebebi: string;
  fesih_tarihi: string;
}
