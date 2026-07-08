// ─── Para Hareketleri / Gün Sonu / Hesap Transferi — Types ──────

export interface ParaHareketi {
  id: number;
  mali_hesap_id: number | null;
  mali_hesap_ad: string;
  mali_hesap_tip: string;
  yon: "giris" | "cikis";
  yon_label: string;
  tutar: number;
  signed_tutar: number;
  kaynak: string;
  kaynak_label: string;
  kaynak_tip: string | null;
  kaynak_id: number | null;
  cari_adi: string;
  odeme_yontemi_adi: string;
  belge_no: string;
  bakiye_sonrasi: number | null;
  islem_tarihi: string;
  aciklama: string;
  islem_yapan: string | null;
  created_at: string | null;
}

export interface ParaHareketleriResponse {
  results: ParaHareketi[];
  count: number;
  page: number;
  page_size: number;
  total_pages: number;
  sayfa_toplam_giris: number;
  sayfa_toplam_cikis: number;
  toplam_giris?: number;
  toplam_cikis?: number;
  net_bakiye?: number;
}

export interface ParaHareketleriParams {
  kurum_id: number;
  sube_id?: number;
  egitim_yili_id?: number;
  baslangic?: string;
  bitis?: string;
  kaynak?: string;
  yon?: string;
  mali_hesap_id?: number;
  islem_yapan_id?: number;
  arama?: string;
  page?: number;
  page_size?: number;
}

export const KAYNAK_LABELS: Record<string, string> = {
  tahsilat: "Tahsilat",
  tahsilat_iptal: "Tahsilat İptal",
  iade: "İade",
  gider: "Gider Ödemesi",
  gider_iptal: "Gider İptal",
  gelir: "Gelir Tahsilatı",
  gelir_iptal: "Gelir İptal",
  avans: "Cari Ödeme",
  mahsup: "Cari Mahsup",
  devir: "Dönem Devri",
  manuel: "Manuel Düzeltme",
  acilis: "Açılış Bakiyesi",
  transfer: "Hesaplar Arası Transfer",
};

export interface HesapTransferi {
  id: number;
  kaynak_hesap: { id: number; ad: string };
  hedef_hesap: { id: number; ad: string };
  tutar: number;
  transfer_turu: string;
  transfer_turu_label: string;
  transfer_tarihi: string;
  aciklama: string;
  islem_yapan: string | null;
  created_at: string | null;
}

export interface HesapTransferiCreatePayload {
  kaynak_hesap_id: number;
  hedef_hesap_id: number;
  tutar: number;
  transfer_tarihi: string;
  transfer_turu?: "virman" | "kasadan_bankaya" | "bankadan_kasaya";
  egitim_yili_id?: number;
  aciklama?: string;
  odeme_yontemi_id?: number;
  kesinti_turu?: string;
  kesinti_tutar?: number;
  kesinti_aciklama?: string;
}

export interface GunSonuKirilim {
  tip: string;
  label: string;
  toplam: number;
  adet: number;
}

export interface GunSonuOzet {
  gun: string;
  tahsilatlar: { kirilim: GunSonuKirilim[]; toplam: number; adet: number };
  odemeler: { kirilim: GunSonuKirilim[]; toplam: number; adet: number };
  iade_toplam: number;
  net: number;
  kasada_beklenen: number;
  banka_bakiye: number;
  kart_bekleyen: number;
  hesap_bakiyeleri: {
    id: number;
    ad: string;
    tip: string;
    tip_label: string;
    sube_ad: string;
    bakiye: number;
  }[];
  ozet_rapor?: GunSonuOzetRapor;
}

export interface GunSonuOzetRaporMeta {
  marka: string;
  baslik: string;
  tarih: string;
  tarih_iso: string;
  sube: string;
  sube_id?: number | null;
  hazirlayan: string;
  olusturulma: string;
  kurum_ad: string;
}

