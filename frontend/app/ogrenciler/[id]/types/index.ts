// Öğrenci detay sayfası tip tanımları

export type OgrenciAdres = {
  id: number;
  adres_turu: string;
  adres_turu_display: string;
  adres: string;
  il: string;
  ilce: string;
  posta_kodu: string;
  varsayilan: boolean;
};

export type OgrenciVeli = {
  id: number;
  veli_turu: string;
  veli_turu_display: string;
  tc_kimlik_no: string;
  ad: string;
  soyad: string;
  tam_ad: string;
  telefon: string;
  telefonlar?: { numara: string; etiket: string; whatsapp_varsayilan: boolean }[];
  email: string;
  meslek: string;
  varsayilan: boolean;
  sms_bildirimleri?: string[];
};

export type OgrenciEkHizmet = {
  id: number;
  ek_hizmet_id: number;
  ad: string;
  hizmet_turu: string;
  hizmet_turu_display: string;
  fiyat: number;
  dahil_mi: boolean;
  aktif_mi: boolean;
  baslangic_tarihi: string;
  bitis_tarihi: string | null;
};

export type OgrenciDetay = {
  id: number;
  ad: string;
  soyad: string;
  tam_ad: string;
  tc_kimlik_no: string;
  dogum_tarihi: string;
  dogum_tarihi_iso: string;
  cinsiyet: string;
  cinsiyet_display: string;
  kayit_turu: string;
  kayit_turu_display: string;
  telefon: string;
  email: string;
  adres: string;
  veli_ad_soyad: string;
  veli_telefon: string;
  aktif_mi: boolean;
  created_at: string;
  updated_at: string;
  kurum?: { id: number; ad: string };
  sube?: { id: number; ad: string };
  okul_no?: string;
  school_id?: number | null;
  school_ad?: string;
  geldigi_okul?: string;
  sinif?: { id: number; ad: string };
  sinif_seviyesi?: { id: number; ad: string; seviye?: number; kod?: string };
  alan?: { id: number; ad: string; kod?: string } | null;
  egitim_yili?: { id: number; ad: string };
  kayit_tarihi?: string;
  profil_foto?: string | null;
  // Yeni detaylı bilgiler
  adresler?: OgrenciAdres[];
  veliler?: OgrenciVeli[];
  ek_hizmetler?: OgrenciEkHizmet[];
};

export type TabType = 'veli' | 'akademik' | 'sinav' | 'finans' | 'rehberlik' | 'iletisim';

export interface TabConfig {
  id: TabType;
  label: string;
  icon: React.ReactNode;
}
