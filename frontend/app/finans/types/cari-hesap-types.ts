// ─── Cari Hesap & Cari Hareket Types ────────────────────────────

export type CariHesapTuru = 'musteri' | 'tedarikci' | 'karma';

export interface CariHesap {
  id: number;
  kurum_id: number;
  unvan: string;
  kisa_ad: string;
  gorunen_ad: string;
  hesap_turu: CariHesapTuru;
  hesap_turu_display: string;
  hesap_kodu: string;
  gider_kategorileri: { id: number; ad: string }[];
  gelir_kategorileri: { id: number; ad: string }[];
  vergi_no: string;
  vergi_dairesi: string;
  telefon: string;
  email: string;
  adres: string;
  il: string;
  ilce: string;
  yetkili_kisi: string;
  yetkili_telefon: string;
  banka_adi: string;
  iban: string;
  hesap_sahibi: string;
  toplam_borc: number;
  toplam_alacak: number;
  bakiye: number;
  bakiye_durumu: 'alacakli' | 'borclu' | 'dengede';
  serbest_bakiye: number;
  gider_borcu: number;
  toplam_gider: number;
  toplam_gelir: number;
  gelir_alacagi: number;
  tahsil_edilen_gelir: number;
  gider_kayit_sayisi: number;
  gelir_kayit_sayisi: number;
  notlar: string;
  aktif_mi: boolean;
  created_at: string;
  updated_at: string;
}

export interface CariHesapListItem {
  id: number;
  unvan: string;
  kisa_ad: string;
  gorunen_ad: string;
  hesap_turu: CariHesapTuru;
  hesap_turu_display: string;
  hesap_kodu: string;
  vergi_no: string;
  telefon: string;
  email: string;
  yetkili_kisi?: string;
  il?: string;
  ilce?: string;
  toplam_borc: number;
  toplam_alacak: number;
  bakiye: number;
  bakiye_durumu: string;
  toplam_satis?: number;
  toplam_alis?: number;
  toplam_tahsilat?: number;
  toplam_odeme?: number;
  toplam_iade?: number;
  toplam_mahsup?: number;
  son_islem_tarihi?: string | null;
  aktif_mi: boolean;
  created_at: string;
}

/** Kurum geneli cari bakiye / vade rapor satırı */
export interface CariHesapRaporItem {
  id: number;
  hesap_kodu: string;
  unvan: string;
  gorunen_ad: string;
  hesap_turu: CariHesapTuru;
  hesap_turu_display: string;
  aktif_mi: boolean;
  toplam_borc: number;
  toplam_alacak: number;
  bakiye: number;
  bakiye_durumu: string;
  toplam_satis?: number;
  toplam_alis?: number;
  toplam_tahsilat?: number;
  toplam_odeme?: number;
  toplam_iade?: number;
  toplam_mahsup?: number;
  vadesi_gelen: number;
  vadesi_gecmis: number;
  gelecek_vadeli: number;
  son_islem_tarihi: string | null;
  son_islem_turu: string | null;
  son_islem_yapan: string | null;
}

export interface CariHesapCreatePayload {
  kurum_id: number;
  unvan: string;
  kisa_ad?: string;
  hesap_turu: CariHesapTuru;
  hesap_kodu?: string;
  gider_kategorileri?: number[];
  gelir_kategorileri?: number[];
  vergi_no?: string;
  vergi_dairesi?: string;
  telefon?: string;
  email?: string;
  adres?: string;
  il?: string;
  ilce?: string;
  yetkili_kisi?: string;
  yetkili_telefon?: string;
  banka_adi?: string;
  iban?: string;
  hesap_sahibi?: string;
  notlar?: string;
}

export interface CariHesapUpdatePayload {
  unvan?: string;
  kisa_ad?: string;
  hesap_turu?: CariHesapTuru;
  hesap_kodu?: string;
  gider_kategorileri?: number[];
  gelir_kategorileri?: number[];
  vergi_no?: string;
  vergi_dairesi?: string;
  telefon?: string;
  email?: string;
  adres?: string;
  il?: string;
  ilce?: string;
  yetkili_kisi?: string;
  yetkili_telefon?: string;
  banka_adi?: string;
  iban?: string;
  hesap_sahibi?: string;
  notlar?: string;
  aktif_mi?: boolean;
}

export interface CariHesapDropdownItem {
  id: number;
  unvan: string;
  kisa_ad: string;
  gorunen_ad: string;
  hesap_turu: CariHesapTuru;
  gider_kategorileri: number[];
  gelir_kategorileri: number[];
}

