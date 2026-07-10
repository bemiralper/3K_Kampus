export type LookupOption = {
  id: number;
  code: string;
  label: string;
  metadata?: Record<string, unknown> | null;
};

export type CityOption = {
  id: number;
  name: string;
  ad?: string; // alias for name
  code?: string;
  is_default?: boolean;
};

export type DistrictOption = {
  id: number;
  ad: string;
};

export type SinifSeviyesi = {
  id: number;
  ad: string;
  kod: string;
  has_alan: boolean;
  ogrenci_no_prefix: string;
};

export type Alan = {
  id: number;
  ad: string;
  kod: string;
};

export type Sube = {
  id: number;
  ad: string;
  kod: string;
  aktif_mi?: boolean;
};

export type EgitimYili = {
  id: number;
  yil: string;
  aktif_mi?: boolean;
};

export type PackageInfo = {
  id: string;  // Benzersiz ID: "kategori_dbId" formatında
  db_id?: number;  // Orijinal veritabanı ID'si
  ad: string;
  kod?: string;
  aciklama?: string;
  kategori?: string;
  fiyat: number;
  kdv_orani?: number;
  kdv_dahil_fiyat?: number;
  taksit_sayisi: number;
  is_active: boolean;
  dahil_ek_hizmet_ids?: number[];  // Pakete dahil olan ek hizmet ID'leri
  dahil_deneme_paketi_ids?: number[];  // Pakete tanımlı ücretsiz denemeler (M2M)
  dahil_yayin_paketi_ids?: number[];  // Grup/premium pakete dahil yayın paketleri
  net_fiyat?: number;
  alan_id?: number | null;
};

export type YayinPaketiInfo = {
  id: number;
  ad: string;
  kod: string;
  fiyat: number;
  kdv_orani?: number;
  kdv_dahil_fiyat?: number;
  net_fiyat?: number;
  aciklama: string;
  sinif_seviyeleri: { id: number; ad: string }[];
};

export type EkHizmetInfo = {
  id: number;
  ad: string;
  kod: string;
  hizmet_turu: string;
  hizmet_turu_display: string;
  fiyat: number;
  kdv_orani?: number;
  kdv_dahil_fiyat?: number;
  net_fiyat?: number;
  ucretsiz?: boolean;
  deneme_paketi_id?: number;
  deneme_sayisi?: number;
  aktif_mi: boolean;
  aciklama: string;
};

export type DenemePaketiInfo = {
  id: number;
  ad: string;
  kod: string;
  deneme_sayisi: number;
  fiyat: number;
  kdv_orani: number;
  kdv_dahil_fiyat: number;
  net_fiyat?: number;
  aciklama: string;
  sinif_seviyeleri: { id: number; ad: string }[];
  dahil_ek_hizmet_ids?: number[];
};

export type SinifOption = {
  id: number;
  ad: string;
  sinif_seviyesi_id?: number | null;
  alan_id?: number | null;
  egitim_yili_id?: number | null;
};

export type MetadataResponse = {
  lookups: Record<string, LookupOption[]>;
  cities: CityOption[];
  rules: Array<Record<string, unknown>>;
  sinif_seviyeleri: SinifSeviyesi[];
  alanlar: Alan[];
  siniflar?: SinifOption[];
  subeler: Sube[];
  egitim_yillari: EgitimYili[];
};

export type StudentData = {
  kayit_turu?: number;
  kisi_id?: number;
  tc_locked?: boolean;
  tc_kimlik_no: string;
  ad: string;
  soyad: string;
  dogum_tarihi: string;
  cinsiyet?: number;
  email: string;
  telefon: string;
};

export type EnrollmentData = {
  ogrenci_no: string;
  egitim_yili?: number;
  sinif_seviyesi?: number;
  alan?: number;
  sinif?: number;
  sube?: number;
  giris_turu?: number;
  giris_tarihi: string;
  school_id: number | null;
  school_ad: string;
  geldigi_okul: string;
  referans: string;
};

export type AddressData = {
  adres_turu?: number;
  il?: number;
  ilce?: number;
  ilce_adi?: string; // Erzurum dışındaki iller için manuel ilçe girişi
  posta_kodu: string;
  acik_adres: string;
};

export type GuardianAddressData = {
  adres_turu?: number;
  il?: number;
  ilce?: number;
  ilce_adi?: string;
  posta_kodu: string;
  acik_adres: string;
};