export interface GunSonuOzetRapor {
  meta: GunSonuOzetRaporMeta;
  gunluk_ozet: {
    toplam_tahsilat: number;
    toplam_alinan?: number;
    toplam_iade: number;
    toplam_gelir: number;
    toplam_gider: number;
    net_nakit_girisi: number;
    net_gunluk_finansal_sonuc?: number;
  };
  tahsilat_dagilimi: { tip: string; label: string; tutar: number; adet: number | null }[];
  tahsilat_ozeti?: { tip: string; label: string; tutar: number; adet: number; yuzde?: number; is_total?: boolean }[];
  islem_sayilari: {
    tahsilat: number;
    gelir_kaydi: number;
    gider_kaydi: number;
    iade: number;
    iptal: number;
  };
  kullanici_ozeti: { personel: string; tahsilat: number; gelir: number; gider: number }[];
  notlar: string;
}

export interface GunSonuDetayRapor {
  meta: GunSonuOzetRaporMeta & { rapor_turu?: string };
  kapak: {
    baslik: string;
    kurum_ad: string;
    sube: string;
    tarih: string;
    hazirlayan: string;
  };
  yonetici_ozeti?: {
    yeni_ogrenci: number;
    yeni_sozlesme: number;
    tahsilat: number;
    gelir: number;
    gider: number;
    iade: number;
    iptal: number;
    gecikmeye_dusen_yeni_taksit: number;
    bekleyen_tahsilatlar: number;
    kesilen_fatura: number;
  };
  uyarilar?: { seviye: string; mesaj: string }[];
  ozet: GunSonuOzetRapor["gunluk_ozet"];
  gunluk_finans_ozeti?: {
    toplam_sozlesme_tutari: number;
    gunluk_tahsilat: number;
    gunluk_gelir: number;
    gunluk_gider: number;
    gunluk_iade: number;
    gunluk_iskonto: number;
    bekleyen_tahsilatlar: number;
    net_gunluk_finansal_sonuc: number;
  };
  tahsilat_ozeti?: { tip: string; label: string; tutar: number; adet: number; yuzde?: number; is_total?: boolean }[];
  tahsilat_listesi: {
    saat: string;
    sozlesme_no?: string;
    makbuz: string;
    ogrenci: string;
    veli: string;
    taksit_no?: string | number;
    odeme_donemi?: string;
    odeme_turu: string;
    tutar: number;
    personel: string;
    aciklama?: string;
  }[];
  gelir_hareketleri: {
    saat: string;
    gelir_kodu: string;
    kategori: string;
    aciklama: string;
    kasa?: string;
    odeme_turu?: string;
    belge_no?: string;
    tutar: number;
    personel: string;
  }[];
  gider_hareketleri: {
    saat: string;
    gider_kodu: string;
    kategori: string;
    cari?: string;
    odeme_turu?: string;
    kasa?: string;
    aciklama: string;
    onaylayan?: string;
    tutar: number;
    personel: string;
  }[];
  cari_hareketleri: { cari: string; borc: number; alacak: number; bakiye: number }[];
  ogrenci_hareketleri?: {
    yeni_on_kayit: { ogrenci: string; tarih: string; giris_turu?: string }[];
    yeni_kesin_kayit: { ogrenci: string; tarih: string; giris_turu?: string }[];
    kayit_iptalleri: { ogrenci: string; tarih: string; aciklama: string }[];
    nakil_islemleri: { ogrenci: string; tarih: string; aciklama: string }[];
    ayrilan_ogrenciler: { ogrenci: string; tarih: string; aciklama: string }[];
    ozet: Record<string, number>;
  };
  iptal_islemleri: {
    saat: string;
    islem_no: string;
    islem_turu?: string;
    eski_tutar?: number;
    yeni_durum?: string;
    tur: string;
    sebep: string;
    kullanici: string;
    tutar?: number;
  }[];
  iade_islemleri: {
    saat: string;
    ogrenci: string;
    iade_nedeni?: string;
    tutar: number;
    iade_tarihi?: string;
    onaylayan?: string;
    kullanici?: string;
    aciklama: string;
  }[];
  odeme_turu_dagilimi: {
    ozet: { tip: string; label: string; tutar: number; adet: number | null; yuzde?: number }[];
    detay: { kaynak: string; saat: string; odeme_turu: string; tutar: number; aciklama: string }[];
  };
  kategori_gelirler: { kategori: string; tutar: number; is_total?: boolean }[];
  kategori_giderler: { kategori: string; tutar: number; is_total?: boolean }[];
  personel_performans?: {
    personel: string;
    tahsilat_sayisi: number;
    tahsilat_tutari: number;
    gelir_sayisi: number;
    gider_sayisi: number;
    iade_sayisi: number;
    iptal_sayisi: number;
    toplam_islem: number;
  }[];
  kullanici_islem_detayi: {
    personel: string;
    islemler: { saat: string; tur: string; aciklama: string; tutar: number }[];
    toplam: number;
    adet: number;
  }[];
  kasa_hareketleri?: {
    saat: string;
    kasa: string;
    yon: string;
    kaynak: string;
    tutar: number;
    aciklama: string;
    personel: string;
  }[];
  banka_hareketleri?: {
    havale: number;
    eft: number;
    banka_girisleri: number;
    banka_cikislari: number;
    banka_bazli_toplamlar: { banka: string; giris: number; cikis: number; net: number }[];
    detay: { saat: string; banka: string; yon: string; tur: string; tutar: number; aciklama: string }[];
  };
  pos_hareketleri?: {
    pos_cihazi: string;
    banka: string;
    kart_turu: string;
    tutar: number;
    islem_sayisi: number;
  }[];
  kasa_ozeti: {
    acilis_kasa: number;
    nakit_tahsilatlar?: number;
    nakit_gelirler?: number;
    nakit_giderler?: number;
    nakit_iadeler?: number;
    kasaya_para_girisi?: number;
    kasadan_para_cikisi?: number;
    bankaya_aktarim?: number;
    bankadan_kasaya_aktarim?: number;
    kasa_virmanlari?: number;
    gunluk_giris: number;
    gunluk_cikis: number;
    beklenen_kasa: number;
    sayilan_kasa: number | null;
    kasa_farki: number;
    sayim_yapildi?: boolean;
    not?: string;
  };
  grafikler?: {
    odeme_turu_dagilimi: { label: string; tutar: number }[];
    gelir_dagilimi: { label: string; tutar: number }[];
    gider_dagilimi: { label: string; tutar: number }[];
    saatlik_tahsilat: { saat: string; tutar: number }[];
  };
  sistem: {
    olusturulma_tarihi: string;
    raporu_olusturan: string;
    sube: string;
    tarih: string;
  };
  notlar: string;
  islem_sayilari?: GunSonuOzetRapor["islem_sayilari"];
}

