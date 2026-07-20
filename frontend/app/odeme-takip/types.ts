// ─── Ödeme Takip Shared Types ──────────────────────────────────

export interface Ogrenci {
  id: number;
  ad: string;
  soyad: string;
  ogrenci_no: string;
}

export interface Veli {
  id: number;
  veli_turu: string;
  veli_turu_label: string;
  ad: string;
  soyad: string;
  tam_ad: string;
  telefon: string;
  tc_kimlik_no: string;
  varsayilan: boolean;
}

export interface Sozlesme {
  id: number;
  sozlesme_no: string;
  ogrenci: Ogrenci | null;
  tarih: string | null;
  paket_adi: string;
  paket_turu: string;
  brut_tutar: number;
  kdv_orani: number;
  kdv_tutari: number;
  kdv_dahil_tutar: number;
  toplam_indirim_tutari: number;
  net_tutar: number;
  odeme_turu: string;
  taksit_sayisi: number;
  durum: string;
  toplam_odenen: number;
  kalan_borc: number;
  odeme_yuzdesi: number;
  olusturma_tarihi: string | null;
  // Finans entegrasyonu
  odeme_yontemi?: { id: number; ad: string; tip: string } | null;
  mali_hesap?: { id: number; ad: string } | null;
  odeme_yontemi_id?: number | null;
  mali_hesap_id?: number | null;
  // detail fields
  baslangic_tarihi?: string | null;
  bitis_tarihi?: string | null;
  ilk_odeme_tarihi?: string | null;
  taksit_periyodu?: string;
  notlar?: string;
  notlar_json?: import("@/lib/sozlesme-notlar").SozlesmeNot[];
  ogrenci_kayit_id?: number | null;
  egitim_yili_id?: number | null;
  kurum_id?: number | null;
  sube_id?: number | null;
  paket_id?: number | null;
  // Yeni alanlar — Revizyon & Ek Bilgiler
  muacceliyet_durumu?: boolean;
  cayma_suresi?: number;
  egitim_turu?: string;
  versiyon?: number;
  revizyon_tarihi?: string | null;
  yetkili_personel?: string | null;
  yetkili_personel_id?: number | null;
  // İlişkili veriler
  kalemler?: Kalem[];
  indirimler?: Indirim[];
  taksitler?: Taksit[];
  tahsilatlar?: TahsilatItem[];
  gecmis?: Gecmis[];
}

export interface Kalem {
  id: number;
  kalem_turu: string;
  kalem_id: number;
  kalem_adi: string;
  brut_tutar: number;
  kdv_orani: number;
  kdv_tutari: number;
  kdv_dahil_tutar: number;
  indirim_orani: number;
  indirim_tutari: number;
  net_tutar: number;
  toplam_tutar: number;
}

export interface Indirim {
  id: number;
  indirim_turu: { id: number; ad: string };
  oran: number;
  tutar: number;
  onay_durumu: string;
  onaylayan: string | null;
  olusturan: string | null;
  aciklama: string;
  olusturma_tarihi: string | null;
}

export interface Taksit {
  id: number;
  taksit_no: number;
  vade_tarihi: string | null;
  tutar: number;
  odenen_tutar: number;
  kalan_tutar: number;
  durum: string;
  odeme_yontemi_id?: number | null;
  // joined fields from vadesi gecenler
  sozlesme_no?: string;
  ogrenci_adi?: string;
}

export interface TahsilatDagitimItem {
  taksit_no: number;
  tutar: number;
}

export interface TahsilatItem {
  id: number;
  sozlesme_id: number;
  sozlesme_no: string;
  ogrenci_adi: string;
  taksit_id: number | null;
  taksit_no: number | null;
  odeme_yontemi: { id: number; ad: string };
  mali_hesap?: { id: number; ad: string } | null;
  bakiye_hareketi_id?: number | null;
  bakiye_yansidi?: boolean;
  tutar: number;
  tahsilat_tarihi: string | null;
  referans_no: string;
  tahsilat_turu: string;
  durum: string;
  iptal_nedeni: string;
  iptal_tarihi: string | null;
  islem_yapan: string | null;
  aciklama: string;
  olusturma_tarihi: string | null;
  dagitim?: TahsilatDagitimItem[];
}

export interface Gecmis {
  id: number;
  islem_turu: string;
  islem_turu_label?: string;
  eski_deger: any;
  yeni_deger: any;
  aciklama: string;
  islem_yapan: string | null;
  islem_tarihi: string | null;
}