export type GuardianData = {
  yakinlik_turu?: number;
  kisi_id?: number;
  tc_locked?: boolean;
  tc_kimlik_no: string;
  ad: string;
  soyad: string;
  email: string;
  telefon: string;
  meslek: string;
  is_sms_enabled: boolean;
  is_email_enabled: boolean;
  // Veli adresi
  adres_ayni_mi: boolean; // true: öğrenci adresi ile aynı, false: farklı adres
  adres?: GuardianAddressData;
};

export type PackageData = {
  paketler: string[];  // grup/premium/özel ders composite ID ("kategori_dbId")
  ek_hizmet_ids: number[];  // Ücretli kütüphane, koçluk
  deneme_paketi_id: number | null;  // En fazla bir deneme paketi
  yayin_paketi_ids: number[];  // Yayın paketi seçimi
};

export type WizardData = {
  student: StudentData;
  enrollment: EnrollmentData;
  address: AddressData;
  guardians: GuardianData[];
  package: PackageData;
  // Veli seçimi: 'self' = öğrenci kendi velisi, 'add' = veli eklenecek
  veliSecimi: 'self' | 'add' | null;
};

export type StepType = 'kimlik' | 'kurumsal' | 'adres' | 'veli' | 'paket' | 'ozet';

// ═══ TC Kimlik Kontrol Yanıtları ═══

export type TcCheckOgrenci = {
  id: number;
  kisi_id?: number | null;
  tc_kimlik_no: string;
  ad: string;
  soyad: string;
  dogum_tarihi: string;
  cinsiyet: string;
  telefon: string;
  email: string;
  kayit_turu: string;
  aktif_mi: boolean;
};

export type TcCheckKayitGecmisi = {
  egitim_yili: string;
  sinif_seviyesi: string;
  sinif_seviyesi_kod: string;
  alan: string;
  aktif_mi: boolean;
  giris_turu: string;
};

export type TcCheckSonKayit = {
  egitim_yili: string;
  sinif_seviyesi: string;
  sinif_seviyesi_id: number | null;
  sinif_seviyesi_kod: string;
  aktif_mi: boolean;
};

export type TcCheckSozlesme = {
  sozlesme_no: string;
  durum: string;
  paket_adi: string;
};

export type TcCheckVeli = {
  id: number;
  veli_turu: string;
  veli_turu_display: string;
  tc_kimlik_no: string;
  ad: string;
  soyad: string;
  telefon: string;
  email: string;
  meslek: string;
  ogrenci_kendi_velisi: boolean;
  varsayilan: boolean;
};

export type TcCheckAdres = {
  adres_turu: string;
  acik_adres: string;
  il: string;
  ilce: string;
  posta_kodu: string;
};

export type TcCheckSonrakiSeviye = {
  id: number;
  ad: string;
  kod: string;
  has_alan: boolean;
};

export type TcCheckResponse = {
  found: boolean;
  ogrenci?: TcCheckOgrenci;
  son_kayit?: TcCheckSonKayit | null;
  kayit_gecmisi?: TcCheckKayitGecmisi[];
  son_sozlesme?: TcCheckSozlesme | null;
  veliler?: TcCheckVeli[];
  adres?: TcCheckAdres | null;
  sonraki_seviye?: TcCheckSonrakiSeviye | null;
  aktif_yilda_kayitli?: boolean;
  kimlik_roller?: import("@/lib/kimlik-api").KimlikRol[];
  kimlik_uyarilari?: string[];
};

// ═══ Veli TC Kontrol Yanıtları ═══

export type VeliTcCheckBagliOgrenci = {
  id: number;
  ad: string;
  soyad: string;
  tc_kimlik_no: string;
  yakinlik: string;
};

export type VeliTcCheckVeli = {
  kisi_id?: number | null;
  tc_kimlik_no: string;
  ad: string;
  soyad: string;
  telefon: string;
  email: string;
  meslek: string;
  veli_turu: string;
  veli_turu_display: string;
};

export type VeliTcCheckResponse = {
  found: boolean;
  veli?: VeliTcCheckVeli;
  bagli_ogrenciler?: VeliTcCheckBagliOgrenci[];
  kimlik_roller?: import("@/lib/kimlik-api").KimlikRol[];
  kimlik_uyarilari?: string[];
};

// ═══ Kayıt Yenileme Durumu ═══

export type RenewalState = {
  isRenewal: boolean;
  tcLocked?: boolean;
  existingOgrenciId?: number;
  existingKisiId?: number;
  previousEnrollment?: TcCheckSonKayit | null;
  suggestedSeviye?: TcCheckSonrakiSeviye | null;
  existingVeliler?: TcCheckVeli[];
  existingAdres?: TcCheckAdres | null;
};