export interface GunSonuDetayResponse extends GunSonuOzet {
  detay_rapor: GunSonuDetayRapor;
}

export interface GunSonuWhatsappRecipient {
  id: number;
  ad_soyad: string;
  rol: string;
  telefon: string;
  telefon_maskeli: string;
  mali_hesap_ad: string;
}

export interface GunSonuWhatsappPreviewResponse {
  recipients: GunSonuWhatsappRecipient[];
  count: number;
  warning: string | null;
}

export interface GunSonuWhatsappSendResponse {
  success: boolean;
  sent: number;
  total: number;
  errors: string[];
  results: {
    recipient_id: number;
    ad_soyad: string;
    telefon_maskeli: string;
    success: boolean;
    errors: string[];
  }[];
}

export interface VadesiGelenTaksit {
  id: number;
  taksit_no: number;
  vade_tarihi: string | null;
  tutar: number;
  odenen_tutar: number;
  kalan_tutar: number;
  durum: string;
  sozlesme_no: string;
  ogrenci_adi: string;
  veli_adi: string;
  sozlesme_id: number;
  kalan_gun: number | null;
}

export type VadesiGelenlerDonem = "bugun" | "yarin" | "hafta" | "ay";

export interface VadesiGelenlerResponse {
  donem: VadesiGelenlerDonem;
  baslangic: string;
  bitis: string;
  sonuclar: VadesiGelenTaksit[];
  toplam_tutar: number;
  adet: number;
}