export interface CariHesapCariOzet {
  id: number;
  hesap_kodu?: string;
  unvan: string;
  gorunen_ad?: string;
  hesap_turu: CariHesapTuru;
  toplam_borc: number;
  toplam_alacak: number;
  bakiye: number;
  bakiye_durumu: string;
  vadesi_gelen: number;
  vadesi_gecmis: number;
  gelecek_vadeli: number;
  vadesi_gelen_odeme?: number;
  vadesi_gelen_tahsilat?: number;
  vadesi_gecmis_odeme?: number;
  vadesi_gecmis_tahsilat?: number;
  gelecek_vadeli_odeme?: number;
  gelecek_vadeli_tahsilat?: number;
  son_islem_tarihi: string | null;
  son_islem_turu: string | null;
  son_islem_yapan: string | null;
}

export interface CariHareket {
  id: number;
  cari_hesap_id: number;
  cari_hesap_unvan: string;
  islem_turu: string;
  islem_turu_display: string;
  yon: 'borc' | 'alacak';
  yon_display: string;
  tutar: number;
  borc_oncesi: number;
  alacak_oncesi: number;
  borc_sonrasi: number;
  alacak_sonrasi: number;
  bakiye_oncesi: number;
  bakiye_sonrasi: number;
  kaynak_tip: string;
  kaynak_id: number | null;
  kategori_adi?: string | null;
  odeme_yontemi_adi?: string | null;
  odeme_yontemi_tip?: string | null;
  aciklama: string;
  belge_no: string;
  islem_tarihi: string;
  islem_yapan_adi: string | null;
  created_at: string;
}

export interface CariDosya {
  id: number;
  dosya_adi: string;
  dosya_turu: string;
  dosya_turu_display: string;
  dosya_url: string | null;
  aciklama: string;
  dosya_boyutu: number;
  dosya_boyutu_fmt: string;
  yukleyen_adi: string | null;
  created_at: string;
}

export const HESAP_TURLERI = [
  { value: 'musteri' as const, label: 'Müşteri', color: 'bg-blue-100 text-blue-700', icon: '👤' },
  { value: 'tedarikci' as const, label: 'Tedarikçi', color: 'bg-violet-100 text-violet-700', icon: '🏢' },
  { value: 'karma' as const, label: 'Karma', color: 'bg-amber-100 text-amber-700', icon: '🔄' },
] as const;

/** Hesap türüne göre alım/satım yetenekleri */
export const CARI_ISLEM_YETKI = {
  musteri: { alim: false, satim: true, islemLabel: 'Satış' },
  tedarikci: { alim: true, satim: false, islemLabel: 'Alım' },
  karma: { alim: true, satim: true, islemLabel: 'Alım & Satış' },
} as const;

export function cariTabGorunur(
  tab: 'giderler' | 'gelirler' | 'odemeler',
  hesapTuru: CariHesapTuru
): boolean {
  const y = CARI_ISLEM_YETKI[hesapTuru];
  if (tab === 'giderler' || tab === 'odemeler') return y.alim;
  if (tab === 'gelirler') return y.satim;
  return true;
}

export const BAKIYE_DURUMU_META = {
  alacakli: {
    label: 'Alacak',
    short: 'A',
    hint: 'Tahsil edilecek tutar',
    color: '#059669',
    bg: '#ecfdf5',
    border: '#a7f3d0',
    className: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  },
  borclu: {
    label: 'Verecek',
    short: 'V',
    hint: 'Ödenecek tutar',
    color: '#dc2626',
    bg: '#fff1f2',
    border: '#fecdd3',
    className: 'bg-rose-50 text-rose-700 border-rose-200',
  },
  dengede: {
    label: 'Dengede',
    short: '—',
    hint: 'Kapalı bakiye',
    color: '#64748b',
    bg: '#f8fafc',
    border: '#e2e8f0',
    className: 'bg-slate-50 text-slate-600 border-slate-200',
  },
} as const;

/** Liste/detay sütun tutarları */
export const CARI_TUTAR_META = {
  borc: {
    label: 'Borç',
    short: 'B',
    hint: 'Borç yönlü hareketler toplamı (satış, ödeme vb.)',
    color: '#dc2626',
    bg: '#fff1f2',
    border: '#fecdd3',
  },
  alacak: {
    label: 'Alacak',
    short: 'A',
    hint: 'Alacak yönlü hareketler toplamı (tahsilat, alış vb.)',
    color: '#059669',
    bg: '#ecfdf5',
    border: '#a7f3d0',
  },
  /** @deprecated Eski sütun adı — borc kullanın */
  odenen: {
    label: 'Borç',
    short: 'B',
    hint: 'Borç yönlü hareketler toplamı',
    color: '#dc2626',
    bg: '#fff1f2',
    border: '#fecdd3',
  },
  /** @deprecated Eski sütun adı — alacak kullanın */
  alis: {
    label: 'Alacak',
    short: 'A',
    hint: 'Alacak yönlü hareketler toplamı',
    color: '#059669',
    bg: '#ecfdf5',
    border: '#a7f3d0',
  },
} as const;