export interface OdemeYontemi {
  id: number;
  ad: string;
  kod: string;
  tip?: string;
  mali_hesap_id?: number | null;
  aktif_mi?: boolean;
}

export interface IndirimTuru {
  id: number;
  ad: string;
  kod: string;
  max_oran: number;
  onay_gerektiren_oran: number;
}

export interface DashboardOzet {
  toplam_sozlesme: number;
  brut_toplam: number;
  toplam_indirim: number;
  toplam_hacim: number;
  toplam_tahsilat: number;
  acik_alacak: number;
  geciken_tutar: number;
  geciken_taksit_sayisi: number;
  bu_ay_tahsilat: number;
  ort_tahsil_suresi: number;
}

export type TabType = "sozlesmeler" | "tahsilatlar" | "raporlar";

export type SozlesmeSubTab = "genel" | "kalemler" | "odeme-plani" | "tahsilatlar" | "belgeler" | "notlar";

export interface TahsilatFormData {
  sozlesme_id: string;
  taksit_id: string;
  odeme_yontemi_id: string;
  mali_hesap_id?: string;
  tutar: string;
  tahsilat_tarihi: string;
  referans_no: string;
  aciklama: string;
  cek_senet_no?: string;
  banka_adi?: string;
  cek_senet_vade?: string;
  cek_senet_durum?: string;
}

// ─── Fesih Types ────────────────────────────────────────────

export interface FesihKesinti {
  ad: string;
  tutar: number;
}

export interface FesihNedeniOption {
  value: string;
  label: string;
}

export interface FesihOnizleme {
  sozlesme_id: number;
  sozlesme_no: string;
  ogrenci_adi: string;
  fesih_tarihi: string;
  sozlesme_net_tutar: number;
  toplam_odenen: number;
  toplam_gun: number;
  kullanilan_gun: number;
  kullanilan_tutar: number;
  kesintiler: FesihKesinti[];
  kesinti_tutari: number;
  ceza_orani: number;
  ceza_tutari: number;
  iade_tutari: number;
  iade_mi_borc_mu: 'iade' | 'borc' | 'sifir';
  iptal_edilecek_taksit_sayisi: number;
  iptal_edilecek_taksit_tutar: number;
}

export interface FesihDetay {
  id: number;
  sozlesme_id: number;
  sozlesme_no: string;
  ogrenci: { ad: string; soyad: string } | null;
  fesih_tarihi: string;
  fesih_nedeni: string;
  fesih_nedeni_display: string;
  fesih_aciklama: string;
  sozlesme_net_tutar: number;
  toplam_odenen: number;
  toplam_gun: number;
  kullanilan_gun: number;
  kullanilan_tutar: number;
  kesintiler: FesihKesinti[];
  kesinti_tutari: number;
  ceza_orani: number;
  ceza_tutari: number;
  iade_tutari: number;
  iade_yapildi_mi: boolean;
  iade_tarihi: string | null;
  iptal_edilen_taksit_sayisi: number;
  fesih_eden: string | null;
  created_at: string | null;
}

// ─── Kalem Seçenekleri Types ────────────────────────────────

export interface KalemSecenegi {
  id: number;
  ad: string;
  kod: string;
  fiyat: number;
  kdv_orani: number;
  kdv_tutari: number;
  kdv_dahil_fiyat: number;
  deneme_sayisi?: number;
  hizmet_turu?: string;
  aciklama?: string;
}

export interface KalemTuruOption {
  value: string;
  label: string;
  kalem_turu?: "paket" | "ek_hizmet";
}

// ─── Tahsilat Filtre Types ──────────────────────────────────

export interface TahsilatFiltre {
  ogrenci_adi?: string;
  sozlesme_no?: string;
  tarih_baslangic?: string;
  tarih_bitis?: string;
  durum?: string;
  tahsilat_turu?: string;
  odeme_yontemi_id?: string;
}

// ─── Öğrenci Risk Skoru Types ───────────────────────────────

export interface OgrenciRiskSkoru {
  ogrenci_id: number;
  ogrenci_adi: string;
  ogrenci_no: string;
  toplam_taksit: number;
  gecikme_sayisi: number;
  ort_gecikme_gun: number;
  kismi_oran: number;
  odeme_orani: number;
  /** Vadesi gelmiş taksitlerde tahsilat oranı — risk skorunda kullanılır */
  vade_uyum_orani: number;
  vadesi_gelen_sayisi?: number;
  toplam_tutar: number;
  toplam_odenen: number;
  kalan_borc: number;
  risk_skoru: number;
  risk_seviye: 'dusuk' | 'orta' | 'yuksek' | 'kritik';
}
