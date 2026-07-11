/* ═══════════════════════════════════════════
   Personel Sözleşmeleri — TypeScript Tipleri
   ═══════════════════════════════════════════ */

export type SozlesmeTuru = 'TAM_ZAMANLI' | 'DERS_UCRETLI' | 'KARMA';
export type SozlesmeDurumu = 'TASLAK' | 'AKTIF' | 'ASKIDA' | 'SONA_ERDI' | 'FESHEDILDI' | 'PASIF' | 'SURESI_DOLMU';
export type UcretTipi = 'SAAT_BASI' | 'DERS_BASI' | 'AYLIK_PAKET';
export type DersUcretTipi = 'SAAT_BASI' | 'DERS_BASI';
export type HakedisDurumu = 'HESAPLANDI' | 'ONAYLANDI' | 'ODENDI' | 'IPTAL';

// ── Sözleşme v2 alt kayıtları ──

export interface MaasPlaniSatiri {
  id?: number;
  sira_no: number;
  baslangic_tarihi: string;
  bitis_tarihi: string;
  calisilan_gun: number;
  maas: number;
  aciklama: string;
}

export interface MesaiSaati {
  id?: number;
  gun: number;
  baslangic: string | null;
  bitis: string | null;
  mola_dakika: number;
  aktif: boolean;
}

export interface SozlesmeMadde {
  id?: number;
  sira: number;
  metin: string;
}

export interface OzetMetrikleri {
  toplam_maas: number;
  toplam_calisma_suresi_ay: number;
  haftalik_calisma_saati: number;
  ders_ucreti: number;
  ders_ucret_tipi: string;
  sgk_gun: number;
  haftalik_calisma_gun: number;
  gunluk_ucret: number;
  saatlik_ucret: number;
  tahmini_aylik_maliyet: number;
  kalan_gun: number;
}

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
  sozlesme_no?: string;
  dogrulama_kodu?: string;
  is_ogretmen?: boolean;
  belge_basligi?: string;
  rol_kodu?: string;
  rol_ad?: string;
  kurum_id?: number;
  kurum?: { ad?: string; adres?: string; telefon_sabit?: string };
  login_logo_url?: string | null;
  personel_id: number;
  personel_ad: string;
  personel_tc?: string;
  personel_foto: string | null;
  personel_no_snapshot?: string;
  brans_snapshot?: string;
  gorev_snapshot?: string;
  departman_snapshot?: string;
  egitim_yili_id: number;
  egitim_yili_display: string;
  sube_id?: number | null;
  sube_ad?: string | null;
  gorevlendirme_id?: number | null;
  sozlesme_turu: SozlesmeTuru;
  sozlesme_turu_display: string;
  durum: SozlesmeDurumu;
  durum_display: string;
  duzenlenme_tarihi?: string | null;
  baslangic_tarihi: string;
  bitis_tarihi: string;
  brut_maas: number;
  net_maas: number;
  sgk_gun: number;
  haftalik_calisma_gun_sayisi?: number;
  haftalik_izin_gunleri?: number[];
  ders_ucreti_aktif: boolean;
  ders_ucret_tipi?: string;
  ders_birim_ucret?: number;
  toplam_calisma_suresi_ay?: number;
  toplam_sozlesme_bedeli?: number;
  auto_save_rev?: number;
  notlar: string;
  sozlesme_dosya: string | null;
  ders_ucretleri: DersUcret[];
  ucret_donemleri: UcretDonemi[];
  maas_plani?: MaasPlaniSatiri[];
  mesai_saatleri?: MesaiSaati[];
  maddeler?: SozlesmeMadde[];
  ozet?: OzetMetrikleri;
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
  duzenlenme_tarihi?: string;
  brut_maas: number;
  net_maas: number;
  sgk_gun: number;
  ders_ucreti_aktif: boolean;
  notlar: string;
  ders_ucretleri: DersUcret[];
  ucret_donemleri: UcretDonemi[];
  sube_id?: number | null;
  gorevlendirme_id?: number | null;
  personel_no_snapshot?: string;
  brans_snapshot?: string;
  gorev_snapshot?: string;
  departman_snapshot?: string;
  haftalik_calisma_gun_sayisi?: number;
  haftalik_izin_gunleri?: number[];
  ders_ucret_tipi?: string;
  ders_birim_ucret?: number;
  maas_plani?: MaasPlaniSatiri[];
  mesai_saatleri?: MesaiSaati[];
  maddeler?: SozlesmeMadde[];
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

export interface Gorevlendirme {
  id: number;
  personel_id: number;
  brans_id: number | null;
  brans_ad: string;
  gorev_ad: string;
  sube_id: number | null;
  sube_ad: string;
}

export interface HelperPersonel {
  id: number;
  ad: string;
  soyad: string;
  tam_ad: string;
  tc_kimlik_no: string;
  sube_id?: number;
  fotograf?: string;
  personel_no?: string;
}

export interface HelperData {
  personeller: HelperPersonel[];
  gorevlendirmeler?: Gorevlendirme[];
  branslar: { id: number; ad: string; kod: string }[];
  sozlesme_turleri: { value: string; label: string }[];
  sozlesme_durumlari: { value: string; label: string }[];
  ucret_tipleri: { value: string; label: string }[];
  ders_ucret_tipleri?: { value: string; label: string }[];
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
  PASIF: 'Pasif',
  SURESI_DOLMU: 'Süresi Doldu',
  ASKIDA: 'Askıda',
  SONA_ERDI: 'Sona Erdi',
  FESHEDILDI: 'Feshedildi',
};

export const DURUM_COLORS: Record<SozlesmeDurumu, string> = {
  TASLAK: '#6b7280',
  AKTIF: '#10b981',
  PASIF: '#f59e0b',
  SURESI_DOLMU: '#6b7280',
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
