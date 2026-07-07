// Personel detay sayfası tip tanımları

export type PersonelDetay = {
  id: number;
  tc_kimlik_no: string;
  ad: string;
  soyad: string;
  tam_ad: string;
  dogum_tarihi: string;
  dogum_tarihi_iso: string;
  cinsiyet: string;
  cinsiyet_display: string;
  telefon: string;
  cep_telefon: string;
  email: string;
  adres: string;
  il: string;
  ilce: string;
  acil_durum_kisi: string;
  acil_durum_telefon: string;
  aktif_mi: boolean;
  fotograf: string | null;
  notlar: string;
  created_at: string;
  updated_at: string;
  kurum: { id: number; ad: string } | null;
  sube: { id: number; ad: string } | null;
  // Kullanıcı hesap bilgileri
  has_user_account: boolean;
  user: {
    id: number;
    username: string;
    email: string;
    is_active: boolean;
    last_login: string | null;
    date_joined: string | null;
  } | null;
  must_change_password: boolean;
  user_ana_sube_ad?: string | null;
  user_account_shared?: boolean;
  user_account_owner_sube_ad?: string | null;
};

export type PersonelGorevlendirme = {
  id: number;
  egitim_yili_id: number;
  egitim_yili_ad: string;
  egitim_yili_aktif: boolean;
  rol_id: number | null;
  rol_ad: string;
  rol_kod: string;
  gorev_sube_id: number;
  gorev_sube_ad: string;
  brans_id: number | null;
  brans_ad: string | null;
  gorev_baslangic: string | null;
  gorev_bitis: string | null;
  aktif_mi: boolean;
  created_at: string;
};

export type AktiviteLog = {
  id: number;
  eylem: string;
  eylem_display: string;
  detay: string;
  ip_adresi: string;
  user_agent: string;
  sayfa_url: string;
  created_at: string;
};

export type PersonelStats = {
  toplam_giris: number;
  son_giris: string | null;
  son_cikis: string | null;
  aktif_oturum_suresi: string | null;
  bu_ay_giris: number;
  bu_hafta_giris: number;
  ortalama_oturum_suresi: string | null;
};

export type TabType = 'gorevlendirmeler' | 'hesap' | 'aktivite';

export interface TabConfig {
  id: TabType;
  label: string;
  icon: React.ReactNode;
}
